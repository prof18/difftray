import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { AgentProtocolError } from "../shared/agent-protocol.js";
import { CliUsageError } from "./commands.js";
import {
  cliExitCode,
  formatCliResponse,
  wantsJsonOutput,
  writeCliText,
  cliErrorResponse,
  worktreeLabelCompatibleResponse
} from "./output.js";
import { CLI_HELP } from "./help.js";

describe("CLI output", () => {
  const response = {
    version: 1,
    id: "read",
    ok: true as const,
    result: { format: "prompt", content: "Révision 日本語\n" }
  };
  it("exports exact UTF-8 report bytes without a terminal or added newline", async () => {
    let captured = "";
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        captured += String(chunk);
        callback();
      }
    });
    await writeCliText(
      stream,
      formatCliResponse(
        { kind: "review.export", format: "prompt", json: false },
        response
      )
    );
    expect(captured).toBe(response.result.content);
  });
  it("neutralizes terminal control sequences only when writing to a terminal", () => {
    const hostile = {
      ...response,
      result: { ...response.result, content: "red \u001b[31mtext\tok\nnext\u0007" }
    };
    const command = { kind: "review.export", format: "prompt", json: false };
    expect(formatCliResponse(command, hostile, { terminal: true })).toBe(
      "red \\u001b[31mtext\tok\nnext\\u0007"
    );
    expect(formatCliResponse(command, hostile)).toBe(hostile.result.content);
  });
  it("uses an envelope for --json even with prompt format", () => {
    expect(
      JSON.parse(
        formatCliResponse(
          { kind: "review.export", format: "prompt", json: true },
          response
        )
      )
    ).toEqual(response);
    expect(wantsJsonOutput(["review", "export", "--format=json"])).toBe(true);
    expect(wantsJsonOutput(["review", "export", "--format", "json"])).toBe(true);
  });
  it.each([
    ["repository_missing", 3],
    ["context_missing", 3],
    ["unsupported_version", 3],
    ["context_expired", 3],
    ["stale_feedback", 4],
    ["note_conflict", 4],
    ["idempotency_conflict", 4],
    ["invalid_request", 2],
    ["request_timeout", 5],
    ["busy", 5],
    ["limit_exceeded", 5],
    ["internal_error", 1]
  ] as const)("maps %s to exit %i", (code, expected) => {
    expect(cliExitCode(new AgentProtocolError(code, "failure"))).toBe(expected);
  });
  it("gives input and transport errors typed envelopes", () => {
    expect(cliErrorResponse(new CliUsageError("bad input")).error.code).toBe(
      "invalid_request"
    );
    expect(
      cliExitCode(Object.assign(new Error("lost connection"), { code: "ECONNRESET" }))
    ).toBe(5);
  });
  it("handles a broken output pipe without an unhandled error", async () => {
    const stream = new Writable({
      write(_chunk, _encoding, callback) {
        callback(Object.assign(new Error("closed"), { code: "EPIPE" }));
      }
    });
    await expect(writeCliText(stream, "report")).resolves.toBeUndefined();
  });
  it("reports other output failures", async () => {
    const stream = new Writable({
      write(_chunk, _encoding, callback) {
        callback(Object.assign(new Error("disk full"), { code: "ENOSPC" }));
      }
    });
    await expect(writeCliText(stream, "report")).rejects.toThrow("disk full");
  });
});

describe("worktree label output", () => {
  const worktree = {
    branchName: "codex/checkout",
    customLabel: "Checkout rework",
    displayName: "Checkout rework",
    displayPath: "/repo/agent",
    id: "worktree-id",
    locked: false,
    state: "available"
  };
  const command = { kind: "worktree.label.set", json: false };

  it("prints the effective name and canonical path", () => {
    expect(
      formatCliResponse(command, {
        ok: true,
        result: { repoPath: "/repo/agent", worktree }
      })
    ).toBe("Checkout rework  /repo/agent\n");
    expect(
      formatCliResponse(
        { ...command, json: true },
        { ok: true, result: { repoPath: "/repo/agent", worktree } }
      )
    ).toBe(
      `${JSON.stringify({ ok: true, result: { repoPath: "/repo/agent", worktree } })}\n`
    );
  });

  it("explains that an older desktop app lacks the label method", () => {
    const unsupported = {
      version: 1 as const,
      id: "r",
      ok: false as const,
      error: {
        code: "invalid_request" as const,
        message: "Invalid enum value",
        retryable: false
      }
    };

    expect(worktreeLabelCompatibleResponse(unsupported)).toEqual({
      ...unsupported,
      error: {
        ...unsupported.error,
        code: "app_unavailable",
        message:
          "This Difftray app does not support worktree labels. Use the CLI bundled with the same Difftray build."
      }
    });
    const other = {
      ...unsupported,
      error: { ...unsupported.error, message: "Path is not a worktree root." }
    };
    expect(worktreeLabelCompatibleResponse(other)).toBe(other);
  });

  it("documents both label commands and their scope in help", () => {
    expect(CLI_HELP).toContain(
      "difftray worktree label set --repo WORKTREE_ROOT --label TEXT [--json]"
    );
    expect(CLI_HELP).toContain(
      "difftray worktree label reset --repo WORKTREE_ROOT [--json]"
    );
    expect(CLI_HELP).toContain("Labels are Difftray display names only");
    expect(CLI_HELP).toContain("repository access, feedback and label actions");
  });
});
