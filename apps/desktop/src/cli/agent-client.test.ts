import { afterEach, describe, expect, it } from "vitest";
import { chmod, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { type AgentRequest, type AgentResponse } from "../shared/agent-protocol.js";
import { ensureAgentDirectory, type AgentEndpoint } from "../shared/agent-endpoint.js";
import { sendAgentRequest } from "./agent-client.js";

const profileRoots: string[] = [];
const servers: net.Server[] = [];
const socketPaths: string[] = [];
const directories: string[] = [];

async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), "difftray-agent-client-"));
  profileRoots.push(root);
  const profilePath = await realpath(root);
  const paths = await ensureAgentDirectory(profilePath);
  directories.push(paths.directory);
  const endpoint: AgentEndpoint = {
    appVersion: "1.2.3",
    protocolVersion: 1,
    instanceId: "client-test-instance",
    profilePath,
    appId: "com.prof18.difftray.dev",
    flavor: "dev",
    executablePath: "/tmp/difftray-test",
    token: "c".repeat(64),
    socketPath: paths.socketPath
  };
  return { profilePath, paths, endpoint };
}

async function serverAt(socketPath: string, handler: (socket: net.Socket) => void) {
  const server = net.createServer((socket) => {
    socket.on("error", () => undefined);
    handler(socket);
  });
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  await chmod(socketPath, 0o600);
  socketPaths.push(socketPath);
  return server;
}

function helloResult() {
  return {
    appVersion: "1.2.3",
    protocolVersion: 1 as const,
    instanceId: "client-test-instance",
    profilePath: "/tmp/test-profile",
    appId: "com.prof18.difftray.dev",
    flavor: "dev" as const,
    executablePath: "/tmp/Difftray Ω"
  };
}

function response(id: string, result = helloResult()) {
  return { version: 1, id, ok: true, result };
}

function requestReader(socket: net.Socket, onRequest: (request: AgentRequest) => void) {
  let data = "";
  socket.on("data", (chunk) => {
    data += chunk.toString("utf8");
    const lf = data.indexOf("\n");
    if (lf >= 0) onRequest(JSON.parse(data.slice(0, lf)) as AgentRequest);
  });
}

async function expectProtocolCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({
    name: "AgentProtocolError",
    code
  });
}

afterEach(async () => {
  for (const server of servers.splice(0))
    await new Promise<void>((resolve) => server.close(() => resolve()));
  for (const socketPath of socketPaths.splice(0)) await rm(socketPath, { force: true });
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
  for (const root of profileRoots.splice(0))
    await rm(root, { recursive: true, force: true });
});

describe("sendAgentRequest", () => {
  it("sends a strict authenticated request with a fresh transport ID and accepts a valid response", async () => {
    const { endpoint, paths } = await setup();
    await serverAt(paths.socketPath, (socket) => {
      requestReader(socket, (request) => {
        expect(request).toMatchObject({
          version: 1,
          token: endpoint.token,
          method: "hello",
          params: {}
        });
        expect(request.id).toMatch(/^[A-Za-z0-9._-]{1,128}$/);
        socket.end(`${JSON.stringify(response(request.id))}\n`);
      });
    });
    const result = await sendAgentRequest(endpoint, "hello", {});
    expect(result).toMatchObject({
      ok: true,
      result: { executablePath: "/tmp/Difftray Ω" }
    });
  });

  it("reads fragmented UTF-8 response frames split inside a multibyte character", async () => {
    const { endpoint, paths } = await setup();
    await serverAt(paths.socketPath, (socket) => {
      requestReader(socket, (request) => {
        const bytes = Buffer.from(`${JSON.stringify(response(request.id))}\n`, "utf8");
        const split = bytes.indexOf(Buffer.from("Ω")) + 1;
        socket.write(bytes.subarray(0, split));
        setTimeout(() => socket.end(bytes.subarray(split)), 5);
      });
    });
    const result = await sendAgentRequest(endpoint, "hello", {});
    expect(result.ok && result.result.executablePath).toBe("/tmp/Difftray Ω");
  });

  it("rejects a response whose ID does not match the request", async () => {
    const { endpoint, paths } = await setup();
    await serverAt(paths.socketPath, (socket) => {
      requestReader(socket, () =>
        socket.end(`${JSON.stringify(response("other-id"))}\n`)
      );
    });
    await expectProtocolCode(sendAgentRequest(endpoint, "hello", {}), "invalid_request");
  });

  it.each([
    [
      "oversized response",
      (socket: net.Socket, id: string) =>
        socket.end(
          `${JSON.stringify({ ...response(id), padding: "x".repeat(16_777_217) })}\n`
        )
    ],
    [
      "response without LF",
      (socket: net.Socket, id: string) => socket.end(JSON.stringify(response(id)))
    ],
    [
      "extra frame",
      (socket: net.Socket, id: string) =>
        socket.end(`${JSON.stringify(response(id))}\n${JSON.stringify(response(id))}\n`)
    ]
  ])("rejects %s", async (_label, writeBadResponse) => {
    const { endpoint, paths } = await setup();
    await serverAt(paths.socketPath, (socket) => {
      requestReader(socket, (request) => writeBadResponse(socket, request.id));
    });
    await expectProtocolCode(
      // This tests framing, not latency: serializing and transferring the 16 MiB
      // oversized fixture can exceed 100 ms under the full concurrent test gate.
      sendAgentRequest(endpoint, "hello", {}, { timeoutMs: 2_000 }),
      _label === "oversized response" ? "limit_exceeded" : "invalid_request"
    );
  });

  it("maps connection refusal to app_unavailable", async () => {
    const { endpoint, paths } = await setup();
    const server = await serverAt(paths.socketPath, () => undefined);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await expectProtocolCode(
      sendAgentRequest(endpoint, "hello", {}, { timeoutMs: 100 }),
      "app_unavailable"
    );
  });

  it("applies a bounded request deadline and supports abort", async () => {
    const { endpoint, paths } = await setup();
    await serverAt(paths.socketPath, (socket) => {
      requestReader(socket, () => undefined);
    });
    await expectProtocolCode(
      sendAgentRequest(endpoint, "hello", {}, { timeoutMs: 20 }),
      "request_timeout"
    );

    const controller = new AbortController();
    const pending = sendAgentRequest(
      endpoint,
      "hello",
      {},
      { timeoutMs: 5_000, signal: controller.signal }
    );
    controller.abort();
    await expectProtocolCode(pending, "request_timeout");
  });

  it("preserves a valid unauthorized error envelope from the server", async () => {
    const { endpoint, paths } = await setup();
    const unauthorized: AgentResponse<"hello"> = {
      version: 1,
      id: "pending",
      ok: false,
      error: { code: "unauthorized", message: "Token rejected", retryable: false }
    };
    await serverAt(paths.socketPath, (socket) => {
      requestReader(socket, (request) => {
        socket.end(`${JSON.stringify({ ...unauthorized, id: request.id })}\n`);
      });
    });
    const result = await sendAgentRequest(endpoint, "hello", {});
    expect(result).toMatchObject({ ok: false, error: unauthorized.error });
  });
});
