import { spawn, type ChildProcess } from "node:child_process";
import {
  chmod,
  lstat,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "vite";
import { agentSocketPaths } from "../shared/agent-endpoint.js";

type ChildMessage = { phase: "beforePublish" | "ready" | "failed"; code?: string };
const children = new Set<ChildProcess>();
const directories: string[] = [];
let bundlePath: string;
let runnerPath: string;

function waitFor(
  child: ChildProcess,
  phase: ChildMessage["phase"]
): Promise<ChildMessage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => finish(new Error(`Timed out waiting for ${phase}`)),
      5_000
    );
    const onMessage = (message: ChildMessage) => {
      if (message.phase === phase) finish(undefined, message);
      else if (message.phase === "failed" && phase !== "failed")
        finish(new Error(`Server failed: ${message.code}`));
    };
    const onExit = (code: number | null, signal: NodeJS.Signals | null) =>
      finish(new Error(`Child exited before ${phase}: ${code ?? signal}`));
    const finish = (error?: Error, message?: ChildMessage) => {
      clearTimeout(timeout);
      child.off("message", onMessage);
      child.off("exit", onExit);
      if (error) reject(error);
      else if (message) resolve(message);
      else reject(new Error(`Missing child message for ${phase}`));
    };
    child.on("message", onMessage);
    child.once("exit", onExit);
  });
}

async function start(
  profilePath: string,
  instanceId: string,
  umask: string,
  mode: "normal" | "chmodFails" = "normal"
) {
  const child = spawn(
    process.execPath,
    [runnerPath, bundlePath, JSON.stringify({ profilePath, instanceId, mode })],
    {
      stdio: ["ignore", "ignore", "pipe", "ipc"],
      env: { ...process.env, TEST_AGENT_UMASK: umask }
    }
  );
  children.add(child);
  child.once("exit", () => children.delete(child));
  // Capture diagnostics without ever printing the endpoint token.
  let stderr = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8").slice(0, 1000);
  });
  const message = (phase: ChildMessage["phase"]) =>
    waitFor(child, phase).catch((error: Error) => {
      throw new Error(`${error.message}; stderr: ${stderr}`);
    });
  return { child, message };
}

async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  child.kill("SIGKILL");
  await Promise.race([
    exited,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Child did not exit")), 5_000)
    )
  ]);
}

async function profile() {
  const profilePath = await realpath(
    await mkdtemp(path.join(tmpdir(), "agent-process-profile-"))
  );
  directories.push(profilePath, agentSocketPaths(profilePath).directory);
  return { profilePath, paths: agentSocketPaths(profilePath) };
}

beforeAll(async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "agent-process-bundle-"));
  directories.push(directory);
  const source = fileURLToPath(new URL("./agent-control-server.ts", import.meta.url));
  await build({
    configFile: false,
    root: path.dirname(source),
    logLevel: "silent",
    build: {
      ssr: source,
      outDir: directory,
      emptyOutDir: false,
      rollupOptions: { output: { format: "cjs", entryFileNames: "server.cjs" } }
    }
  });
  bundlePath = path.join(directory, "server.cjs");
  runnerPath = path.join(directory, "runner.cjs");
  await writeFile(
    runnerPath,
    `
const { startAgentControlServer } = require(process.argv[2]);
const { profilePath, instanceId, mode } = JSON.parse(process.argv[3]);
process.umask(Number.parseInt(process.env.TEST_AGENT_UMASK, 8));
const identity = { appVersion: '1.0.0', protocolVersion: 1, instanceId, profilePath, appId: 'com.prof18.difftray', flavor: 'production', executablePath: '/fixture/Difftray' };
startAgentControlServer({
  identity, hasProfileLock: true, dispatch: async () => identity,
  ...(mode === 'chmodFails' ? { setSocketMode: async () => { throw Object.assign(new Error('fixture chmod failure'), { code: 'EACCES' }); } } : {}),
  beforePublish: async () => {
    process.send({ phase: 'beforePublish' });
    await new Promise(resolve => process.once('message', message => { if (message === 'release') resolve(); }));
  },
}).then(() => process.send({ phase: 'ready' }), error => process.send({ phase: 'failed', code: error.code }));
`,
    "utf8"
  );
}, 20_000);

afterAll(async () => {
  await Promise.all([...children].map(stop));
  for (const directory of directories.reverse())
    await rm(directory, { recursive: true, force: true });
});

describe("agent control server process boundaries", () => {
  for (const umask of ["000", "022"]) {
    it(`sets socket mode 0600 before publishing with umask ${umask}`, async () => {
      const { profilePath, paths } = await profile();
      const server = await start(profilePath, `umask-${umask}`, umask);
      try {
        await server.message("beforePublish");
        expect((await lstat(paths.socketPath)).mode & 0o777).toBe(0o600);
        await expect(stat(paths.endpointPath)).rejects.toMatchObject({ code: "ENOENT" });
        const ready = server.message("ready");
        server.child.send("release");
        await ready;
        expect((await lstat(paths.endpointPath)).mode & 0o777).toBe(0o600);
      } finally {
        await stop(server.child);
      }
    });
  }

  it("does not advertise an endpoint and removes its socket when chmod fails", async () => {
    const { profilePath, paths } = await profile();
    const server = await start(profilePath, "chmod-failure", "000", "chmodFails");
    try {
      await server.message("failed");
      await expect(stat(paths.endpointPath)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(stat(paths.socketPath)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await stop(server.child);
    }
  });

  it("retires a crashed generation before its replacement is published", async () => {
    const { profilePath, paths } = await profile();
    const old = await start(profilePath, "old-generation", "022");
    const oldPaused = old.message("beforePublish");
    await oldPaused;
    const oldReady = old.message("ready");
    old.child.send("release");
    await oldReady;
    const previous = await readFile(paths.endpointPath, "utf8");
    await stop(old.child);
    const replacement = await start(profilePath, "new-generation", "022");
    try {
      await replacement.message("beforePublish");
      expect((await lstat(paths.socketPath)).isSocket()).toBe(true);
      await expect(stat(paths.endpointPath)).rejects.toMatchObject({ code: "ENOENT" });
      const ready = replacement.message("ready");
      replacement.child.send("release");
      await ready;
      expect(JSON.parse(await readFile(paths.endpointPath, "utf8")).instanceId).toBe(
        "new-generation"
      );
      expect(await readFile(paths.endpointPath, "utf8")).not.toBe(previous);
    } finally {
      await stop(replacement.child);
    }
  });

  it("preserves unsafe existing metadata when startup rejects it", async () => {
    const { profilePath, paths } = await profile();
    const old = await start(profilePath, "unsafe-generation", "022");
    await old.message("beforePublish");
    const ready = old.message("ready");
    old.child.send("release");
    await ready;
    await stop(old.child);
    await chmod(paths.endpointPath, 0o644);
    const previous = await readFile(paths.endpointPath, "utf8");
    const replacement = await start(profilePath, "replacement", "022");
    try {
      await replacement.message("failed");
      expect(await readFile(paths.endpointPath, "utf8")).toBe(previous);
      expect((await lstat(paths.endpointPath)).mode & 0o777).toBe(0o644);
    } finally {
      await stop(replacement.child);
    }
  });
});
