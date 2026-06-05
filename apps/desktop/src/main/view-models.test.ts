import { describe, expect, it } from "vitest";

import {
  appSettingsView,
  commentReportContext,
  fileDiffFromGit,
  patchForDiff,
  projectProgressFromGit,
  projectView,
  reviewCommentView,
  reviewFileView,
  projectReviewSummaryView,
  reviewProgressView,
  reviewTargetFromGit,
  reviewTargetFromRecord,
  reviewTargetLabel,
  reviewTargetRecord,
  sameCommentIds,
  settingsView,
  summarizePatch,
  workspaceWithUpdatedReviewState,
  type FileReviewStateWithSummary,
  type ReviewFileDiffContentView,
  type ReviewFileView,
  type ReviewWorkspaceView
} from "./view-models.js";

describe("settings views", () => {
  it("maps project settings directly", () => {
    expect(
      settingsView({
        fileListCollapsed: true,
        fileListWidth: 420,
        projectId: "project-1"
      })
    ).toEqual({
      fileListCollapsed: true,
      fileListWidth: 420,
      projectId: "project-1"
    });
  });

  it("exposes trusted editor presets and hides untrusted editor configs", () => {
    expect(
      appSettingsView({
        autoCollapseHunksOver: 80,
        defaultDiffMode: "split",
        editorLaunchConfig: {
          args: ["-b", "com.microsoft.VSCode", "{path}"],
          command: "open"
        },
        hideWhitespaceOnlyChanges: true,
        notifyOnDrift: false,
        reviewResetTrigger: "diff_content",
        showGeneratedFiles: true,
        themeMode: "dark",
        wrapDiffLines: false
      })
    ).toMatchObject({
      editorArgList: ["-b", "com.microsoft.VSCode", "{path}"],
      editorArgs: "-b com.microsoft.VSCode {path}",
      editorCommand: "open",
      editorMode: "preset"
    });

    expect(
      appSettingsView({
        autoCollapseHunksOver: 80,
        defaultDiffMode: "split",
        editorLaunchConfig: {
          args: ["-c", "touch /tmp/nope"],
          command: "/bin/sh"
        },
        hideWhitespaceOnlyChanges: true,
        notifyOnDrift: false,
        reviewResetTrigger: "diff_content",
        showGeneratedFiles: true,
        themeMode: "dark",
        wrapDiffLines: false
      })
    ).toMatchObject({
      editorArgList: [],
      editorArgs: "",
      editorCommand: "",
      editorMode: "system"
    });
  });
});

describe("project and review target views", () => {
  it("omits optional project fields when they are absent", () => {
    expect(
      projectView({
        id: "project-1",
        name: "Difftray",
        path: "/repo/difftray"
      })
    ).toEqual({
      id: "project-1",
      name: "Difftray",
      path: "/repo/difftray"
    });
  });

  it("maps branch and working-tree review targets between Git, storage, and core", () => {
    const branchTarget = reviewTargetFromGit({
      baseRefName: "origin/main",
      baseSha: "base-sha",
      headRefName: "feature",
      headSha: "head-sha",
      kind: "branch",
      mergeBaseSha: "merge-base-sha",
      projectId: "project-1"
    });
    const branchRecord = reviewTargetRecord("target-1", branchTarget);

    expect(branchRecord).toEqual({
      baseRefName: "origin/main",
      baseRefSha: "base-sha",
      headKind: "ref",
      headRefName: "feature",
      headRefSha: "head-sha",
      id: "target-1",
      mergeBaseSha: "merge-base-sha",
      mode: "branch",
      projectId: "project-1"
    });
    expect(reviewTargetFromRecord(branchRecord)).toEqual(branchTarget);
    expect(
      reviewTargetFromGit({
        commitSha: "commit-sha",
        commitShortSha: "commit",
        commitSubject: "Change focused file",
        headSha: "commit-sha",
        kind: "commit",
        parentSha: "parent-sha",
        projectId: "project-1"
      })
    ).toEqual({
      commitSha: "commit-sha",
      commitShortSha: "commit",
      commitSubject: "Change focused file",
      headSha: "commit-sha",
      kind: "commit",
      parentSha: "parent-sha",
      projectId: "project-1"
    });
    expect(
      reviewTargetFromGit({
        headSha: "head-sha",
        kind: "working_tree",
        projectId: "project-1"
      })
    ).toEqual({
      headSha: "head-sha",
      kind: "working_tree",
      projectId: "project-1"
    });
  });

  it("rejects incomplete stored branch targets and labels targets for reports", () => {
    expect(
      reviewTargetFromRecord({
        baseRefName: "origin/main",
        headKind: "ref",
        headRefSha: "head-sha",
        id: "target-1",
        mode: "branch",
        projectId: "project-1"
      })
    ).toBeUndefined();
    expect(reviewTargetLabel({ baseRefName: "origin/main", kind: "branch" })).toBe(
      "Against origin/main"
    );
    expect(reviewTargetLabel({ commitShortSha: "abc1234", kind: "commit" })).toBe(
      "Commit abc1234"
    );
    expect(reviewTargetLabel({ kind: "working_tree" })).toBe("Git changes");
  });

  it("maps commit review targets between storage and core", () => {
    const commitTarget = reviewTargetFromGit({
      commitSha: "commit-sha",
      commitShortSha: "commit",
      commitSubject: "Change focused file",
      headSha: "commit-sha",
      kind: "commit",
      parentSha: "parent-sha",
      projectId: "project-1"
    });
    const commitRecord = reviewTargetRecord("target-commit", commitTarget);

    expect(commitRecord).toEqual({
      commitSha: "commit-sha",
      commitShortSha: "commit",
      commitSubject: "Change focused file",
      headKind: "ref",
      headRefSha: "commit-sha",
      id: "target-commit",
      mode: "commit",
      parentSha: "parent-sha",
      projectId: "project-1"
    });
    expect(reviewTargetFromRecord(commitRecord)).toEqual(commitTarget);
    expect(
      reviewTargetFromRecord({
        commitSha: "commit-sha",
        headKind: "ref",
        headRefSha: "commit-sha",
        id: "target-commit",
        mode: "commit",
        projectId: "project-1"
      })
    ).toBeUndefined();
  });
});

describe("diff and review file views", () => {
  it("maps Git diff summaries to core file diffs", () => {
    expect(
      fileDiffFromGit({
        additions: 2,
        content: { kind: "text", patch: "patch" },
        deletions: 1,
        newPath: "src/new.ts",
        oldPath: "src/old.ts",
        status: "renamed"
      })
    ).toEqual({
      content: { kind: "text", patch: "patch" },
      newPath: "src/new.ts",
      oldPath: "src/old.ts",
      status: "renamed"
    });
  });

  it("builds fallback patches for non-text diffs", () => {
    expect(
      patchForDiff({
        content: { byteSize: 123, digest: "abc123", kind: "binary" },
        newPath: "assets/icon.png",
        status: "modified"
      })
    ).toBe(
      [
        "diff --git a/assets/icon.png b/assets/icon.png",
        "Binary file changed (123 bytes)",
        "sha256 abc123"
      ].join("\n")
    );
    expect(
      patchForDiff({
        content: { kind: "mode_only" },
        newMode: "100755",
        newPath: "script.sh",
        oldMode: "100644",
        status: "mode_changed"
      })
    ).toBe("Mode changed: 100644 -> 100755");
  });

  it("summarizes patch body changes without counting file headers", () => {
    expect(
      summarizePatch(
        ["--- a/src/App.tsx", "+++ b/src/App.tsx", "-old", "+new", " context"].join("\n")
      )
    ).toEqual({ additions: 1, deletions: 1 });
  });

  it("hydrates review file views with detailed text diffs when available", () => {
    const file = reviewFileStateWithSummary();

    expect(reviewFileView(file)).toMatchObject({
      additions: 2,
      deletions: 1,
      diffLoaded: false,
      path: "src/App.tsx"
    });
    expect(
      reviewFileView(file, {
        content: {
          kind: "text",
          newText: "new\n",
          oldText: "old\n",
          patch: ["--- a/src/App.tsx", "+++ b/src/App.tsx", "-old", "+new"].join("\n")
        },
        newPath: "src/App.tsx",
        oldPath: "src/OldApp.tsx",
        status: "renamed"
      })
    ).toMatchObject({
      additions: 1,
      deletions: 1,
      diffLoaded: true,
      newText: "new\n",
      oldText: "old\n",
      patch: ["--- a/src/App.tsx", "+++ b/src/App.tsx", "-old", "+new"].join("\n"),
      previousPath: "src/OldApp.tsx"
    });
  });
});

describe("review progress views", () => {
  it("counts only visible reviewable files in progress", () => {
    expect(
      reviewProgressView([
        reviewFileViewState("reviewed.ts", { reviewed: true }),
        reviewFileViewState("pending.ts"),
        reviewFileViewState("hidden.ts", { visible: false }),
        reviewFileViewState("generated.md", { reviewable: false })
      ])
    ).toEqual({
      reviewedVisibleFiles: 1,
      totalVisibleReviewableFiles: 2
    });
  });

  it("summarizes visible invalidated files as attention count", () => {
    const progress = {
      reviewedVisibleFiles: 1,
      totalVisibleReviewableFiles: 2
    };

    expect(
      projectReviewSummaryView(
        [
          reviewFileStateWithSummary("visible-invalid.ts", { invalidated: true }),
          reviewFileStateWithSummary("hidden-invalid.ts", {
            invalidated: true,
            visible: false
          }),
          reviewFileStateWithSummary("clean.ts", { invalidated: false })
        ],
        progress
      )
    ).toEqual({
      attentionCount: 1,
      progress
    });
  });
});

describe("review workspace views", () => {
  it("updates a file review state and recalculates workspace progress and attention", () => {
    const workspace = reviewWorkspaceView([
      reviewFileViewState("target.ts", {
        invalidated: true,
        reviewed: false
      }),
      reviewFileViewState("reviewed.ts", {
        invalidated: false,
        reviewed: true
      }),
      reviewFileViewState("hidden-invalid.ts", {
        invalidated: true,
        visible: false
      })
    ]);

    const updated = workspaceWithUpdatedReviewState(workspace, "target.ts", {
      invalidated: false,
      reviewed: true
    });

    expect(
      updated.files.map((file) => [file.path, file.invalidated, file.reviewed])
    ).toEqual([
      ["target.ts", false, true],
      ["reviewed.ts", false, true],
      ["hidden-invalid.ts", true, false]
    ]);
    expect(updated.progress).toEqual({
      reviewedVisibleFiles: 2,
      totalVisibleReviewableFiles: 2
    });
    expect(updated.project.reviewSummary).toEqual({
      attentionCount: 0,
      progress: updated.progress
    });
  });
});

describe("project load progress views", () => {
  it("maps Git loading progress with optional file counts and paths", () => {
    expect(
      projectProgressFromGit({
        loadedFiles: 3,
        path: "src/App.tsx",
        phase: "loading_files",
        totalFiles: 5
      })
    ).toEqual({
      loadedFiles: 3,
      message: "Loading changed files",
      path: "src/App.tsx",
      phase: "loading_files",
      totalFiles: 5
    });
  });

  it("maps Git progress phase messages and omits absent optional fields", () => {
    expect(projectProgressFromGit({ phase: "resolving_target" })).toEqual({
      message: "Resolving review target",
      phase: "resolving_target"
    });
    expect(projectProgressFromGit({ phase: "scanning_files" })).toEqual({
      message: "Scanning changed files",
      phase: "scanning_files"
    });
  });
});

describe("review comments", () => {
  it("maps review comments and compares expected IDs as a set", () => {
    expect(
      reviewCommentView({
        body: "Looks wrong",
        createdAt: "2026-01-01T00:00:00.000Z",
        diffHash: "hash-1",
        id: "comment-1",
        lineEnd: 4,
        lineStart: 4,
        path: "src/App.tsx",
        previousPath: "src/OldApp.tsx",
        projectId: "project-1",
        reviewTargetId: "target-1",
        side: "additions",
        updatedAt: "2026-01-01T00:00:00.000Z"
      })
    ).toMatchObject({
      id: "comment-1",
      previousPath: "src/OldApp.tsx",
      side: "additions"
    });
    expect(sameCommentIds([{ id: "b" }, { id: "a" }], ["a", "b"])).toBe(true);
    expect(sameCommentIds([{ id: "a" }, { id: "b" }], ["a", "a"])).toBe(false);
  });

  it("builds bounded report context around commented addition lines", () => {
    expect(
      commentReportContext(
        reviewCommentViewRecord({
          lineEnd: 4,
          lineStart: 4,
          side: "additions"
        }),
        reviewFileDiffContentView({
          newText: ["one", "two", "three", "four", "five", "six"].join("\n")
        })
      )
    ).toEqual({
      lines: [
        { kind: "context", lineNumber: 1, text: "one" },
        { kind: "context", lineNumber: 2, text: "two" },
        { kind: "context", lineNumber: 3, text: "three" },
        { kind: "commented", lineNumber: 4, text: "four" },
        { kind: "context", lineNumber: 5, text: "five" },
        { kind: "context", lineNumber: 6, text: "six" }
      ],
      side: "additions"
    });
  });

  it("uses deletion text for deletion comments and skips unavailable context", () => {
    expect(
      commentReportContext(
        reviewCommentViewRecord({
          lineEnd: 2,
          lineStart: 1,
          side: "deletions"
        }),
        reviewFileDiffContentView({
          oldText: "old one\nold two\n"
        })
      )
    ).toEqual({
      lines: [
        { kind: "commented", lineNumber: 1, text: "old one" },
        { kind: "commented", lineNumber: 2, text: "old two" }
      ],
      side: "deletions"
    });
    expect(
      commentReportContext(
        reviewCommentViewRecord({
          lineEnd: 9,
          lineStart: 9,
          side: "additions"
        }),
        reviewFileDiffContentView({
          newText: "only one line"
        })
      )
    ).toBeUndefined();
    expect(
      commentReportContext(
        reviewCommentViewRecord({
          side: "additions"
        }),
        reviewFileDiffContentView({})
      )
    ).toBeUndefined();
  });
});

function reviewFileViewState(
  filePath: string,
  patch: Partial<ReviewFileView> = {}
): ReviewFileView {
  return {
    additions: 1,
    deletions: 0,
    diffHash: `hash-${filePath}`,
    diffLoaded: false,
    generated: false,
    invalidated: false,
    path: filePath,
    reviewable: true,
    reviewed: false,
    status: "modified",
    visible: true,
    ...patch
  };
}

function reviewWorkspaceView(files: readonly ReviewFileView[]): ReviewWorkspaceView {
  const progress = reviewProgressView(files);

  return {
    comments: [],
    files,
    progress,
    project: {
      id: "project-1",
      name: "Difftray",
      path: "/repo/difftray",
      reviewSummary: {
        attentionCount: files.filter((file) => file.visible && file.invalidated).length,
        progress
      }
    },
    reviewTarget: {
      headSha: "head-sha",
      id: "target-1",
      kind: "working_tree"
    }
  };
}

function reviewCommentViewRecord(
  patch: Partial<Parameters<typeof commentReportContext>[0]> = {}
): Parameters<typeof commentReportContext>[0] {
  return {
    body: "Looks wrong",
    createdAt: "2026-01-01T00:00:00.000Z",
    diffHash: "hash-1",
    id: "comment-1",
    lineEnd: 1,
    lineStart: 1,
    path: "src/App.tsx",
    side: "additions",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...patch
  };
}

function reviewFileDiffContentView(
  patch: Partial<ReviewFileDiffContentView>
): ReviewFileDiffContentView {
  return {
    additions: 1,
    deletions: 1,
    patch: "patch",
    path: "src/App.tsx",
    status: "modified",
    ...patch
  };
}

function reviewFileStateWithSummary(
  filePath = "src/App.tsx",
  patch: Partial<FileReviewStateWithSummary["state"]> = {}
): FileReviewStateWithSummary {
  return {
    state: {
      diff: {
        content: { kind: "text", patch: "summary patch" },
        newPath: filePath,
        oldPath: "src/OldApp.tsx",
        status: "renamed"
      },
      diffHash: "hash-1",
      generated: false,
      invalidated: true,
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
      oldPath: "src/OldApp.tsx",
      status: "renamed"
    }
  };
}
