import { randomUUID } from "node:crypto";
import type { Writable } from "node:stream";
import {
  AgentProtocolError,
  CLI_PROTOCOL_VERSION,
  EXIT_USAGE,
  EXIT_NOT_AVAILABLE,
  EXIT_CONFLICT,
  EXIT_IO,
  EXIT_INTERNAL,
  type AgentErrorCode
} from "../shared/agent-protocol.js";
import { CliUsageError } from "./commands.js";

const ioCodes = new Set([
  "EPIPE",
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOENT",
  "EACCES",
  "ENOSPC",
  "EIO"
]);
export function cliExitCode(error: unknown): number {
  if (error instanceof CliUsageError) return EXIT_USAGE;
  if (error instanceof AgentProtocolError) {
    if (["invalid_request", "invalid_target"].includes(error.code)) return EXIT_USAGE;
    if (
      [
        "stale_review",
        "stale_diff",
        "stale_feedback",
        "note_conflict",
        "idempotency_conflict"
      ].includes(error.code)
    )
      return EXIT_CONFLICT;
    if (["request_timeout", "busy", "limit_exceeded"].includes(error.code))
      return EXIT_IO;
    return error.code === "internal_error" ? EXIT_INTERNAL : EXIT_NOT_AVAILABLE;
  }
  return ioCodes.has((error as NodeJS.ErrnoException | undefined)?.code ?? "")
    ? EXIT_IO
    : EXIT_INTERNAL;
}
export function wantsJsonOutput(argv: readonly string[]): boolean {
  return (
    argv.includes("--json") ||
    argv.includes("--format=json") ||
    argv.some((arg, index) => arg === "--format" && argv[index + 1] === "json")
  );
}
export function cliErrorResponse(error: unknown) {
  const code: AgentErrorCode =
    error instanceof AgentProtocolError
      ? error.code
      : error instanceof CliUsageError
        ? "invalid_request"
        : cliExitCode(error) === EXIT_IO
          ? "request_timeout"
          : "internal_error";
  return {
    version: CLI_PROTOCOL_VERSION,
    id: randomUUID(),
    ok: false as const,
    error: {
      code,
      message: error instanceof Error ? error.message : String(error),
      retryable: code === "busy" || code === "request_timeout"
    }
  };
}
// Reports quote repository content; on a terminal, show control sequences
// instead of letting them act. Piped output stays byte-exact.
function neutralizeTerminalControls(text: string): string {
  return Array.from(text, (character) => {
    const code = character.charCodeAt(0);
    const control = code < 32 || (code >= 127 && code <= 159);
    return control && character !== "\n" && character !== "\t"
      ? `\\u${code.toString(16).padStart(4, "0")}`
      : character;
  }).join("");
}
export function formatCliResponse(
  command: { readonly kind: string; readonly json: boolean; readonly format?: string },
  response: { readonly ok: boolean; readonly result?: unknown },
  options: { readonly terminal?: boolean } = {}
): string {
  if (!response.ok || command.json || command.format === "json")
    return `${JSON.stringify(response)}\n`;
  const result = response.result as Record<string, unknown>;
  if (
    command.kind === "review.export" &&
    command.format === "prompt" &&
    typeof result.content === "string"
  )
    return options.terminal ? neutralizeTerminalControls(result.content) : result.content;
  if (command.kind === "open" && typeof result.repoPath === "string")
    return `Opened ${result.repoPath}\n`;
  return `${JSON.stringify(response)}\n`;
}
// Retain one listener per stream: Node emits 'error' after invoking a failed write's
// callback, so removing it there would turn a closed downstream pipe into a crash.
const guardedStreams = new WeakSet<Writable>();
export async function writeCliText(stream: Writable, text: string): Promise<void> {
  if (!guardedStreams.has(stream)) {
    stream.on("error", () => {
      // Each write callback handles the error; keep the later event from crashing.
    });
    guardedStreams.add(stream);
  }
  await new Promise<void>((resolve, reject) => {
    stream.write(text, "utf8", (error) => {
      if (!error || (error as NodeJS.ErrnoException).code === "EPIPE") resolve();
      else reject(error);
    });
  });
}
