import { describe, expect, it } from "vitest";

import {
  parseCompanionServerEvent,
  parseCreateCommentBody,
  parseCreateFileCommentBody,
  parseDiffTargetBody,
  parseFileImageBody,
  parseMarkReviewedBody,
  parseProjectWorktreeAvailabilityBody,
  parseOpenWorktreeBody,
  parseOpenRepositoriesBody,
  parsePairRequestBody,
  parseReviewNoteTargetBody,
  parseSaveReviewNoteBody,
  parseSetReviewNoteDismissedBody,
  parseUpdateCommentBody
} from "../src/index.js";

describe("parseOpenWorktreeBody", () => {
  it("accepts opaque ids and rejects raw or missing path payloads", () => {
    expect(parseOpenWorktreeBody({ worktreeId: "opaque-id" })).toEqual({
      ok: true,
      value: { worktreeId: "opaque-id" }
    });
    expect(parseOpenWorktreeBody({ path: "/workspace/agent" })).toEqual({
      error: "missing worktreeId",
      ok: false
    });
  });
});

describe("parseProjectWorktreeAvailabilityBody", () => {
  it("accepts a bounded unique set of opaque project ids", () => {
    expect(parseProjectWorktreeAvailabilityBody({ projectIds: ["one", "two"] })).toEqual({
      ok: true,
      value: { projectIds: ["one", "two"] }
    });
  });

  it("rejects malformed, duplicate, and oversized project id requests", () => {
    expect(parseProjectWorktreeAvailabilityBody({})).toEqual({
      error: "projectIds must contain 1 to 100 ids",
      ok: false
    });
    expect(parseProjectWorktreeAvailabilityBody({ projectIds: ["one", "one"] })).toEqual({
      error: "projectIds must not contain duplicates",
      ok: false
    });
    expect(
      parseProjectWorktreeAvailabilityBody({
        projectIds: Array.from({ length: 101 }, (_, index) => `project-${index}`)
      })
    ).toEqual({ error: "projectIds must contain 1 to 100 ids", ok: false });
  });
});

describe("parseOpenRepositoriesBody", () => {
  it("accepts bounded opaque ids and rejects duplicates and raw paths", () => {
    expect(parseOpenRepositoriesBody({ repositoryIds: ["one", "two"] })).toEqual({
      ok: true,
      value: { repositoryIds: ["one", "two"] }
    });
    expect(parseOpenRepositoriesBody({ repositoryIds: ["one", "one"] }).ok).toBe(false);
    expect(parseOpenRepositoriesBody({ paths: ["/workspace/repo"] }).ok).toBe(false);
  });
});

describe("parsePairRequestBody", () => {
  it("accepts exactly one QR secret or manual code", () => {
    expect(
      parsePairRequestBody({
        deviceId: "device-a",
        deviceName: "Marco's iPhone",
        devicePublicKey: "device-pk",
        platform: "ios",
        protocolVersion: 1,
        secret: "pair-secret"
      })
    ).toEqual({
      ok: true,
      value: {
        deviceId: "device-a",
        deviceName: "Marco's iPhone",
        devicePublicKey: "device-pk",
        platform: "ios",
        protocolVersion: 1,
        secret: "pair-secret"
      }
    });

    expect(
      parsePairRequestBody({
        code: "123456",
        deviceId: "device-a",
        deviceName: "Marco's iPhone",
        devicePublicKey: "device-pk",
        platform: "ios",
        protocolVersion: 1
      })
    ).toEqual(
      expect.objectContaining({
        ok: true
      })
    );
  });

  it("rejects missing fields, unsupported platforms, and mixed credentials", () => {
    expect(parsePairRequestBody({})).toEqual({
      error: "missing deviceId",
      ok: false
    });
    expect(
      parsePairRequestBody({
        code: "123456",
        deviceId: "device-a",
        deviceName: "Phone",
        devicePublicKey: "device-pk",
        platform: "web",
        protocolVersion: 1
      })
    ).toEqual({ error: "unsupported platform", ok: false });
    expect(
      parsePairRequestBody({
        code: "123456",
        deviceId: "device-a",
        deviceName: "Phone",
        devicePublicKey: "device-pk",
        platform: "android",
        protocolVersion: 1,
        secret: "pair-secret"
      })
    ).toEqual({ error: "provide exactly one of secret or code", ok: false });
  });
});

describe("review request parsers", () => {
  it("parses image side requests and rejects unsupported sides", () => {
    expect(parseFileImageBody({ path: "screens/home.png", side: "new" })).toEqual({
      ok: true,
      value: { path: "screens/home.png", side: "new" }
    });
    expect(parseFileImageBody({ path: "screens/home.png", side: "both" })).toEqual({
      error: "unsupported side",
      ok: false
    });
  });

  it("parses mark reviewed bodies with optional previous paths", () => {
    expect(
      parseMarkReviewedBody({
        displayedDiffHash: "hash",
        path: "src/App.tsx",
        previousPath: "src/OldApp.tsx",
        reviewTargetId: "target"
      })
    ).toEqual({
      ok: true,
      value: {
        displayedDiffHash: "hash",
        path: "src/App.tsx",
        previousPath: "src/OldApp.tsx",
        reviewTargetId: "target"
      }
    });
  });

  it("parses comment create/update bodies and rejects wrong types", () => {
    expect(
      parseCreateCommentBody({
        body: "Please simplify this branch.",
        diffHash: "hash",
        lineEnd: 12,
        lineStart: 10,
        path: "src/App.tsx",
        reviewTargetId: "target",
        side: "additions"
      })
    ).toEqual(
      expect.objectContaining({
        ok: true
      })
    );
    expect(parseCreateCommentBody({ lineStart: "10" })).toEqual({
      error: "missing body",
      ok: false
    });
    expect(parseUpdateCommentBody({ body: "Updated" })).toEqual({
      ok: true,
      value: { body: "Updated" }
    });
    expect(parseUpdateCommentBody({ body: 42 })).toEqual({
      error: "missing body",
      ok: false
    });
  });

  it("parses diff target requests", () => {
    expect(parseDiffTargetBody({ mode: "working_tree" })).toEqual({
      ok: true,
      value: { mode: "working_tree" }
    });
    expect(parseDiffTargetBody({ mode: "branch", ref: "origin/main" })).toEqual({
      ok: true,
      value: { mode: "branch", ref: "origin/main" }
    });
    expect(parseDiffTargetBody({ mode: "commit" })).toEqual({
      error: "missing ref",
      ok: false
    });
  });
});

describe("parseCompanionServerEvent", () => {
  it("accepts every server event shape", () => {
    expect(
      parseCompanionServerEvent({
        kind: "hello",
        protocolVersion: 1,
        serverName: "MacBook"
      })
    ).toEqual(
      expect.objectContaining({
        ok: true
      })
    );
    expect(
      parseCompanionServerEvent({
        kind: "workspace_changed",
        projectId: "project-a",
        reason: "comments"
      })
    ).toEqual(
      expect.objectContaining({
        ok: true
      })
    );
    expect(parseCompanionServerEvent({ kind: "device_revoked" })).toEqual({
      ok: true,
      value: { kind: "device_revoked" }
    });
    expect(parseCompanionServerEvent({ kind: "server_stopping" })).toEqual({
      ok: true,
      value: { kind: "server_stopping" }
    });
  });

  it("rejects malformed events", () => {
    expect(parseCompanionServerEvent({ kind: "workspace_changed" })).toEqual({
      error: "missing projectId",
      ok: false
    });
    expect(parseCompanionServerEvent({ kind: "hello", protocolVersion: "1" })).toEqual({
      error: "missing protocolVersion",
      ok: false
    });
    expect(parseCompanionServerEvent({ kind: "hello", protocolVersion: 1.5 })).toEqual({
      error: "missing protocolVersion",
      ok: false
    });
  });
});

describe("file comment and review note bodies", () => {
  it("parses file comment bodies and keeps previousPath only when present", () => {
    expect(
      parseCreateFileCommentBody({
        body: "Split this file.",
        diffHash: "hash",
        path: "src/App.tsx",
        reviewTargetId: "target"
      })
    ).toEqual({
      ok: true,
      value: {
        body: "Split this file.",
        diffHash: "hash",
        path: "src/App.tsx",
        reviewTargetId: "target"
      }
    });
    expect(
      parseCreateFileCommentBody({
        body: "Split this file.",
        diffHash: "hash",
        path: "src/App.tsx",
        previousPath: "src/Old.tsx",
        reviewTargetId: "target"
      })
    ).toEqual({
      ok: true,
      value: {
        body: "Split this file.",
        diffHash: "hash",
        path: "src/App.tsx",
        previousPath: "src/Old.tsx",
        reviewTargetId: "target"
      }
    });
    expect(
      parseCreateFileCommentBody({
        body: "x",
        diffHash: "hash",
        reviewTargetId: "target"
      })
    ).toEqual({ error: "missing path", ok: false });
    expect(
      parseCreateFileCommentBody({
        body: "x",
        diffHash: 1,
        path: "src/App.tsx",
        reviewTargetId: "target"
      })
    ).toEqual({ error: "missing diffHash", ok: false });
    expect(
      parseCreateFileCommentBody({
        body: "x",
        diffHash: "hash",
        path: "src/App.tsx",
        previousPath: 3,
        reviewTargetId: "target"
      })
    ).toEqual({ error: "previousPath must be a string", ok: false });
  });

  it("parses review note save bodies", () => {
    expect(
      parseSaveReviewNoteBody({ body: "Overall.", reviewTargetId: "target" })
    ).toEqual({
      ok: true,
      value: { body: "Overall.", reviewTargetId: "target" }
    });
    expect(parseSaveReviewNoteBody({ reviewTargetId: "target" })).toEqual({
      error: "missing body",
      ok: false
    });
    expect(parseSaveReviewNoteBody({ body: "Overall.", reviewTargetId: 4 })).toEqual({
      error: "missing reviewTargetId",
      ok: false
    });
  });

  it("parses review note dismissal bodies and rejects non-boolean flags", () => {
    expect(
      parseSetReviewNoteDismissedBody({ dismissed: true, reviewTargetId: "target" })
    ).toEqual({ ok: true, value: { dismissed: true, reviewTargetId: "target" } });
    expect(
      parseSetReviewNoteDismissedBody({ dismissed: false, reviewTargetId: "target" })
    ).toEqual({ ok: true, value: { dismissed: false, reviewTargetId: "target" } });
    expect(
      parseSetReviewNoteDismissedBody({ dismissed: "yes", reviewTargetId: "target" })
    ).toEqual({ error: "missing dismissed", ok: false });
    expect(parseSetReviewNoteDismissedBody({ reviewTargetId: "target" })).toEqual({
      error: "missing dismissed",
      ok: false
    });
    expect(parseSetReviewNoteDismissedBody({ dismissed: true })).toEqual({
      error: "missing reviewTargetId",
      ok: false
    });
  });

  it("parses review note target bodies", () => {
    expect(parseReviewNoteTargetBody({ reviewTargetId: "target" })).toEqual({
      ok: true,
      value: { reviewTargetId: "target" }
    });
    expect(parseReviewNoteTargetBody({})).toEqual({
      error: "missing reviewTargetId",
      ok: false
    });
  });
});
