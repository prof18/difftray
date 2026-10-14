import { chmod, lstat, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  startAgentControlServer,
  type AgentControlServerOptions
} from "./agent-control-server.js";
import {
  agentSocketPaths,
  ensureAgentDirectory,
  readAgentEndpoint
} from "../shared/agent-endpoint.js";
import {
  CLI_PROTOCOL_VERSION,
  parseAgentResponse,
  type AgentRequest,
  type AgentResultMap
} from "../shared/agent-protocol.js";

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
async function fixture(
  dispatch?: AgentControlServerOptions["dispatch"],
  options: { requestTimeoutMs?: number; maxConnections?: number } = {}
) {
  const profilePath = await realpath(await mkdtemp(path.join(tmpdir(), "agent-server-")));
  cleanup.push(() => rm(profilePath, { recursive: true, force: true }));
  cleanup.push(() =>
    rm(agentSocketPaths(profilePath).directory, { recursive: true, force: true })
  );
  const identity: AgentResultMap["hello"] = {
    appVersion: "1.0.0",
    protocolVersion: CLI_PROTOCOL_VERSION,
    instanceId: "test-instance",
    profilePath,
    appId: "com.prof18.difftray",
    flavor: "production" as const,
    executablePath: "/fixture/Difftray"
  };
  const spy = vi.fn(dispatch ?? (async () => identity));
  const server = await startAgentControlServer({
    identity,
    hasProfileLock: true,
    dispatch: spy,
    frameTimeoutMs: 80,
    requestTimeoutMs: 160,
    ...options
  });
  cleanup.push(server.close);
  return { server, identity, dispatch: spy };
}
function exchange(socketPath: string, parts: readonly Buffer[]) {
  return new Promise<string>((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    const chunks: Buffer[] = [];
    socket.on("data", (chunk: Buffer) => chunks.push(chunk));
    socket.on("error", reject);
    socket.on("close", () => resolve(Buffer.concat(chunks).toString("utf8")));
    socket.on("connect", () => {
      for (const part of parts) socket.write(part);
    });
  });
}
function request(token: string, params = {}) {
  return Buffer.from(
    `${JSON.stringify({ version: 1, id: "req-1", token, method: "hello", params })}\n`
  );
}

describe("agent control socket", () => {
  it("publishes owned 0600 socket metadata and serves a single authenticated request", async () => {
    const { server, dispatch } = await fixture();
    expect((await lstat(server.endpoint.socketPath)).mode & 0o777).toBe(0o600);
    expect(await readAgentEndpoint(server.endpoint.profilePath)).toEqual(server.endpoint);
    const input = request(server.endpoint.token);
    const response = JSON.parse(
      await exchange(server.endpoint.socketPath, [
        input.subarray(0, 17),
        input.subarray(17)
      ])
    );
    expect(response).toMatchObject({ version: 1, id: "req-1", ok: true });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
  it("preserves safe request IDs for unsupported-version replies without dispatch", async () => {
    const { server, dispatch } = await fixture();
    const frame = Buffer.from(
      `${JSON.stringify({ version: 2, id: "older-cli.123", token: server.endpoint.token, method: "hello", params: {} })}\n`
    );
    const response = parseAgentResponse(
      await exchange(server.endpoint.socketPath, [frame]),
      "hello",
      "older-cli.123"
    );
    expect(response).toMatchObject({ ok: false, error: { code: "unsupported_version" } });
    expect(dispatch).not.toHaveBeenCalled();
  });
  it.each(["unsafe id", "unicode-é", "x".repeat(129), 123, null])(
    "does not reflect unsafe malformed-request ID %s",
    async (id) => {
      const { server, dispatch } = await fixture();
      const frame = Buffer.from(
        `${JSON.stringify({ version: 2, id, token: server.endpoint.token, method: "hello", params: {} })}\n`
      );
      expect(
        JSON.parse(await exchange(server.endpoint.socketPath, [frame]))
      ).toMatchObject({ id: "invalid", ok: false });
      expect(dispatch).not.toHaveBeenCalled();
    }
  );
  it("rejects wrong tokens without dispatch and ignores frames after the first", async () => {
    const { server, dispatch } = await fixture();
    const rejected = JSON.parse(
      await exchange(server.endpoint.socketPath, [request("b".repeat(64))])
    );
    expect(rejected).toMatchObject({ ok: false, error: { code: "unauthorized" } });
    expect(dispatch).not.toHaveBeenCalled();
    const input = request(server.endpoint.token);
    await exchange(server.endpoint.socketPath, [Buffer.concat([input, input])]);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
  it("bounds incomplete slow-byte clients with an absolute frame deadline", async () => {
    const { server, dispatch } = await fixture();
    const socket = net.createConnection(server.endpoint.socketPath);
    socket.on("error", () => {
      /* The test observes close rather than peer socket errors. */
    });
    const started = Date.now();
    const timer = setInterval(() => socket.write(" "), 10);
    await new Promise<void>((resolve) => socket.once("close", () => resolve()));
    clearInterval(timer);
    expect(Date.now() - started).toBeLessThan(1500);
    expect(dispatch).not.toHaveBeenCalled();
  });
  it("aborts dispatch on the absolute request deadline", async () => {
    let observed: AbortSignal | undefined;
    const dispatch = vi.fn((_request: AgentRequest, signal: AbortSignal) => {
      observed = signal;
      return new Promise<never>(() => {
        /* Deliberately pending until the server cancels it. */
      });
    });
    const { server } = await fixture(dispatch);
    await exchange(server.endpoint.socketPath, [request(server.endpoint.token)]);
    expect(observed?.aborted).toBe(true);
  });
  it("does not repair a wrong-mode existing socket", async () => {
    const { server, identity: ownIdentity } = await fixture();
    await chmod(server.endpoint.socketPath, 0o666);
    await expect(
      startAgentControlServer({
        identity: ownIdentity,
        hasProfileLock: true,
        dispatch: async () => ownIdentity
      })
    ).rejects.toMatchObject({ code: "unauthorized" });
    expect((await lstat(server.endpoint.socketPath)).mode & 0o777).toBe(0o666);
    await chmod(server.endpoint.socketPath, 0o600);
  });
  it("retires metadata from another protocol version left by an unclean exit", async () => {
    const profilePath = await realpath(
      await mkdtemp(path.join(tmpdir(), "agent-server-"))
    );
    cleanup.push(() => rm(profilePath, { recursive: true, force: true }));
    cleanup.push(() =>
      rm(agentSocketPaths(profilePath).directory, { recursive: true, force: true })
    );
    const paths = await ensureAgentDirectory(profilePath);
    const identity: AgentResultMap["hello"] = {
      appVersion: "1.0.0",
      protocolVersion: CLI_PROTOCOL_VERSION,
      instanceId: "upgraded-instance",
      profilePath,
      appId: "com.prof18.difftray",
      flavor: "production" as const,
      executablePath: "/fixture/Difftray"
    };
    await writeFile(
      paths.endpointPath,
      JSON.stringify({
        ...identity,
        instanceId: "previous-version",
        protocolVersion: CLI_PROTOCOL_VERSION + 1,
        token: "c".repeat(64),
        socketPath: paths.socketPath
      }),
      { mode: 0o600 }
    );
    await chmod(paths.endpointPath, 0o600);
    const server = await startAgentControlServer({
      identity,
      hasProfileLock: true,
      dispatch: async () => identity
    });
    cleanup.push(server.close);
    expect((await readAgentEndpoint(profilePath))?.instanceId).toBe("upgraded-instance");
  });
  it("never replaces an active socket even with a claimed profile lock", async () => {
    const { server, identity: ownIdentity } = await fixture();
    await expect(
      startAgentControlServer({
        identity: ownIdentity,
        hasProfileLock: true,
        dispatch: async () => ownIdentity
      })
    ).rejects.toMatchObject({ code: "busy" });
    expect(await readAgentEndpoint(server.endpoint.profilePath)).toEqual(server.endpoint);
  });
  it("aborts pending work promptly when an authenticated caller disconnects", async () => {
    let dispatched!: () => void;
    const started = new Promise<void>((resolve) => {
      dispatched = resolve;
    });
    let aborted!: () => void;
    const cancelled = new Promise<void>((resolve) => {
      aborted = resolve;
    });
    const { server } = await fixture(
      async (_request, signal) => {
        signal.addEventListener("abort", aborted, { once: true });
        dispatched();
        return new Promise<never>(() => {
          /* Deliberately pending until the server cancels it. */
        });
      },
      { requestTimeoutMs: 5000 }
    );
    const socket = net.createConnection(server.endpoint.socketPath);
    socket.on("error", () => {
      /* The test observes close rather than peer socket errors. */
    });
    socket.on("connect", () => socket.write(request(server.endpoint.token)));
    await started;
    socket.destroy();
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        cancelled,
        new Promise<never>((_, reject) => {
          deadline = setTimeout(
            () => reject(new Error("Disconnect did not cancel queued work")),
            500
          );
        })
      ]);
    } finally {
      clearTimeout(deadline);
    }
  });
  it("bounds clients that authenticate then stop reading a large response", async () => {
    let aborted!: () => void;
    const cancelled = new Promise<void>((resolve) => {
      aborted = resolve;
    });
    const { server } = await fixture(async (_request, signal) => {
      signal.addEventListener("abort", aborted, { once: true });
      return { format: "prompt", content: "x".repeat(15 * 1024 * 1024) };
    });
    const socket = net.createConnection(server.endpoint.socketPath);
    socket.on("error", () => {
      /* The test observes close rather than peer socket errors. */
    });
    socket.pause();
    socket.on("connect", () =>
      socket.write(
        `${JSON.stringify({ version: 1, id: "slow-reader", token: server.endpoint.token, method: "review.export", params: { contextId: `ctx_${"a".repeat(32)}`, format: "prompt" } })}\n`
      )
    );
    try {
      await cancelled;
    } finally {
      socket.destroy();
    }
  });
});
