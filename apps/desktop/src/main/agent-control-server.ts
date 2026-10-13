import { randomBytes, timingSafeEqual } from "node:crypto";
import { chmod, lstat, unlink } from "node:fs/promises";
import net, { type Socket } from "node:net";
import {
  AgentProtocolError,
  CLI_PROTOCOL_VERSION,
  MAX_CONNECTIONS,
  MAX_IDENTIFIER_CHARACTERS,
  MAX_REQUEST_BYTES,
  MAX_RESPONSE_BYTES,
  PRIVATE_FILE_MODE,
  REQUEST_TIMEOUT_MS,
  SOCKET_IDLE_TIMEOUT_MS,
  TOKEN_BYTES,
  parseAgentRequest,
  parseAgentResponse,
  type AgentRequest,
  type AgentResultMap
} from "../shared/agent-protocol.js";
import {
  agentSocketPaths,
  assertPrivateAgentPath,
  ensureAgentDirectory,
  publishAgentEndpoint,
  readAgentEndpoint,
  removeAgentEndpoint,
  validateAgentSocket,
  type AgentEndpoint
} from "../shared/agent-endpoint.js";

export type AgentControlServerOptions = {
  readonly identity: AgentResultMap["hello"];
  readonly hasProfileLock: boolean;
  readonly dispatch: (request: AgentRequest, signal: AbortSignal) => Promise<unknown>;
  readonly frameTimeoutMs?: number;
  readonly requestTimeoutMs?: number;
  readonly maxConnections?: number;
  readonly setSocketMode?: typeof chmod;
  readonly beforePublish?: () => Promise<void>;
};
function missing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}
// Parse failures must still correlate their diagnostic, without trusting any request payload.
function safeFailureId(frame: Buffer): string {
  try {
    const value: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(frame)
    );
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      "id" in value &&
      typeof value.id === "string" &&
      value.id.length <= MAX_IDENTIFIER_CHARACTERS &&
      /^[A-Za-z0-9_.-]+$/.test(value.id)
    )
      return value.id;
  } catch {
    /* Invalid JSON or UTF-8 has no safe correlation ID. */
  }
  return "invalid";
}
async function isListening(socketPath: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    const timer = setTimeout(() => {
      socket.destroy();
      reject(
        new AgentProtocolError(
          "busy",
          "Existing agent socket did not answer the startup probe."
        )
      );
    }, 500);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });
    socket.once("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      socket.destroy();
      if (error.code === "ECONNREFUSED" || error.code === "ENOENT") resolve(false);
      else reject(error);
    });
  });
}
async function retireStaleEndpoint(identity: AgentResultMap["hello"]): Promise<void> {
  const paths = agentSocketPaths(identity.profilePath);
  let socket;
  try {
    socket = await lstat(paths.socketPath);
  } catch (error) {
    if (!missing(error)) throw error;
  }
  if (socket) {
    assertPrivateAgentPath(socket, "socket");
    if (await isListening(paths.socketPath))
      throw new AgentProtocolError(
        "busy",
        "A desktop instance is already listening for this profile."
      );
  }
  const previous = await readAgentEndpoint(identity.profilePath, {
    requireSocket: false
  });
  if (previous && !(await removeAgentEndpoint(previous)))
    throw new AgentProtocolError("busy", "Endpoint generation changed during startup.");
  if (socket) {
    let current;
    try {
      current = await lstat(paths.socketPath);
    } catch (error) {
      if (missing(error)) return;
      throw error;
    }
    assertPrivateAgentPath(current, "socket");
    if (current.dev !== socket.dev || current.ino !== socket.ino)
      throw new AgentProtocolError("busy", "Socket changed during startup.");
    await unlink(paths.socketPath);
  }
}

export async function startAgentControlServer(options: AgentControlServerOptions) {
  if (!options.hasProfileLock)
    throw new AgentProtocolError(
      "app_unavailable",
      "Profile lock is required before opening the local agent service."
    );
  const paths = await ensureAgentDirectory(options.identity.profilePath);
  await retireStaleEndpoint(options.identity);
  const endpoint: AgentEndpoint = {
    ...options.identity,
    socketPath: paths.socketPath,
    token: randomBytes(TOKEN_BYTES).toString("hex")
  };
  const clients = new Set<Socket>();
  const server = net.createServer({ allowHalfOpen: false }, (socket) => {
    if (clients.size >= (options.maxConnections ?? MAX_CONNECTIONS)) {
      socket.destroy();
      return;
    }
    clients.add(socket);
    const controller = new AbortController();
    let timer = setTimeout(
      () => socket.destroy(),
      options.frameTimeoutMs ?? SOCKET_IDLE_TIMEOUT_MS
    );
    let bytes = 0;
    let chunks: Buffer[] = [];
    let dispatched = false;
    socket.on("error", () => {
      /* Close handles peer failures and cancels pending work. */
    });
    socket.once("close", () => {
      clearTimeout(timer);
      controller.abort();
      clients.delete(socket);
      chunks = [];
    });
    const cancelled = () => socket.destroyed || controller.signal.aborted;
    const respond = (value: unknown): void => {
      if (cancelled()) return;
      const text = `${JSON.stringify(value)}\n`;
      if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) {
        socket.destroy();
        return;
      }
      socket.end(text);
    };
    const errorResponse = (id: string, error: unknown): void => {
      const typed =
        error instanceof AgentProtocolError
          ? error
          : new AgentProtocolError("internal_error", "Agent operation failed.");
      respond({
        version: CLI_PROTOCOL_VERSION,
        id,
        ok: false,
        error: {
          code: typed.code,
          message: typed.message,
          retryable: typed.code === "busy" || typed.code === "request_timeout"
        }
      });
    };
    async function dispatch(frame: Buffer) {
      let request: AgentRequest;
      try {
        request = parseAgentRequest(frame);
      } catch (error) {
        errorResponse(safeFailureId(frame), error);
        return;
      }
      if (
        !timingSafeEqual(
          Buffer.from(request.token, "hex"),
          Buffer.from(endpoint.token, "hex")
        )
      ) {
        errorResponse(
          request.id,
          new AgentProtocolError("unauthorized", "Local agent authentication failed.")
        );
        return;
      }
      clearTimeout(timer);
      timer = setTimeout(() => {
        controller.abort();
        socket.destroy();
      }, options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS);
      try {
        if (cancelled()) return;
        const result = await options.dispatch(request, controller.signal);
        if (cancelled()) return;
        const response = {
          version: CLI_PROTOCOL_VERSION,
          id: request.id,
          ok: true,
          result
        };
        const serialized = `${JSON.stringify(response)}\n`;
        if (Buffer.byteLength(serialized) > MAX_RESPONSE_BYTES)
          throw new AgentProtocolError(
            "limit_exceeded",
            "Agent response exceeds the maximum frame size."
          );
        parseAgentResponse(serialized, request.method);
        respond(response);
      } catch (error) {
        errorResponse(request.id, error);
      }
    }
    socket.on("data", (chunk: Buffer) => {
      if (dispatched) return;
      const end = chunk.indexOf(10);
      const part = end < 0 ? chunk : chunk.subarray(0, end + 1);
      bytes += part.length;
      if (bytes > MAX_REQUEST_BYTES) {
        socket.destroy();
        return;
      }
      chunks.push(part);
      if (end < 0) return;
      dispatched = true;
      socket.pause();
      const frame = Buffer.concat(chunks, bytes);
      chunks = [];
      void dispatch(frame);
    });
  });
  let closing: Promise<void> | undefined;
  const close = (): Promise<void> => {
    closing ??= (async () => {
      try {
        await removeAgentEndpoint(endpoint);
      } finally {
        for (const socket of clients) socket.destroy();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    })();
    return closing;
  };
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(paths.socketPath, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  server.on("error", () => {
    void close().catch(() => {
      /* Listener failures are terminal; shutdown already closes clients. */
    });
  });
  try {
    const created = await lstat(paths.socketPath);
    // Newly created mode follows umask; validate ownership and type before chmod.
    if (
      !created.isSocket() ||
      created.isSymbolicLink() ||
      created.uid !== process.getuid?.()
    )
      throw new AgentProtocolError(
        "unauthorized",
        "Unexpected socket identity after listen."
      );
    await (options.setSocketMode ?? chmod)(paths.socketPath, PRIVATE_FILE_MODE);
    const verified = await validateAgentSocket(endpoint);
    if (verified.ino !== created.ino || verified.dev !== created.dev)
      throw new AgentProtocolError(
        "unauthorized",
        "Socket identity changed during permission setup."
      );
    await options.beforePublish?.();
    await publishAgentEndpoint(endpoint);
    return { endpoint, close };
  } catch (error) {
    await close();
    throw error;
  }
}
