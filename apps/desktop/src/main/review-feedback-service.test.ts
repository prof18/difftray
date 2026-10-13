import {
  createDiffHash,
  createReviewTargetId,
  formatReviewCommentsReport,
  type ReviewTarget
} from "@difftray/core";
import type { GitFileDiffSummary, GitLoadedFileDiff } from "@difftray/git";
import { openStorage } from "@difftray/storage";
import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { formatExplicitReviewReport } from "./review-feedback-service.js";
import {
  createReviewContextService,
  loadExplicitFileDiff,
  loadExplicitFileSummary,
  loadExplicitReviewTarget
} from "./review-context-service.js";
import {
  commentReportContext,
  reviewCommentReportTarget,
  reviewTargetLabel,
  type ReviewWorkspaceView
} from "./view-models.js";

const target: ReviewTarget = {
  kind: "working_tree",
  projectId: "project",
  headSha: "head"
};
const otherTarget: ReviewTarget = {
  kind: "working_tree",
  projectId: "project",
  headSha: "other"
};
const gitDiff: GitLoadedFileDiff = {
  newPath: "src/app.ts",
  status: "modified",
  content: {
    kind: "text",
    patch: "@@ -1 +1 @@\n-old\n+new",
    oldText: "old",
    newText: "new"
  }
};
const gitSummary: GitFileDiffSummary = { ...gitDiff, additions: 1, deletions: 1 };
const diffHash = createDiffHash(target, {
  newPath: gitDiff.newPath,
  status: gitDiff.status,
  content: gitDiff.content
});
const dependencies = {
  loadSummary: async () => gitSummary,
  resolveTarget: async () => target
};

function workspace(hash = diffHash): ReviewWorkspaceView {
  return {
    project: { id: "project", name: "Project", path: "/repo" },
    reviewTarget: {
      id: createReviewTargetId(target),
      kind: "working_tree",
      headSha: "head"
    },
    progress: { reviewedVisibleFiles: 1, totalVisibleReviewableFiles: 1 },
    files: [
      {
        path: "src/app.ts",
        status: "modified",
        diffHash: hash,
        diffLoaded: false,
        additions: 1,
        deletions: 1,
        generated: false,
        invalidated: false,
        reviewable: true,
        reviewed: true,
        visible: true
      }
    ],
    comments: [
      {
        id: "comment",
        body: "Fix this",
        path: "src/app.ts",
        diffHash: hash,
        side: "additions",
        lineStart: 1,
        lineEnd: 1,
        createdAt: "now",
        updatedAt: "now"
      }
    ],
    fileComments: [
      {
        id: "file",
        body: "File feedback",
        path: "src/app.ts",
        diffHash: hash,
        createdAt: "now",
        updatedAt: "now"
      }
    ],
    reviewNote: { body: "Overall feedback", createdAt: "now", updatedAt: "now" }
  } as ReviewWorkspaceView;
}

describe("explicit review feedback", () => {
  it("includes a tracked text excerpt whose summary fingerprint differs from rendered content", async () => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), "difftray-feedback-")));
    const store = openStorage(":memory:");
    const git = (...args: string[]) =>
      execFileSync("git", ["-C", root, ...args], { stdio: "ignore" });
    try {
      git("init", "-b", "main");
      git("config", "user.email", "test@example.com");
      git("config", "user.name", "Test");
      writeFileSync(path.join(root, "file.txt"), "old\n");
      git("add", ".");
      git("commit", "-m", "initial");
      writeFileSync(path.join(root, "file.txt"), "new\n");
      const context = await createReviewContextService(store).inspect(root, {
        kind: "working-tree"
      });
      const file = context.files.find((candidate) => candidate.path === "file.txt");
      if (!file) throw new Error("Missing tracked file fixture");
      const summary = await loadExplicitFileSummary(
        root,
        context.reviewTarget,
        "file.txt"
      );
      if (!summary) throw new Error("Missing tracked summary fixture");
      expect(createDiffHash(context.reviewTarget, summary)).toBe(file.diffHash);
      expect(await loadExplicitReviewTarget(root, { kind: "working-tree" })).toEqual(
        context.reviewTarget
      );
      const firstFile = workspace().files[0];
      const firstComment = workspace().comments[0];
      if (!firstFile || !firstComment) throw new Error("Missing report fixture");
      const state = {
        ...workspace(),
        project: { id: context.projectId, name: "Project", path: root },
        reviewTarget: {
          id: context.reviewTargetId,
          kind: "working_tree" as const,
          headSha: context.reviewTarget.headSha
        },
        files: [{ ...firstFile, path: "file.txt", diffHash: file.diffHash }],
        comments: [{ ...firstComment, path: "file.txt", diffHash: file.diffHash }]
      };
      const report = await formatExplicitReviewReport(root, context.reviewTarget, state);
      expect(report).toContain("```text\n> 1 new\n```");
      const staleReport = await formatExplicitReviewReport(
        root,
        context.reviewTarget,
        state,
        {
          loadFile: async (...args) => {
            const loaded = await loadExplicitFileDiff(...args);
            writeFileSync(path.join(root, "file.txt"), "changed after render\n");
            return loaded;
          }
        }
      );
      expect(staleReport).not.toContain("```text");
    } finally {
      store.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("uses the supplied target and matches shared report formatting", async () => {
    const loadFile = vi.fn(async () => gitDiff);
    const report = await formatExplicitReviewReport("/repo", target, workspace(), {
      ...dependencies,
      loadFile
    });
    expect(loadFile).toHaveBeenCalledWith("/repo", target, "src/app.ts", undefined);
    const comment = workspace().comments[0];
    if (!comment) throw new Error("Missing comment fixture");
    const reportTarget = reviewCommentReportTarget(workspace().reviewTarget);
    if (!reportTarget) throw new Error("Missing report target fixture");
    const context = commentReportContext(comment, {
      path: "src/app.ts",
      status: "modified",
      patch: gitDiff.content.kind === "text" ? gitDiff.content.patch : "",
      additions: 1,
      deletions: 1,
      newText: "new",
      oldText: "old"
    });
    expect(report).toBe(
      formatReviewCommentsReport({
        comments: [{ ...comment, ...(context ? { context } : {}) }],
        fileComments: [{ body: "File feedback", path: "src/app.ts" }],
        projectName: "Project",
        reviewedPaths: ["src/app.ts"],
        reviewNote: "Overall feedback",
        target: reportTarget,
        targetLabel: reviewTargetLabel(workspace().reviewTarget)
      })
    );
  });

  it("omits excerpts when loaded diff or workspace belongs to another target", async () => {
    const loadFile = vi.fn(async () => gitDiff);
    const wrongHash = createDiffHash(otherTarget, {
      newPath: gitDiff.newPath,
      status: gitDiff.status,
      content: gitDiff.content
    });
    const report = await formatExplicitReviewReport(
      "/repo",
      target,
      workspace(wrongHash),
      { ...dependencies, loadFile }
    );
    expect(report).toContain("Fix this");
    expect(report).not.toContain("```text");
  });

  it("does not load excerpts when the workspace target changes", async () => {
    const loadFile = vi.fn(async () => gitDiff);
    const state = {
      ...workspace(),
      reviewTarget: {
        ...workspace().reviewTarget,
        id: createReviewTargetId(otherTarget),
        headSha: "other"
      }
    };
    const report = await formatExplicitReviewReport("/repo", target, state, {
      ...dependencies,
      loadFile
    });
    expect(loadFile).not.toHaveBeenCalled();
    expect(report).toContain("Fix this");
    expect(report).not.toContain("```text");
  });

  it("drops an excerpt if the summary changes during its file load", async () => {
    const changed: GitFileDiffSummary = {
      ...gitSummary,
      content: { kind: "text", patch: "@@ -1 +1 @@\n-old\n+changed" }
    };
    const loadSummary = vi
      .fn()
      .mockResolvedValueOnce(gitSummary)
      .mockResolvedValueOnce(changed);
    const report = await formatExplicitReviewReport("/repo", target, workspace(), {
      loadFile: async () => gitDiff,
      loadSummary,
      resolveTarget: async () => target
    });
    expect(loadSummary).toHaveBeenCalledTimes(2);
    expect(report).not.toContain("```text");
  });

  it("drops an excerpt if the target moves during its file load", async () => {
    const resolveTarget = vi
      .fn()
      .mockResolvedValueOnce(target)
      .mockResolvedValueOnce(otherTarget);
    const report = await formatExplicitReviewReport("/repo", target, workspace(), {
      loadFile: async () => gitDiff,
      loadSummary: async () => gitSummary,
      resolveTarget
    });
    expect(resolveTarget).toHaveBeenCalledTimes(2);
    expect(report).not.toContain("```text");
  });

  it("filters dismissed overall notes exactly like the desktop path", async () => {
    const state = {
      ...workspace(),
      comments: [],
      fileComments: [],
      reviewNote: {
        body: "Hidden",
        createdAt: "now",
        updatedAt: "now",
        dismissedAt: "now"
      }
    };
    const report = await formatExplicitReviewReport("/repo", target, state, {
      ...dependencies,
      loadFile: vi.fn()
    });
    expect(report).not.toContain("Hidden");
  });
});
