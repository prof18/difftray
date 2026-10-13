import { randomUUID } from "node:crypto";
import net from "node:net";
import { validateAgentSocket, type AgentEndpoint } from "../shared/agent-endpoint.js";
import {
  AgentProtocolError,
  CLI_PROTOCOL_VERSION,
  MAX_RESPONSE_BYTES,
  REQUEST_TIMEOUT_MS,
  parseAgentRequest,
  parseAgentResponse,
  type AgentMethod,
  type AgentRequest,
  type AgentResponse
} from "../shared/agent-protocol.js";

export type AgentParams<M extends AgentMethod> = Extract<
  AgentRequest,
  { readonly method: M }
>["params"];
export async function sendAgentRequest<M extends AgentMethod>(
  endpoint: AgentEndpoint,
  method: M,
  params: AgentParams<M>,
  options: { readonly timeoutMs?: number; readonly signal?: AbortSignal } = {}
): Promise<AgentResponse<M>> {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const timedOut = () =>
    new AgentProtocolError(
      "request_timeout",
      "Local agent request timed out or was cancelled."
    );
  if (options.signal?.aborted) throw timedOut();
  const id = randomUUID();
  const request = `${JSON.stringify({ version: CLI_PROTOCOL_VERSION, id, token: endpoint.token, method, params })}\n`;
  parseAgentRequest(request);
  try {
    await validateAgentSocket(endpoint);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw new AgentProtocolError(
        "app_unavailable",
        "Local desktop endpoint is unavailable."
      );
    throw error;
  }
  const remaining = timeoutMs - (Date.now() - started);
  if (remaining <= 0 || options.signal?.aborted) throw timedOut();
  return new Promise<AgentResponse<M>>((resolve, reject) => {
    const socket = net.createConnection(endpoint.socketPath);
    let settled = false;
    let connected = false;
    let bytes = 0;
    let chunks: Buffer[] = [];
    const finish = (error?: unknown, response?: AgentResponse<M>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      socket.destroy();
      chunks = [];
      if (error)
        reject(
          error instanceof Error
            ? error
            : new AgentProtocolError("internal_error", "Agent connection failed.")
        );
      else if (response) resolve(response);
    };
    const abort = () => finish(timedOut());
    const timer = setTimeout(abort, remaining);
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) {
      abort();
      return;
    }
    socket.once("connect", () => {
      connected = true;
      socket.write(request);
    });
    socket.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_RESPONSE_BYTES) {
        finish(
          new AgentProtocolError(
            "limit_exceeded",
            "Agent response exceeds the frame limit."
          )
        );
        return;
      }
      chunks.push(chunk);
    });
    socket.once("end", () => {
      if (settled) return;
      if (bytes === 0) {
        finish(
          new AgentProtocolError(
            "busy",
            "Desktop closed the request without a response; retry later."
          )
        );
        return;
      }
      try {
        const response = parseAgentResponse(Buffer.concat(chunks, bytes), method);
        if (response.id !== id)
          throw new AgentProtocolError(
            "invalid_request",
            "Agent response correlation does not match the request."
          );
        finish(undefined, response);
      } catch (error) {
        finish(error);
      }
    });
    socket.on("error", (error: NodeJS.ErrnoException) => {
      finish(
        !connected && (error.code === "ECONNREFUSED" || error.code === "ENOENT")
          ? new AgentProtocolError(
              "app_unavailable",
              "Local desktop endpoint refused the connection."
            )
          : new AgentProtocolError(
              "request_timeout",
              "Local agent connection failed; the operation result may be uncertain."
            )
      );
    });
    socket.once("close", () => {
      if (!settled)
        finish(
          new AgentProtocolError(
            "request_timeout",
            "Local agent connection closed before a complete response."
          )
        );
    });
  });
}
