import { afterEach, describe, expect, it, vi } from "vitest";
import { chmod, mkdtemp, realpath, rm } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

const race = vi.hoisted(() => ({
  endpointPath: "",
  vanishOn: "" as "" | "open" | "lstat"
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  let endpointLstats = 0;
  const vanished = () =>
    Object.assign(new Error("ENOENT: no such file or directory"), { code: "ENOENT" });
  return {
    ...actual,
    lstat: vi.fn(async (target: Parameters<typeof actual.lstat>[0]) => {
      if (String(target) === race.endpointPath && race.vanishOn === "lstat") {
        endpointLstats += 1;
        // The desktop retires the file after the first check passed.
        if (endpointLstats === 2) throw vanished();
      }
      return actual.lstat(target);
    }),
    open: vi.fn(async (...args: Parameters<typeof actual.open>) => {
      if (String(args[0]) === race.endpointPath && race.vanishOn === "open")
        throw vanished();
      return actual.open(...args);
    })
  };
});

const {
  agentSocketPaths,
  ensureAgentDirectory,
  publishAgentEndpoint,
  readAgentEndpoint
} = await import("./agent-endpoint.js");

const roots: string[] = [];
const servers: net.Server[] = [];

afterEach(async () => {
  race.vanishOn = "";
  for (const server of servers.splice(0))
    await new Promise<void>((resolve) => server.close(() => resolve()));
  for (const root of roots.splice(0)) {
    await rm(agentSocketPaths(root).directory, { force: true, recursive: true });
    await rm(root, { force: true, recursive: true });
  }
});

async function publishedProfile(): Promise<string> {
  const profilePath = await realpath(
    await mkdtemp(path.join(tmpdir(), "difftray-race-"))
  );
  roots.push(profilePath);
  await ensureAgentDirectory(profilePath);
  const paths = agentSocketPaths(profilePath);
  const server = net.createServer();
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(paths.socketPath, resolve));
  await chmod(paths.socketPath, 0o600);
  await publishAgentEndpoint({
    appVersion: "1.2.3",
    protocolVersion: 1,
    instanceId: "instance-race-1",
    profilePath,
    appId: "com.prof18.difftray.dev",
    flavor: "dev",
    executablePath: "/tmp/difftray-test",
    token: "a".repeat(64),
    socketPath: paths.socketPath
  });
  race.endpointPath = paths.endpointPath;
  return profilePath;
}

describe("agent endpoint reads during republication", () => {
  it.each(["open", "lstat"] as const)(
    "treats metadata that vanishes at %s as not yet published",
    async (vanishOn) => {
      const profilePath = await publishedProfile();
      race.vanishOn = vanishOn;

      await expect(
        readAgentEndpoint(profilePath, { requireSocket: false })
      ).resolves.toBeNull();
    }
  );
});
