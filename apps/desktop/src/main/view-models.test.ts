import { describe, expect, it } from "vitest";

import {
  appSettingsView,
  fileDiffFromGit,
  patchForDiff,
  projectView,
  reviewCommentView,
  reviewFileView,
  reviewTargetFromGit,
  reviewTargetFromRecord,
  reviewTargetLabel,
  reviewTargetRecord,
  sameCommentIds,
  settingsView,
  summarizePatch,
  type FileReviewStateWithSummary
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
    expect(reviewTargetLabel({ kind: "working_tree" })).toBe("Git changes");
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
});

function reviewFileStateWithSummary(): FileReviewStateWithSummary {
  return {
    state: {
      diff: {
        content: { kind: "text", patch: "summary patch" },
        newPath: "src/App.tsx",
        oldPath: "src/OldApp.tsx",
        status: "renamed"
      },
      diffHash: "hash-1",
      generated: false,
      invalidated: true,
      path: "src/App.tsx",
      reviewable: true,
      reviewed: false,
      visible: true
    },
    summary: {
      additions: 2,
      content: { kind: "text", patch: "summary patch" },
      deletions: 1,
      newPath: "src/App.tsx",
      oldPath: "src/OldApp.tsx",
      status: "renamed"
    }
  };
}
