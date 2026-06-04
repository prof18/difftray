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
