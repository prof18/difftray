import { describe, expect, it } from "vitest";
import { normalizeWorktreeLabel } from "@difftray/companion-protocol";
import { createReviewNoteScopeId } from "@difftray/core";
import {
  AgentProtocolError,
  parseAgentRequest,
  parseAgentResponse
} from "./agent-protocol.js";

const contextId = `ctx_${"a".repeat(32)}`;
const token = "a".repeat(64);
const base = (method: string, params: Record<string, unknown>) => ({
  version: 1,
  id: "transport-1",
  token,
  method,
  params
});
const frame = (value: unknown) => `${JSON.stringify(value)}\n`;
const parse = (value: unknown) => parseAgentRequest(frame(value));

function expectCode(value: string | Uint8Array, code: string) {
  try {
    parseAgentRequest(value);
    throw new Error("expected parseAgentRequest to reject input");
  } catch (error) {
    expect(error).toBeInstanceOf(AgentProtocolError);
    expect((error as AgentProtocolError).code).toBe(code);
  }
}

describe("parseAgentRequest", () => {
  it.each([
    ["hello", {}],
    ["open", { repoPath: "/repo", selector: { kind: "working-tree" } }],
    ["open", { repoPath: "/repo", selector: { kind: "selected" } }],
    ["review.inspect", { repoPath: "/repo", selector: { kind: "selected" } }],
    ["review.inspect", { repoPath: "/repo", selector: { kind: "working-tree" } }],
    ["review.inspect", { repoPath: "/repo", selector: { kind: "branch", base: "main" } }],
    [
      "review.inspect",
      { repoPath: "/repo", selector: { kind: "commit", commit: "abc123" } }
    ],
    ["review.files", { contextId }],
    ["review.files", { contextId, limit: 500, cursor: "next" }],
    ["review.file", { contextId, path: "src/file.ts" }],
    ["review.feedback", { contextId }],
    ["review.feedback", { contextId, limit: 1, cursor: "next", includeInactive: true }],
    ["review.export", { contextId, format: "prompt" }],
    ["review.export", { contextId, format: "json" }],
    [
      "feedback.submit",
      {
        contextId,
        submission: {
          actor: { name: "Agent 1", runId: "run-1" },
          requestId: "request_1",
          items: [
            {
              kind: "line",
              path: "src/file.ts",
              diffHash: "hash",
              side: "additions",
              lineStart: 2,
              lineEnd: 2,
              body: "Consider this."
            },
            {
              kind: "file",
              path: "src/file.ts",
              previousPath: "src/old.ts",
              diffHash: "hash",
              body: "File-level note."
            },
            { kind: "overall", expectedNoteVersion: "v1", body: "Overall note." }
          ]
        }
      }
    ]
  ])("accepts %s params", (method, params) => {
    expect(parse(base(method, params))).toMatchObject({ method, params });
  });

  it("accepts exactly one JSON object followed by LF as text or UTF-8 bytes", () => {
    const input = frame(base("hello", {}));
    expect(parseAgentRequest(input)).toMatchObject({ method: "hello" });
    expect(parseAgentRequest(new TextEncoder().encode(input))).toMatchObject({
      method: "hello"
    });
  });

  it.each([
    ["", "invalid_request"],
    ["{bad}\n", "invalid_request"],
    [frame([]), "invalid_request"],
    [JSON.stringify(base("hello", {})), "invalid_request"],
    [`${frame(base("hello", {}))}\n`, "invalid_request"],
    [frame({ ...base("hello", {}), version: 2 }), "unsupported_version"],
    [frame({ ...base("hello", {}), token: "wrong" }), "unauthorized"],
    [frame({ ...base("unknown", {}) }), "invalid_request"]
  ])("rejects malformed envelope (%s)", (input, code) => expectCode(input, code));

  it("measures the framing limit in UTF-8 bytes before JSON parsing", () => {
    const valid = frame(base("hello", {}));
    const oversized = `${valid.slice(0, -1)}${" ".repeat(1_048_576)}\n`;
    expectCode(oversized, "limit_exceeded");
    expectCode(new TextEncoder().encode(oversized), "limit_exceeded");
    const multibyte = `${frame(base("hello", {})).slice(0, -1)}${"界".repeat(350_000)}\n`;
    expectCode(new TextEncoder().encode(multibyte), "limit_exceeded");
  });

  it.each([
    { extra: true },
    { version: 1, id: "transport-1", token, method: "hello", params: {}, extra: true },
    { ...base("hello", {}), params: { extra: true } },
    {
      ...base("open", {
        repoPath: "/repo",
        selector: { kind: "working-tree", extra: true }
      })
    },
    { ...base("review.inspect", { repoPath: "/repo", selector: { kind: "branch" } }) },
    {
      ...base("review.inspect", {
        repoPath: "/repo",
        selector: { kind: "tag", name: "x" }
      })
    },
    { ...base("review.files", { contextId, limit: 0 }) },
    { ...base("review.files", { contextId, limit: 501 }) },
    { ...base("review.files", { contextId, cursor: "" }) },
    { ...base("review.files", { contextId: "ctx_bad" }) },
    { ...base("review.file", { contextId, path: "../secret" }) },
    { ...base("review.file", { contextId, path: "/absolute" }) },
    { ...base("review.file", { contextId, path: "a//b" }) },
    { ...base("review.file", { contextId, path: "a/./b" }) },
    { ...base("review.feedback", { contextId, includeInactive: "yes" }) },
    { ...base("review.export", { contextId, format: "markdown" }) }
  ])("rejects invalid fields and discriminators", (input) =>
    expectCode(frame(input), "invalid_request")
  );

  it.each(["dir\\file.ts", "tab\tname.ts", "line\nbreak.ts"])(
    "accepts any Git path shape a repository can contain: %j",
    (gitPath) => {
      expect(parse(base("review.file", { contextId, path: gitPath }))).toMatchObject({
        params: { path: gitPath }
      });
      const page = {
        version: 1,
        id: "req-1",
        ok: true,
        result: {
          files: [{ path: gitPath, diffHash: "hash", kind: "text", visible: true }],
          total: 1,
          nextCursor: null
        }
      };
      expect(parseAgentResponse(frame(page), "review.files")).toMatchObject({
        ok: true
      });
    }
  );

  it("rejects unsafe line positions and invalid feedback batches", () => {
    const submission = (items: unknown[]) =>
      base("feedback.submit", {
        contextId,
        submission: {
          actor: { name: "Agent", runId: "run.1" },
          requestId: "req-1",
          items
        }
      });
    const line = {
      kind: "line",
      path: "src/a.ts",
      diffHash: "h",
      side: "deletions",
      lineStart: 1,
      lineEnd: 1,
      body: "note"
    };
    expectCode(
      frame(submission([{ ...line, lineStart: Number.MAX_SAFE_INTEGER + 1 }])),
      "invalid_request"
    );
    expectCode(frame(submission([{ ...line, lineStart: 0 }])), "invalid_request");
    expectCode(
      frame(submission([{ ...line, lineStart: 2, lineEnd: 1 }])),
      "invalid_request"
    );
    expectCode(frame(submission([])), "invalid_request");
    expectCode(
      frame(
        submission(
          Array.from({ length: 101 }, () => ({
            kind: "file",
            path: "a",
            diffHash: "h",
            body: "x"
          }))
        )
      ),
      "limit_exceeded"
    );
    expectCode(
      frame(
        submission([
          { kind: "overall", expectedNoteVersion: "v", body: "one" },
          { kind: "overall", expectedNoteVersion: "v", body: "two" }
        ])
      ),
      "invalid_request"
    );
    expectCode(frame(submission([{ ...line, callerKind: "human" }])), "invalid_request");
    expectCode(
      frame(
        submission([
          {
            ...line,
            kind: "file",
            lineStart: undefined,
            lineEnd: undefined,
            body: "x",
            extra: "no"
          }
        ])
      ),
      "invalid_request"
    );
  });

  it("counts body limits as Unicode code points and allows embedded body newlines", () => {
    const item = (body: string) => ({ kind: "file", path: "a.ts", diffHash: "h", body });
    const submit = (body: string) =>
      base("feedback.submit", {
        contextId,
        submission: {
          actor: { name: "Agent", runId: "run" },
          requestId: "req",
          items: [item(body)]
        }
      });
    expect(parse(submit("🙂".repeat(10_000)))).toBeDefined();
    expectCode(frame(submit("🙂".repeat(10_001))), "limit_exceeded");
    expect(parse(submit("line one\nline two"))).toBeDefined();
    expectCode(frame(submit("  \n\t  ")), "invalid_request");
  });
});

describe("parseAgentResponse", () => {
  const hello = {
    appVersion: "1.2.3",
    protocolVersion: 1,
    instanceId: "instance-1",
    profilePath: "/profile",
    appId: "com.example.difftray",
    flavor: "dev",
    executablePath: "/app/Difftray"
  };

  it("accepts the typed hello success envelope", () => {
    expect(
      parseAgentResponse(
        frame({ version: 1, id: "transport-1", ok: true, result: hello }),
        "hello"
      )
    ).toMatchObject({ ok: true, result: hello });
  });

  it.each([
    "invalid_request",
    "unsupported_version",
    "unauthorized",
    "app_unavailable",
    "profile_mismatch",
    "repository_missing",
    "invalid_target",
    "context_missing",
    "context_expired",
    "stale_review",
    "stale_diff",
    "stale_feedback",
    "note_conflict",
    "idempotency_conflict",
    "limit_exceeded",
    "busy",
    "request_timeout",
    "internal_error"
  ])("accepts error code %s and requires the exact error envelope", (code) => {
    const response = {
      version: 1,
      id: "transport-1",
      ok: false,
      error: { code, message: "failed", retryable: false }
    };
    expect(parseAgentResponse(frame(response), "hello")).toMatchObject({
      ok: false,
      error: { code }
    });
    expect(() =>
      parseAgentResponse(
        frame({ ...response, error: { ...response.error, extra: true } }),
        "hello"
      )
    ).toThrow(AgentProtocolError);
  });

  it("rejects unknown response/error fields, invalid enums, and mismatched correlation", () => {
    const success = { version: 1, id: "transport-1", ok: true, result: hello };
    expect(() => parseAgentResponse(frame({ ...success, extra: true }), "hello")).toThrow(
      AgentProtocolError
    );
    expect(() =>
      parseAgentResponse(
        frame({ ...success, result: { ...hello, extra: true } }),
        "hello"
      )
    ).toThrow(AgentProtocolError);
    expect(() =>
      parseAgentResponse(
        frame({ ...success, result: { ...hello, flavor: "unknown" } }),
        "hello"
      )
    ).toThrow(AgentProtocolError);
    expect(() =>
      parseAgentResponse(frame({ ...success, id: "other" }), "hello", "transport-1")
    ).toThrow(AgentProtocolError);
    expect(() =>
      parseAgentResponse(
        frame({
          version: 1,
          id: "transport-1",
          ok: false,
          error: { code: "future_code", message: "x", retryable: false }
        }),
        "hello"
      )
    ).toThrow(AgentProtocolError);
  });
});

describe("method-specific success results", () => {
  const target = {
    kind: "working_tree",
    projectId: "project",
    headSha: "abc123"
  } as const;
  const file = { path: "src/a.ts", diffHash: "hash", kind: "text", visible: true };
  const note = { body: "Review note", dismissedAt: null };
  const cases = [
    ["open", { projectId: "project", repoPath: "/repo", target }],
    [
      "review.inspect",
      {
        contextId,
        projectId: "project",
        repoPath: "/repo",
        target,
        targetId: "target",
        snapshotHash: "snapshot",
        fileCount: 1,
        visibleFileCount: 1,
        expiresAt: 100,
        noteVersion: "v0",
        note
      }
    ],
    ["review.files", { files: [file], total: 1, nextCursor: null }],
    [
      "review.file",
      {
        path: "src/a.ts",
        diffHash: "hash",
        content: { kind: "text", patch: "@@ -1 +1 @@" },
        selectableRanges: { additions: [{ start: 1, end: 1 }], deletions: [] }
      }
    ],
    [
      "review.feedback",
      {
        items: [
          {
            id: "comment",
            kind: "file",
            body: "Fix this",
            active: true,
            path: "src/a.ts",
            diffHash: "hash"
          }
        ],
        total: 1,
        nextCursor: null,
        feedbackVersion: "f1",
        noteVersion: "v1",
        note
      }
    ],
    ["review.export", { format: "prompt", content: "Review report" }],
    [
      "review.export",
      {
        format: "json",
        content: { contextId, target, items: [], note: null, noteVersion: "v0" }
      }
    ],
    [
      "feedback.submit",
      { requestId: "req-1", deduplicated: false, itemIds: ["item-1"], noteVersion: "v1" }
    ]
  ] as const;
  it("accepts real overall-note scope IDs in submission receipts", () => {
    const result = {
      requestId: "req-1",
      deduplicated: false,
      itemIds: [createReviewNoteScopeId(target)],
      noteVersion: "v1"
    };
    const response = { version: 1, id: "transport-1", ok: true, result };
    expect(parseAgentResponse(frame(response), "feedback.submit")).toEqual(response);
    expect(() =>
      parseAgentResponse(
        frame({ ...response, result: { ...result, itemIds: [""] } }),
        "feedback.submit"
      )
    ).toThrow(AgentProtocolError);
  });
  it.each(cases)("accepts and validates %s", (method, result) => {
    const response = { version: 1, id: "transport-1", ok: true, result };
    expect(parseAgentResponse(frame(response), method)).toMatchObject(response);
    expect(() =>
      parseAgentResponse(
        frame({ ...response, result: { ...result, unexpected: true } }),
        method
      )
    ).toThrow(AgentProtocolError);
  });
  it("rejects invalid UTF-8 before JSON parsing", () => {
    expectCode(new Uint8Array([0xc3, 0x28, 0x0a]), "invalid_request");
  });
  it("rejects fields belonging to another feedback scope", () => {
    const response = {
      version: 1,
      id: "transport-1",
      ok: true,
      result: {
        items: [
          {
            id: "note",
            kind: "overall",
            body: "Review note",
            active: true,
            path: "src/a.ts"
          }
        ],
        total: 1,
        nextCursor: null,
        feedbackVersion: "f1",
        noteVersion: "v1",
        note: null
      }
    };
    expect(() => parseAgentResponse(frame(response), "review.feedback")).toThrow(
      AgentProtocolError
    );
  });
  it("accepts canonical absolute project IDs and long Git ref labels", () => {
    const projectId = "/Users/mg/Workspace/" + "deep/".repeat(35) + "repo";
    const target = {
      kind: "branch",
      projectId,
      headSha: "abc",
      baseRefName: "feature/" + "nested/".repeat(35),
      baseSha: "def",
      mergeBaseSha: "123"
    };
    const response = {
      version: 1,
      id: "transport-1",
      ok: true,
      result: { projectId, repoPath: projectId, target }
    };
    expect(parseAgentResponse(frame(response), "open")).toMatchObject(response);
  });
  it("accepts the stored ISO dismissal timestamp", () => {
    const response = {
      version: 1,
      id: "transport-1",
      ok: true,
      result: {
        contextId,
        projectId: "/repo",
        repoPath: "/repo",
        target: { kind: "working_tree", projectId: "/repo", headSha: "abc" },
        targetId: "target",
        snapshotHash: "snapshot",
        fileCount: 0,
        visibleFileCount: 0,
        expiresAt: 100,
        noteVersion: "v1",
        note: { body: "Read", dismissedAt: "2026-10-13T12:00:00.000Z" }
      }
    };
    expect(parseAgentResponse(frame(response), "review.inspect")).toMatchObject(response);
  });
  it("accepts an explicit oversized diff descriptor", () => {
    const response = {
      version: 1,
      id: "transport-1",
      ok: true,
      result: {
        path: "src/a.ts",
        diffHash: "hash",
        content: { kind: "oversized", reason: "patch_too_large" },
        selectableRanges: { additions: [], deletions: [] }
      }
    };
    expect(parseAgentResponse(frame(response), "review.file")).toMatchObject(response);
  });
  it("rejects Git selectors that begin with an option prefix", () => {
    expectCode(
      frame(
        base("review.inspect", {
          repoPath: "/repo",
          selector: { kind: "branch", base: "--help" }
        })
      ),
      "invalid_request"
    );
    expectCode(
      frame(
        base("review.inspect", {
          repoPath: "/repo",
          selector: { kind: "commit", commit: "--version" }
        })
      ),
      "invalid_request"
    );
  });
});

describe("pagination cursors", () => {
  const validCursor = "A".repeat(512) + "._-z";
  it.each(["review.files", "review.feedback"] as const)(
    "accepts a long %s request cursor",
    (method) => {
      expect(parse(base(method, { contextId, cursor: validCursor }))).toMatchObject({
        params: { cursor: validCursor }
      });
    }
  );
  it.each(["review.files", "review.feedback"] as const)(
    "rejects oversized and non-base64url %s request cursors",
    (method) => {
      expectCode(
        frame(base(method, { contextId, cursor: "A".repeat(4097) })),
        "limit_exceeded"
      );
      expectCode(
        frame(base(method, { contextId, cursor: "abc+def" })),
        "invalid_request"
      );
      expectCode(
        frame(base(method, { contextId, cursor: "abc/def" })),
        "invalid_request"
      );
    }
  );
  const resultByMethod = {
    "review.files": { files: [], total: 0, nextCursor: validCursor },
    "review.feedback": {
      items: [],
      total: 0,
      nextCursor: validCursor,
      feedbackVersion: "f1",
      noteVersion: "v1",
      note: null
    }
  };
  it.each(["review.files", "review.feedback"] as const)(
    "accepts a long %s response cursor and rejects invalid ones",
    (method) => {
      const response = {
        version: 1,
        id: "transport-1",
        ok: true,
        result: resultByMethod[method]
      };
      expect(parseAgentResponse(frame(response), method)).toMatchObject(response);
      expect(() =>
        parseAgentResponse(
          frame({
            ...response,
            result: { ...response.result, nextCursor: "A".repeat(4097) }
          }),
          method
        )
      ).toThrow(AgentProtocolError);
      expect(() =>
        parseAgentResponse(
          frame({ ...response, result: { ...response.result, nextCursor: "abc+def" } }),
          method
        )
      ).toThrow(AgentProtocolError);
    }
  );
});

describe("legacy human feedback bodies", () => {
  const longBody = "x".repeat(10_001);
  it("accepts existing long notes and comments in responses", () => {
    const inspect = {
      version: 1,
      id: "transport-1",
      ok: true,
      result: {
        contextId,
        projectId: "/repo",
        repoPath: "/repo",
        target: { kind: "working_tree", projectId: "/repo", headSha: "abc" },
        targetId: "target",
        snapshotHash: "snapshot",
        fileCount: 0,
        visibleFileCount: 0,
        expiresAt: 100,
        noteVersion: "v1",
        note: { body: longBody, dismissedAt: null }
      }
    };
    expect(parseAgentResponse(frame(inspect), "review.inspect")).toMatchObject(inspect);
    const feedback = {
      version: 1,
      id: "transport-1",
      ok: true,
      result: {
        items: [
          {
            id: "comment",
            kind: "file",
            body: longBody,
            active: true,
            path: "src/a.ts",
            diffHash: "hash"
          }
        ],
        total: 1,
        nextCursor: null,
        feedbackVersion: "f1",
        noteVersion: "v1",
        note: null
      }
    };
    expect(parseAgentResponse(frame(feedback), "review.feedback")).toMatchObject(
      feedback
    );
  });
  it("still rejects an over-limit submitted body", () => {
    expectCode(
      frame(
        base("feedback.submit", {
          contextId,
          submission: {
            actor: { name: "Agent", runId: "run" },
            requestId: "req",
            items: [{ kind: "overall", expectedNoteVersion: "v1", body: longBody }]
          }
        })
      ),
      "limit_exceeded"
    );
  });
});

describe("feedback response metadata", () => {
  const metadata = {
    feedbackVersion: "f1",
    inactiveCount: 2,
    reviewedPathCount: 3,
    reviewedPathLimit: 100,
    reviewedPathsTruncated: false
  };
  const feedback = (item: Record<string, unknown>, inactiveCount: unknown = 2) => ({
    items: [item],
    total: 1,
    nextCursor: null,
    feedbackVersion: "f1",
    noteVersion: "v1",
    note: null,
    inactiveCount
  });
  const response = (result: unknown) =>
    frame({ version: 1, id: "transport-1", ok: true, result });
  const item = {
    id: "comment",
    kind: "file",
    body: "Review",
    active: true,
    path: "a.ts",
    diffHash: "hash"
  };
  it.each(["line", "file", "overall"])("accepts provenance for %s feedback", (kind) => {
    const scoped =
      kind === "overall"
        ? { id: "note", kind, body: "Review", active: true }
        : {
            ...item,
            kind,
            ...(kind === "line" ? { side: "additions", lineStart: 1, lineEnd: 1 } : {})
          };
    const result = feedback({
      ...scoped,
      reviewTargetId: "target",
      createdAt: "2026-10-14T10:00:00Z",
      updatedAt: "2026-10-14T11:00:00Z"
    });
    expect(parseAgentResponse(response(result), "review.feedback")).toMatchObject({
      result
    });
  });
  it.each([-1, 1.5, "2", Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid inactive count %s",
    (count) => {
      expect(() =>
        parseAgentResponse(response(feedback(item, count)), "review.feedback")
      ).toThrow(AgentProtocolError);
    }
  );
  it.each(["reviewTargetId", "createdAt", "updatedAt"])("rejects invalid %s", (field) => {
    for (const value of [42, "", "x".repeat(129)]) {
      expect(() =>
        parseAgentResponse(
          response(feedback({ ...item, [field]: value })),
          "review.feedback"
        )
      ).toThrow(AgentProtocolError);
    }
  });
  it.each(["prompt", "json"] as const)(
    "validates %s export metadata strictly",
    (format) => {
      const content =
        format === "prompt"
          ? "Review report"
          : {
              contextId,
              target: { kind: "working_tree", projectId: "/repo", headSha: "abc" },
              items: [],
              note: null,
              noteVersion: "v0"
            };
      const result = { format, content, metadata };
      expect(parseAgentResponse(response(result), "review.export")).toMatchObject({
        result
      });
      for (const invalid of [
        { ...metadata, extra: true },
        { ...metadata, feedbackVersion: "" },
        { ...metadata, inactiveCount: -1 },
        { ...metadata, reviewedPathCount: 1.5 },
        { ...metadata, reviewedPathLimit: -1 },
        { ...metadata, reviewedPathLimit: Number.MAX_SAFE_INTEGER + 1 },
        { ...metadata, reviewedPathsTruncated: "false" },
        { inactiveCount: 0 }
      ]) {
        expect(() =>
          parseAgentResponse(response({ ...result, metadata: invalid }), "review.export")
        ).toThrow(AgentProtocolError);
      }
    }
  );
});

it("accepts strict creator/editor provenance including human edits of agent feedback", () => {
  const item = {
    id: "i",
    kind: "file",
    body: "Review",
    active: true,
    path: "a",
    diffHash: "h",
    createdBy: { kind: "agent", name: "Reviewer", runId: "run" },
    lastEditedBy: { kind: "human" }
  };
  const encode = (entry: unknown) =>
    frame({
      version: 1,
      id: "r",
      ok: true,
      result: {
        items: [entry],
        total: 1,
        nextCursor: null,
        feedbackVersion: "f",
        noteVersion: "n",
        note: null
      }
    });
  expect(parseAgentResponse(encode(item), "review.feedback")).toMatchObject({
    result: { items: [item] }
  });
  for (const actor of [
    { kind: "robot" },
    { kind: "human", name: "forged" },
    { kind: "agent", name: "", runId: "r" },
    { kind: "agent", name: "A" },
    { kind: "agent", name: "A", runId: "bad run" }
  ])
    expect(() =>
      parseAgentResponse(encode({ ...item, lastEditedBy: actor }), "review.feedback")
    ).toThrow();
});

describe("worktree.label.set", () => {
  const worktree = {
    branchName: "codex/checkout",
    customLabel: "Checkout rework",
    displayName: "Checkout rework",
    displayPath: "/repo/agent",
    headSha: "1".repeat(40),
    id: "worktree-id",
    locked: false,
    shortHeadSha: "1111111",
    state: "available"
  };
  const success = (result: unknown) =>
    frame({ version: 1, id: "transport-1", ok: true, result });

  it("accepts set and reset requests with an absolute repository path", () => {
    expect(
      parseAgentRequest(
        frame(base("worktree.label.set", { repoPath: "/repo/agent", label: "Café 🚀" }))
      ).params
    ).toEqual({ repoPath: "/repo/agent", label: "Café 🚀" });
    expect(
      parseAgentRequest(
        frame(base("worktree.label.set", { repoPath: "/repo/agent", label: null }))
      ).params
    ).toEqual({ repoPath: "/repo/agent", label: null });
  });

  it.each([
    ["missing label", { repoPath: "/repo" }],
    ["blank label", { repoPath: "/repo", label: "   " }],
    ["oversized label", { repoPath: "/repo", label: "a".repeat(81) }],
    ["control character", { repoPath: "/repo", label: "Label\n" }],
    ["numeric label", { repoPath: "/repo", label: 3 }],
    ["relative repository", { repoPath: "repo", label: "Label" }],
    [
      "review selector",
      { repoPath: "/repo", label: "Label", selector: { kind: "selected" } }
    ],
    ["context id", { repoPath: "/repo", label: "Label", contextId }]
  ])("rejects an invalid request: %s", (_name, params) => {
    expect(() => parseAgentRequest(frame(base("worktree.label.set", params)))).toThrow(
      AgentProtocolError
    );
  });

  it("accepts trimmed labels up to 80 code points", () => {
    expect(() =>
      parseAgentRequest(
        frame(
          base("worktree.label.set", { repoPath: "/repo", label: ` ${"🚀".repeat(80)} ` })
        )
      )
    ).not.toThrow();
  });

  it("matches the shared label validator", () => {
    for (const label of [
      "Label",
      "  padded  ",
      "",
      "   ",
      "\tTab",
      "Line\n",
      "\u0085",
      "a".repeat(80),
      "a".repeat(81),
      "🚀".repeat(80),
      "🚀".repeat(81),
      "Label\u202e",
      "\u200b",
      "La\u2060bel",
      "Label\u2028",
      "a\ud800b",
      "\u200d",
      "Team \u{1f468}\u200d\u{1f469}"
    ]) {
      const request = () =>
        parseAgentRequest(frame(base("worktree.label.set", { repoPath: "/r", label })));
      if (normalizeWorktreeLabel(label).ok) expect(request).not.toThrow();
      else expect(request).toThrow(AgentProtocolError);
    }
  });

  it("accepts set and reset results", () => {
    expect(
      parseAgentResponse(
        success({ repoPath: "/repo/agent", worktree }),
        "worktree.label.set"
      )
    ).toMatchObject({ ok: true });
    const reset: Record<string, unknown> = {
      ...worktree,
      changeCount: 2,
      displayName: "codex/checkout"
    };
    delete reset.customLabel;
    expect(
      parseAgentResponse(
        success({ repoPath: "/repo/agent", worktree: reset }),
        "worktree.label.set"
      )
    ).toMatchObject({ ok: true });
  });

  it.each([
    ["missing nested id", { ...worktree, id: undefined }],
    ["extra nested key", { ...worktree, path: "/repo" }],
    ["malformed state", { ...worktree, state: "closed" }],
    ["wrong customLabel type", { ...worktree, customLabel: 3 }],
    ["null customLabel", { ...worktree, customLabel: null }],
    ["non-boolean locked", { ...worktree, locked: "no" }],
    ["negative change count", { ...worktree, changeCount: -1 }]
  ])("rejects an invalid result: %s", (_name, nested) => {
    expect(() =>
      parseAgentResponse(
        success({ repoPath: "/repo/agent", worktree: nested }),
        "worktree.label.set"
      )
    ).toThrow(AgentProtocolError);
  });

  it("rejects extra and missing outer result keys", () => {
    expect(() => parseAgentResponse(success({ worktree }), "worktree.label.set")).toThrow(
      AgentProtocolError
    );
    expect(() =>
      parseAgentResponse(
        success({ repoPath: "/repo/agent", worktree, projectId: "p" }),
        "worktree.label.set"
      )
    ).toThrow(AgentProtocolError);
  });
});
