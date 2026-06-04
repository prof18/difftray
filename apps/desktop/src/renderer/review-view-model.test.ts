import { describe, expect, it } from "vitest";

import {
  clampIndex,
  clampNumber,
  diffTargetLabel,
  diffSideFocusForFile,
  errorMessage,
  firstVisiblePath,
  nextPendingPath,
  omitProjectReviewSummary,
  fileListHeaderMetrics,
  projectReviewSummary,
  reviewState,
  reviewSummariesEqual,
  reviewSummaryState,
  splitPath,
  suggestedBaseRef,
  themeModeFromValue,
  visiblePathOrFirst
} from "./review-view-model.js";

describe("workspace file selection helpers", () => {
  it("selects the next visible pending path and wraps to the first pending file", () => {
    const workspace = reviewWorkspace([
      reviewFile("a.ts", { reviewed: true }),
      reviewFile("b.ts", { reviewed: false }),
      reviewFile("c.ts", { reviewed: false, visible: false }),
      reviewFile("d.ts", { reviewed: false })
    ]);

    expect(nextPendingPath(workspace, "a.ts")).toBe("b.ts");
    expect(nextPendingPath(workspace, "d.ts")).toBe("b.ts");
  });

  it("keeps a visible preferred path or falls back to the first visible file", () => {
    const workspace = reviewWorkspace([
      reviewFile("hidden.ts", { visible: false }),
      reviewFile("visible.ts")
    ]);

    expect(firstVisiblePath(workspace)).toBe("visible.ts");
    expect(visiblePathOrFirst(workspace, "visible.ts")).toBe("visible.ts");
    expect(visiblePathOrFirst(workspace, "missing.ts")).toBe("visible.ts");
  });
});

describe("review target labels", () => {
  it("formats branch and working-tree targets", () => {
    expect(
      diffTargetLabel({
        baseRefName: "origin/main",
        headRefName: "feature",
        headSha: "abc123",
        id: "target-branch",
        kind: "branch"
      })
    ).toBe("against origin/main");
    expect(
      diffTargetLabel({
        headSha: "abc123",
        id: "target-working-tree",
        kind: "working_tree"
      })
    ).toBe("worktree");
  });
});

describe("project review summaries", () => {
  it("derives attention count from visible invalidated files", () => {
    const workspace = reviewWorkspace([
      reviewFile("visible-invalid.ts", { invalidated: true }),
      reviewFile("hidden-invalid.ts", { invalidated: true, visible: false }),
      reviewFile("visible-clean.ts")
    ]);

    expect(projectReviewSummary(workspace)).toEqual({
      attentionCount: 1,
      progress: workspace.progress
    });
  });

  it("compares and omits project review summaries", () => {
    const left = summary(1, 2, 0);

    expect(reviewSummariesEqual(undefined, left)).toBe(false);
    expect(reviewSummariesEqual(left, summary(1, 2, 0))).toBe(true);
    expect(reviewSummariesEqual(left, summary(2, 2, 0))).toBe(false);
    expect(
      omitProjectReviewSummary({
        id: "project-1",
        name: "Difftray",
        path: "/repo/difftray",
        reviewSummary: left
      })
    ).toEqual({
      id: "project-1",
      name: "Difftray",
      path: "/repo/difftray"
    });
  });
});

describe("review state helpers", () => {
  it("prioritizes invalidated files over reviewed state", () => {
    expect(reviewState(reviewFile("a.ts", { invalidated: true, reviewed: true }))).toBe(
      "attention"
    );
    expect(reviewState(reviewFile("b.ts", { reviewed: true }))).toBe("reviewed");
    expect(reviewState(reviewFile("c.ts"))).toBe("pending");
  });

  it("summarizes project review state", () => {
    expect(reviewSummaryState(summary(0, 3, 1))).toBe("attention");
    expect(reviewSummaryState(summary(3, 3, 0))).toBe("reviewed");
    expect(reviewSummaryState(summary(0, 0, 0))).toBe("pending");
  });

  it("forces both-side focus for unified, added, and deleted diffs", () => {
    expect(diffSideFocusForFile(reviewFile("a.ts"), "unified", "new")).toBe("both");
    expect(
      diffSideFocusForFile(reviewFile("b.ts", { status: "added" }), "split", "new")
    ).toBe("both");
    expect(diffSideFocusForFile(reviewFile("c.ts"), "split", "new")).toBe("new");
  });
});

describe("file list header metrics", () => {
  it("counts pending, reviewed, and attention files for progress segments", () => {
    const thirdPercent = (1 / 3) * 100;

    expect(
      fileListHeaderMetrics({
        attentionCount: 1,
        files: [
          reviewFile("pending.ts"),
          reviewFile("reviewed.ts", { reviewed: true }),
          reviewFile("invalidated.ts", { invalidated: true })
        ]
      })
    ).toEqual({
      attentionCount: 1,
      attentionPercent: thirdPercent,
      pendingCount: 1,
      pendingPercent: thirdPercent,
      reviewedCount: 1,
      reviewedPercent: thirdPercent,
      total: 3
    });
  });

  it("keeps progress percentages finite when the file list is empty", () => {
    expect(fileListHeaderMetrics({ attentionCount: 0, files: [] })).toEqual({
      attentionCount: 0,
      attentionPercent: 0,
      pendingCount: 0,
      pendingPercent: 0,
      reviewedCount: 0,
      reviewedPercent: 0,
      total: 1
    });
  });
});

describe("small view helpers", () => {
  it("suggests a base ref without selecting the current head", () => {
    expect(suggestedBaseRef(["feature", "origin/main"], "feature")).toBe("origin/main");
    expect(suggestedBaseRef(["feature", "develop"], "feature")).toBe("develop");
    expect(suggestedBaseRef(["feature"], "feature")).toBeUndefined();
  });

  it("splits paths, clamps numbers, and normalizes theme values", () => {
    expect(splitPath("src/renderer/App.tsx")).toEqual({
      dirname: "src/renderer",
      filename: "App.tsx"
    });
    expect(splitPath("App.tsx")).toEqual({ dirname: ".", filename: "App.tsx" });
    expect(clampIndex(-1, 3)).toBe(2);
    expect(clampIndex(3, 3)).toBe(0);
    expect(clampNumber(12.7, 0, 10)).toBe(10);
    expect(themeModeFromValue("dark")).toBe("dark");
    expect(themeModeFromValue("unexpected")).toBe("system");
  });

  it("formats unknown errors safely", () => {
    expect(errorMessage(new Error("No repository selected"))).toBe(
      "No repository selected"
    );
    expect(errorMessage("boom")).toBe("Unexpected Difftray error.");
  });
});

function reviewWorkspace(files: readonly ReviewFileView[]): ReviewWorkspaceView {
  return {
    comments: [],
    files,
    progress: {
      reviewedVisibleFiles: files.filter((file) => file.visible && file.reviewed).length,
      totalVisibleReviewableFiles: files.filter((file) => file.visible && file.reviewable)
        .length
    },
    project: {
      id: "project-1",
      name: "Difftray",
      path: "/repo/difftray"
    },
    reviewTarget: {
      headSha: "abc123",
      id: "target-1",
      kind: "working_tree"
    }
  };
}

function reviewFile(path: string, patch: Partial<ReviewFileView> = {}): ReviewFileView {
  return {
    additions: 1,
    deletions: 0,
    diffHash: `hash-${path}`,
    diffLoaded: false,
    generated: false,
    invalidated: false,
    path,
    reviewable: true,
    reviewed: false,
    status: "modified",
    visible: true,
    ...patch
  };
}

function summary(
  reviewedVisibleFiles: number,
  totalVisibleReviewableFiles: number,
  attentionCount: number
): ProjectReviewSummaryView {
  return {
    attentionCount,
    progress: {
      reviewedVisibleFiles,
      totalVisibleReviewableFiles
    }
  };
}
