import { afterEach, describe, expect, it } from "vitest";
import {
  chmod,
  lstat,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import {
  agentSocketPaths,
  ensureAgentDirectory,
  publishAgentEndpoint,
  readAgentEndpoint,
  removeAgentEndpoint,
  type AgentEndpoint
} from "./agent-endpoint.js";

const profileRoots: string[] = [];
const socketDirectories: string[] = [];
const servers: net.Server[] = [];
const createdSocketPaths: string[] = [];
const uid = typeof process.getuid === "function" ? process.getuid() : undefined;

async function profile(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "difftray-agent-endpoint-"));
  profileRoots.push(root);
  const canonical = await realpath(root);
  socketDirectories.push(agentSocketPaths(canonical).directory);
  return canonical;
}

async function liveSocket(socketPath: string): Promise<void> {
  const server = net.createServer();
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  await chmod(socketPath, 0o600);
  createdSocketPaths.push(socketPath);
}

function endpoint(profilePath: string, socketPath: string): AgentEndpoint {
  return {
    appVersion: "1.2.3",
    protocolVersion: 1,
    instanceId: "instance-test-1",
    profilePath,
    appId: "com.prof18.difftray.dev",
    flavor: "dev",
    executablePath: "/tmp/difftray-test",
    token: "a".repeat(64),
    socketPath
  };
}

afterEach(async () => {
  for (const server of servers.splice(0))
    await new Promise<void>((resolve) => server.close(() => resolve()));
  for (const socketPath of createdSocketPaths.splice(0))
    await rm(socketPath, { force: true });
  for (const directory of socketDirectories.splice(0))
    await rm(directory, { recursive: true, force: true });
  for (const root of profileRoots.splice(0))
    await rm(root, { recursive: true, force: true });
});

describe("agent endpoint filesystem contract", () => {
  it("derives a short socket path from uid and canonical profile identity", async () => {
    const profilePath = await profile();
    const paths = agentSocketPaths(profilePath, uid);
    expect(paths.directory).toBe(path.dirname(paths.socketPath));
    expect(path.dirname(paths.endpointPath)).toBe(paths.directory);
    expect(path.basename(paths.endpointPath)).toBe("endpoint.json");
    expect(Buffer.byteLength(paths.socketPath)).toBeLessThan(100);
    expect(paths.socketPath).not.toContain(profilePath);
    expect(agentSocketPaths(profilePath, uid)).toEqual(paths);
    expect(agentSocketPaths(`${profilePath}-other`, uid).socketPath).not.toBe(
      paths.socketPath
    );
  });

  it("creates a private directory and accepts an existing owned 0700 directory", async () => {
    const profilePath = await profile();
    const paths = await ensureAgentDirectory(profilePath);
    expect(paths).toEqual(agentSocketPaths(profilePath, uid));
    expect((await lstat(paths.directory)).mode & 0o777).toBe(0o700);
    expect((await ensureAgentDirectory(profilePath)).directory).toBe(paths.directory);
  });

  it("rejects a symlink or incorrectly permissioned endpoint directory", async () => {
    const profilePath = await profile();
    const paths = agentSocketPaths(profilePath, uid);
    const { mkdir } = await import("node:fs/promises");
    await mkdir(path.dirname(paths.directory), { recursive: true });
    await symlink(profilePath, paths.directory);
    await expect(ensureAgentDirectory(profilePath)).rejects.toThrow();

    await rm(paths.directory, { force: true });
    await mkdir(paths.directory, { mode: 0o755 });
    await chmod(paths.directory, 0o755);
    await expect(ensureAgentDirectory(profilePath)).rejects.toThrow();
  });

  it("publishes metadata atomically with 0600 mode only for a private live socket", async () => {
    const profilePath = await profile();
    const paths = await ensureAgentDirectory(profilePath);
    await liveSocket(paths.socketPath);
    const value = endpoint(profilePath, paths.socketPath);
    await publishAgentEndpoint(value);
    expect((await lstat(paths.endpointPath)).mode & 0o777).toBe(0o600);
    expect(await readAgentEndpoint(profilePath)).toEqual(value);
    expect(JSON.parse(await readFile(paths.endpointPath, "utf8"))).toEqual(value);
  });

  it("requires a real socket by default and allows validated recovery reads without one", async () => {
    const profilePath = await profile();
    const paths = await ensureAgentDirectory(profilePath);
    const value = endpoint(profilePath, paths.socketPath);
    await writeFile(paths.endpointPath, JSON.stringify(value), { mode: 0o600 });
    await chmod(paths.endpointPath, 0o600);
    await expect(readAgentEndpoint(profilePath)).rejects.toThrow();
    await expect(
      readAgentEndpoint(profilePath, { requireSocket: false })
    ).resolves.toEqual(value);
  });

  it("returns null only when metadata is absent", async () => {
    const profilePath = await profile();
    await ensureAgentDirectory(profilePath);
    await expect(readAgentEndpoint(profilePath)).resolves.toBeNull();
  });

  it("rejects symlink, non-regular, wrong-mode, and unknown-key metadata", async () => {
    const profilePath = await profile();
    const paths = await ensureAgentDirectory(profilePath);
    const value = endpoint(profilePath, paths.socketPath);
    const elsewhere = path.join(profilePath, "metadata.json");
    await writeFile(elsewhere, JSON.stringify(value), { mode: 0o600 });
    await symlink(elsewhere, paths.endpointPath);
    await expect(
      readAgentEndpoint(profilePath, { requireSocket: false })
    ).rejects.toThrow();
    await rm(paths.endpointPath);

    await writeFile(paths.endpointPath, JSON.stringify(value), { mode: 0o644 });
    await chmod(paths.endpointPath, 0o644);
    await expect(
      readAgentEndpoint(profilePath, { requireSocket: false })
    ).rejects.toThrow();
    await chmod(paths.endpointPath, 0o600);
    await writeFile(paths.endpointPath, JSON.stringify({ ...value, unexpected: true }), {
      mode: 0o600
    });
    await expect(
      readAgentEndpoint(profilePath, { requireSocket: false })
    ).rejects.toThrow();
  });

  it("rejects socket paths outside the computed profile endpoint", async () => {
    const profilePath = await profile();
    await ensureAgentDirectory(profilePath);
    const outside = endpoint(profilePath, path.join(tmpdir(), "not-this-profile.sock"));
    await expect(publishAgentEndpoint(outside)).rejects.toThrow();
  });

  it("reports a validated older protocol as unsupported instead of unauthorized", async () => {
    const profilePath = await profile();
    const paths = await ensureAgentDirectory(profilePath);
    await writeFile(
      paths.endpointPath,
      JSON.stringify({ ...endpoint(profilePath, paths.socketPath), protocolVersion: 2 }),
      { mode: 0o600 }
    );
    await chmod(paths.endpointPath, 0o600);
    await expect(
      readAgentEndpoint(profilePath, { requireSocket: false })
    ).rejects.toMatchObject({ code: "unsupported_version" });
  });
  it("continues rejecting unsafe metadata even if its protocol is old", async () => {
    const profilePath = await profile();
    const paths = await ensureAgentDirectory(profilePath);
    await writeFile(
      paths.endpointPath,
      JSON.stringify({
        ...endpoint(profilePath, paths.socketPath),
        protocolVersion: 2,
        unexpected: true
      }),
      { mode: 0o600 }
    );
    await chmod(paths.endpointPath, 0o600);
    await expect(
      readAgentEndpoint(profilePath, { requireSocket: false })
    ).rejects.toMatchObject({ code: "unauthorized" });
  });
  it("removes only metadata matching this instance and token", async () => {
    const profilePath = await profile();
    const paths = await ensureAgentDirectory(profilePath);
    await liveSocket(paths.socketPath);
    const old = endpoint(profilePath, paths.socketPath);
    await publishAgentEndpoint(old);
    const replacement = { ...old, instanceId: "new-generation", token: "b".repeat(64) };
    await writeFile(paths.endpointPath, JSON.stringify(replacement), { mode: 0o600 });
    await chmod(paths.endpointPath, 0o600);
    await expect(removeAgentEndpoint(old)).resolves.toBe(false);
    await expect(readAgentEndpoint(profilePath)).resolves.toEqual(replacement);
    await expect(removeAgentEndpoint(replacement)).resolves.toBe(true);
    await expect(
      readAgentEndpoint(profilePath, { requireSocket: false })
    ).resolves.toBeNull();
  });
});
