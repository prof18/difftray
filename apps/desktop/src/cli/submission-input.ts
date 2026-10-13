import { createReadStream } from "node:fs";
import type { Readable } from "node:stream";
import {
  CLI_PROTOCOL_VERSION,
  MAX_REQUEST_BYTES,
  parseAgentRequest,
  type AgentRequest
} from "../shared/agent-protocol.js";
import { CliUsageError, type CliCommand } from "./commands.js";

type SubmitCommand = Extract<CliCommand, { kind: "feedback.submit" }>;
type SubmitParams = Extract<AgentRequest, { method: "feedback.submit" }>["params"];

async function readSubmissionInput(
  command: SubmitCommand,
  stdin: Readable
): Promise<SubmitParams> {
  const stream = command.input === "-" ? stdin : createReadStream(command.input);
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of stream) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      size += bytes.byteLength;
      if (size > MAX_REQUEST_BYTES)
        throw new CliUsageError("Feedback input exceeds the 1 MiB limit.");
      chunks.push(bytes);
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(chunks, size)
    );
    const document: unknown = JSON.parse(text);
    if (
      command.requestId !== undefined &&
      document !== null &&
      typeof document === "object" &&
      !Array.isArray(document)
    ) {
      const submission = document as Record<string, unknown>;
      if (
        submission.requestId !== undefined &&
        submission.requestId !== command.requestId
      )
        throw new CliUsageError("--request-id must agree with the JSON requestId.");
      submission.requestId = command.requestId;
    }
    const request = parseAgentRequest(
      `${JSON.stringify({
        version: CLI_PROTOCOL_VERSION,
        id: "cli-submit-check",
        token: "a".repeat(64),
        method: "feedback.submit",
        params: { contextId: command.contextId, submission: document }
      })}\n`
    );
    if (request.method !== "feedback.submit")
      throw new CliUsageError("Invalid feedback submission.");
    return request.params;
  } catch (error) {
    if (error instanceof CliUsageError) throw error;
    throw new CliUsageError(
      `Invalid feedback input: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// Runtime resolution and connection may start the desktop app. Keep them behind
// complete offline validation so rejected input never has that side effect.
export async function withSubmissionInput<T>(
  command: SubmitCommand,
  run: (params: SubmitParams) => Promise<T>,
  stdin: Readable = process.stdin
): Promise<T> {
  const params = await readSubmissionInput(command, stdin);
  return run(params);
}
