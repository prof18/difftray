import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import {
  lstat,
  mkdtemp,
  readdir,
  realpath,
  rm,
  utimes,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "vite";
import { agentSocketPaths } from "../shared/agent-endpoint.js";

type Reply = { id: number; acquired?: boolean; code?: string };
type Claimant = {
  child: ChildProcess;
  command: (command: "claim" | "release") => Promise<Reply>;
};
const children = new Set<ChildProcess>();
const directories: string[] = [];
let bundlePath: string;
let runnerPath: string;
function reply(child: ChildProcess, id: number): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const finish = (error?: Error, value?: Reply) => {
      clearTimeout(timer);
      child.off("message", onMessage);
      child.off("exit", onExit);
      child.off("error", onError);
      if (error) reject(error);
      else if (value) resolve(value);
    };
    const onMessage = (value: Reply) => {
      if (value.id !== id) return;
      if (value.code) finish(new Error(`Fixture claim failed: ${value.code}`));
      else finish(undefined, value);
    };
    const onExit = () => finish(new Error("Fixture claimant exited before reply"));
    const onError = (error: Error) => finish(error);
    const timer = setTimeout(
      () => finish(new Error("Fixture claimant reply timed out")),
      5_000
    );
    child.on("message", onMessage);
    child.once("exit", onExit);
    child.once("error", onError);
  });
}
async function start(profile: string, umask = "022"): Promise<Claimant> {
  const child = spawn(process.execPath, [runnerPath, bundlePath, profile, umask], {
    stdio: ["ignore", "ignore", "ignore", "ipc"]
  });
  children.add(child);
  child.once("exit", () => children.delete(child));
  await reply(child, 0);
  let id = 0;
  return {
    child,
    command: async (command) => {
      const requestId = ++id;
      const pending = reply(child, requestId);
      child.send({ id: requestId, command });
      return pending;
    }
  };
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Fixture claimant shutdown timed out")),
      5_000
    );
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill("SIGKILL");
  });
}
async function profile() {
  const profilePath = await realpath(
    await mkdtemp(path.join(tmpdir(), "agent-startup-process-profile-"))
  );
  const directory = agentSocketPaths(profilePath).directory;
  directories.push(profilePath, directory);
  return { profilePath, claimPath: path.join(directory, "startup"), directory };
}
async function ageClaim(claimPath: string) {
  const entries = await readdir(claimPath);
  expect(entries).toHaveLength(1);
  const filename = entries[0];
  assert.ok(filename);
  const old = new Date(Date.now() - 120_000);
  await utimes(path.join(claimPath, filename), old, old);
  return filename;
}
beforeAll(async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "agent-startup-process-bundle-"));
  directories.push(directory);
  const source = fileURLToPath(new URL("./agent-startup-lock.ts", import.meta.url));
  await build({
    configFile: false,
    root: path.dirname(source),
    logLevel: "silent",
    build: {
      ssr: source,
      outDir: directory,
      emptyOutDir: false,
      rollupOptions: { output: { format: "cjs", entryFileNames: "startup.cjs" } }
    }
  });
  bundlePath = path.join(directory, "startup.cjs");
  runnerPath = path.join(directory, "runner.cjs");
  await writeFile(
    runnerPath,
    `
const { acquireAgentStartup } = require(process.argv[2]);
const profile = process.argv[3];
process.umask(Number.parseInt(process.argv[4], 8));
let release;
process.on('message', async ({ id, command }) => {
 try {
  if (command === 'claim') {
   if (release) throw Object.assign(new Error('Already claimed'), { code: 'FIXTURE_ALREADY_CLAIMED' });
   release = await acquireAgentStartup(profile);
   process.send({ id, acquired: Boolean(release) });
  } else {
   if (release) await release();
   release = undefined;
   process.send({ id });
  }
 } catch (error) { process.send({ id, code: error.code || error.name }); }
});
process.send({ id: 0 });
`
  );
}, 20_000);
afterAll(async () => {
  await Promise.all([...children].map(stop));
  for (const directory of directories.reverse())
    await rm(directory, { recursive: true, force: true });
});
describe("agent startup lock cross-process ownership", () => {
  for (const umask of ["000", "022"]) {
    it(`permits exactly one simultaneous claimant with umask ${umask}`, async () => {
      const fixture = await profile();
      const claimants: Claimant[] = [];
      try {
        claimants.push(
          ...(await Promise.all(
            Array.from({ length: 6 }, () => start(fixture.profilePath, umask))
          ))
        );
        const outcomes = await Promise.all(
          claimants.map((claimant) => claimant.command("claim"))
        );
        expect(outcomes.filter((outcome) => outcome.acquired)).toHaveLength(1);
        expect((await lstat(fixture.directory)).mode & 0o777).toBe(0o700);
        expect((await lstat(fixture.claimPath)).mode & 0o777).toBe(0o700);
        const entries = await readdir(fixture.claimPath);
        expect(entries).toHaveLength(1);
        const filename = entries[0];
        assert.ok(filename);
        expect((await lstat(path.join(fixture.claimPath, filename))).mode & 0o777).toBe(
          0o600
        );
        const winnerIndex = outcomes.findIndex((outcome) => outcome.acquired);
        const winner = claimants[winnerIndex];
        assert.ok(winner);
        expect(filename).toMatch(new RegExp(`^owner-${winner.child.pid}-`));
        const loser = claimants.find((_, index) => index !== winnerIndex);
        assert.ok(loser);
        expect((await loser.command("claim")).acquired).toBe(false);
        await winner.command("release");
        expect((await loser.command("claim")).acquired).toBe(true);
        await loser.command("release");
        await expect(lstat(fixture.claimPath)).rejects.toMatchObject({ code: "ENOENT" });
      } finally {
        await Promise.all(claimants.map((claimant) => stop(claimant.child)));
      }
    });
  }
  it("preserves a live process's claim even when its owner metadata is old", async () => {
    const fixture = await profile();
    const owner = await start(fixture.profilePath);
    const contender = await start(fixture.profilePath);
    try {
      expect((await owner.command("claim")).acquired).toBe(true);
      const filename = await ageClaim(fixture.claimPath);
      expect((await contender.command("claim")).acquired).toBe(false);
      expect(await readdir(fixture.claimPath)).toEqual([filename]);
      await owner.command("release");
      expect((await contender.command("claim")).acquired).toBe(true);
    } finally {
      await Promise.all([stop(owner.child), stop(contender.child)]);
    }
  });
  it("retains a recent dead claim for warmup, then reclaims the old dead owner", async () => {
    const fixture = await profile();
    const owner = await start(fixture.profilePath);
    const contender = await start(fixture.profilePath);
    try {
      expect((await owner.command("claim")).acquired).toBe(true);
      const names = await readdir(fixture.claimPath);
      await stop(owner.child);
      expect((await contender.command("claim")).acquired).toBe(false);
      expect(await readdir(fixture.claimPath)).toEqual(names);
      await ageClaim(fixture.claimPath);
      expect((await contender.command("claim")).acquired).toBe(false);
      await expect(lstat(fixture.claimPath)).rejects.toMatchObject({ code: "ENOENT" });
      expect((await contender.command("claim")).acquired).toBe(true);
      const replacement = await readdir(fixture.claimPath);
      expect(replacement).toHaveLength(1);
      expect(replacement[0]).toMatch(new RegExp(`^owner-${contender.child.pid}-`));
      expect(replacement).not.toEqual(names);
      await contender.command("release");
    } finally {
      await Promise.all([stop(owner.child), stop(contender.child)]);
    }
  });
});
