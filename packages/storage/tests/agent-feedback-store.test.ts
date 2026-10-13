import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { openStorage } from "../src/index.js";

it("commits all scopes once, replays after reopening without target lookup, and retains creator on human edit", () => {
  const root = mkdtempSync(path.join(tmpdir(), "agent-batch-"));
  let s = openStorage(path.join(root, "store.db"));
  try {
    s.upsertProject({ id: "p", path: "/p", name: "P" });
    s.upsertReviewTarget({
      id: "t",
      projectId: "p",
      mode: "working_tree",
      headKind: "working_tree"
    });
    const actor = { kind: "agent" as const, name: "Reviewer", runId: "run-1" };
    const key = { actor, requestId: "batch-1", payloadHash: "hash" };
    const line = {
      kind: "line" as const,
      path: "a",
      diffHash: "h",
      side: "additions" as const,
      lineStart: 1,
      lineEnd: 2,
      body: "Range"
    };
    const input = {
      ...key,
      projectId: "p",
      reviewTargetId: "t",
      noteScopeId: "scope",
      items: [
        line,
        { ...line, lineStart: 1, lineEnd: 1, side: "deletions" as const },
        { kind: "file" as const, path: "a", diffHash: "h", body: "File" },
        {
          kind: "overall" as const,
          body: "Overall",
          expectedNoteVersion: s.getReviewNoteSnapshot("scope").token
        }
      ]
    };
    const read = () =>
      s.listAgentFeedbackPage({
        projectId: "p",
        reviewTargetId: "t",
        noteScopeId: "scope",
        files: [{ path: "a", diffHash: "h", visible: true }],
        includeInactive: false,
        limit: 100,
        offset: 0
      });
    expect(s.findAgentFeedbackReceipt(key)).toBeNull();
    const result = s.applyAgentFeedbackBatch(input);
    expect(result).toMatchObject({ requestId: "batch-1", deduplicated: false });
    expect(result.itemIds).toHaveLength(4);
    expect(s.listReviewComments("t")[0]).toMatchObject({
      createdBy: actor,
      lastEditedBy: actor
    });
    const version = read().feedbackVersion;
    expect(version).toBe(
      createHash("sha256")
        .update(JSON.stringify(["p", 1]))
        .digest("hex")
    );
    expect(s.applyAgentFeedbackBatch(input)).toEqual({ ...result, deduplicated: true });
    expect(read().feedbackVersion).toBe(version);
    expect(() =>
      s.findAgentFeedbackReceipt({ ...key, payloadHash: "changed" })
    ).toThrowError(/different payload/);
    s.close();
    s = openStorage(path.join(root, "store.db"));
    expect(s.findAgentFeedbackReceipt(key)).toEqual({ ...result, deduplicated: true });
    expect(s.applyAgentFeedbackBatch({ ...input, reviewTargetId: "missing" })).toEqual({
      ...result,
      deduplicated: true
    });
    const comment = s.listReviewComments("t")[0];
    if (!comment) throw new Error("Missing batch comment");
    expect(s.updateReviewComment(comment.id, "Human edit")).toMatchObject({
      createdBy: actor,
      lastEditedBy: { kind: "human" }
    });
    expect(read().feedbackVersion).not.toBe(version);
    const revision = s.getReviewNoteSnapshot("scope");
    s.deleteReviewNote("scope");
    s.saveReviewNote({ projectId: "p", scopeId: "scope", body: "Overall" });
    expect(s.getReviewNoteSnapshot("scope").token).not.toBe(revision.token);
    expect(() =>
      s.applyAgentFeedbackBatch({
        ...input,
        requestId: "new",
        items: [
          { kind: "overall", body: "Overwrite", expectedNoteVersion: revision.token }
        ]
      })
    ).toThrowError(/note changed/);
    expect(s.findAgentFeedbackReceipt({ ...key, requestId: "new" })).toBeNull();
  } finally {
    s.close();
    rmSync(root, { recursive: true, force: true });
  }
});

it("rolls back earlier batch items and receipts when a later item fails", () => {
  const s = openStorage(":memory:");
  try {
    s.upsertProject({ id: "p", path: "/p", name: "P" });
    s.upsertReviewTarget({
      id: "t",
      projectId: "p",
      mode: "working_tree",
      headKind: "working_tree"
    });
    const key = {
      actor: { kind: "agent" as const, name: "Agent", runId: "r" },
      requestId: "b",
      payloadHash: "h"
    };
    expect(() =>
      s.applyAgentFeedbackBatch({
        ...key,
        projectId: "p",
        reviewTargetId: "t",
        noteScopeId: "scope",
        items: [
          { kind: "file", path: "a", diffHash: "h", body: "good" },
          {
            kind: "line",
            path: "a",
            diffHash: "h",
            side: "additions",
            lineStart: 2,
            lineEnd: 1,
            body: "invalid"
          }
        ]
      })
    ).toThrow();
    expect(s.listReviewFileComments("t")).toEqual([]);
    expect(s.findAgentFeedbackReceipt(key)).toBeNull();
  } finally {
    s.close();
  }
});
