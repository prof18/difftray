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
  type AgentErrorCode,
  type AgentResponse
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
// Bidirectional and invisible formatting characters can reorder or hide text
// on a terminal, so show them as escapes too.
const terminalFormattingCharacters = new Set([
  0x061c, 0x200b, 0x200e, 0x200f, 0x2028, 0x2029, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e,
  0x2060, 0x2066, 0x2067, 0x2068, 0x2069, 0xfeff
]);
function neutralizeTerminalControls(text: string): string {
  return Array.from(text, (character) => {
    const code = character.charCodeAt(0);
    const control =
      code < 32 || (code >= 127 && code <= 159) || terminalFormattingCharacters.has(code);
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
  if (command.kind === "worktree.label.set" && typeof result.repoPath === "string") {
    const worktree = result.worktree as { readonly displayName?: unknown } | undefined;
    if (typeof worktree?.displayName === "string") {
      const text = `${worktree.displayName}  ${result.repoPath}\n`;
      return options.terminal ? neutralizeTerminalControls(text) : text;
    }
  }
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

/**
 * An app older than this CLI rejects the unknown method as an invalid enum.
 * Say what to do instead of reporting a malformed request.
 */
export function worktreeLabelCompatibleResponse<T extends AgentResponse>(response: T): T {
  if (
    response.ok ||
    response.error.code !== "invalid_request" ||
    response.error.message !== "Invalid enum value"
  )
    return response;
  return {
    ...response,
    error: {
      ...response.error,
      code: "app_unavailable",
      message:
        "This Difftray app does not support worktree labels. Use the CLI bundled with the same Difftray build."
    }
  };
}
