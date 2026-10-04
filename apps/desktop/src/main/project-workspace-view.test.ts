import { createReviewNoteScopeId, type ReviewTarget } from "@difftray/core";
import { describe, expect, it } from "vitest";

import {
  activeReviewCommentViews,
  reviewWorkspaceView
} from "./project-workspace-view.js";
import type { FileReviewStateWithSummary } from "./view-models.js";

describe("project workspace views", () => {
  it("builds the renderer workspace shape and preserves branch target metadata", () => {
    const progress = {
      reviewedVisibleFiles: 0,
      totalVisibleReviewableFiles: 1
    };
    const workspace = reviewWorkspaceView({
      comments: [
        reviewCommentRecord({
          diffHash: "hash-1",
          id: "comment-active",
          path: "src/App.tsx"
        }),
        reviewCommentRecord({
          diffHash: "old-hash",
          id: "comment-stale",
          path: "src/App.tsx"
        })
      ],
      fileComments: [],
      files: [
        reviewFileStateWithSummary("src/App.tsx", {
          diffHash: "hash-1",
          invalidated: true
        })
      ],
      progress,
      project: {
        createdAt: "2026-01-01T00:00:00.000Z",
        defaultBaseRef: "origin/main",
        id: "project-1",
        lastOpenedAt: "2026-01-01T00:00:00.000Z",
        name: "Difftray",
        path: "/repo/difftray",
        updatedAt: "2026-01-01T00:00:00.000Z"
      },
      reviewTarget: {
        baseRefName: "origin/main",
        baseSha: "base-sha",
        headRefName: "feature",
        headSha: "head-sha",
        kind: "branch",
        mergeBaseSha: "merge-base-sha",
        projectId: "project-1"
      },
      reviewNote: null,
      reviewTargetId: "target-1"
    });

    expect(workspace.comments.map((comment) => comment.id)).toEqual(["comment-active"]);
    expect(workspace.files).toHaveLength(1);
    expect(workspace.project).toMatchObject({
      defaultBaseRef: "origin/main",
      id: "project-1",
      reviewSummary: {
        attentionCount: 1,
        progress
      }
    });
    expect(workspace.reviewTarget).toEqual({
      baseRefName: "origin/main",
      headRefName: "feature",
      headSha: "head-sha",
      id: "target-1",
      kind: "branch"
    });
  });

  it("includes active file comments and the review note for the current scope", () => {
    const reviewTarget = {
      headRefName: "main",
      headSha: "head-sha",
      kind: "working_tree",
      projectId: "project-1"
    } satisfies ReviewTarget;
    const note = {
      body: "Overall feedback.",
      createdAt: "2026-01-01T00:00:00.000Z",
      dismissedAt: "2026-01-02T00:00:00.000Z",
      projectId: "project-1",
      scopeId: createReviewNoteScopeId(reviewTarget),
      updatedAt: "2026-01-02T00:00:00.000Z"
    };
    const input = {
      comments: [],
      fileComments: [
        reviewFileCommentRecord({ id: "active", previousPath: "src/Old.tsx" }),
        reviewFileCommentRecord({ diffHash: "old-hash", id: "stale" }),
        reviewFileCommentRecord({ id: "other-target", reviewTargetId: "target-2" })
      ],
      files: [reviewFileStateWithSummary("src/App.tsx", { diffHash: "hash-1" })],
      progress: { reviewedVisibleFiles: 0, totalVisibleReviewableFiles: 1 },
      project: {
        createdAt: "2026-01-01T00:00:00.000Z",
        id: "project-1",
        name: "Difftray",
        path: "/repo/difftray",
        updatedAt: "2026-01-01T00:00:00.000Z"
      },
      reviewNote: note,
      reviewTarget,
      reviewTargetId: "target-1"
    };

    const workspace = reviewWorkspaceView(input);

    expect(workspace.fileComments).toEqual([
      {
        body: "Split this file.",
        createdAt: "2026-01-01T00:00:00.000Z",
        diffHash: "hash-1",
        id: "active",
        path: "src/App.tsx",
        previousPath: "src/Old.tsx",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ]);
    expect(workspace.reviewNote).toEqual({
      body: "Overall feedback.",
      createdAt: "2026-01-01T00:00:00.000Z",
      dismissedAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z"
    });
    expect(reviewWorkspaceView({ ...input, reviewNote: null }).reviewNote).toBeNull();
    expect(
      reviewWorkspaceView({ ...input, reviewNote: { ...note, scopeId: "other-scope" } })
        .reviewNote
    ).toBeNull();
  });

  it("keeps only comments for the active target and current diff hash", () => {
    expect(
      activeReviewCommentViews(
        "target-1",
        [reviewFileStateWithSummary("src/App.tsx", { diffHash: "hash-1" })],
        [
          reviewCommentRecord({
            diffHash: "hash-1",
            id: "active",
            path: "src/App.tsx",
            reviewTargetId: "target-1"
          }),
          reviewCommentRecord({
            diffHash: "hash-1",
            id: "other-target",
            path: "src/App.tsx",
            reviewTargetId: "target-2"
          }),
          reviewCommentRecord({
            diffHash: "old-hash",
            id: "stale",
            path: "src/App.tsx",
            reviewTargetId: "target-1"
          }),
          reviewCommentRecord({
            diffHash: "hash-1",
            id: "missing-file",
            path: "src/Missing.tsx",
            reviewTargetId: "target-1"
          })
        ]
      ).map((comment) => comment.id)
    ).toEqual(["active"]);
  });
});

function reviewCommentRecord(
  patch: Partial<{
    readonly diffHash: string;
    readonly id: string;
    readonly path: string;
    readonly reviewTargetId: string;
  }>
) {
  return {
    body: "Looks wrong",
    createdAt: "2026-01-01T00:00:00.000Z",
    diffHash: "hash-1",
    id: "comment-1",
    lineEnd: 1,
    lineStart: 1,
    path: "src/App.tsx",
    projectId: "project-1",
    reviewTargetId: "target-1",
    side: "additions" as const,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...patch
  };
}

function reviewFileCommentRecord(
  patch: Partial<{
    readonly diffHash: string;
    readonly id: string;
    readonly previousPath: string;
    readonly reviewTargetId: string;
  }>
) {
  return {
    body: "Split this file.",
    createdAt: "2026-01-01T00:00:00.000Z",
    diffHash: "hash-1",
    id: "file-comment-1",
    path: "src/App.tsx",
    projectId: "project-1",
    reviewTargetId: "target-1",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...patch
  };
}

function reviewFileStateWithSummary(
  filePath: string,
  patch: Partial<FileReviewStateWithSummary["state"]> = {}
): FileReviewStateWithSummary {
  return {
    state: {
      diff: {
        content: { kind: "text", patch: "summary patch" },
        newPath: filePath,
        status: "modified"
      },
      diffHash: "hash-1",
      generated: false,
      invalidated: false,
      path: filePath,
      reviewable: true,
      reviewed: false,
      visible: true,
      ...patch
    },
    summary: {
      additions: 2,
      content: { kind: "text", patch: "summary patch" },
      deletions: 1,
      newPath: filePath,
      status: "modified"
    }
  };
}
