import {
  createDiffHash,
  createReviewTargetId,
  formatReviewCommentsReport,
  type ReviewTarget
} from "@difftray/core";
import type { GitFileDiffSummary, GitLoadedFileDiff } from "@difftray/git";

import {
  loadExplicitFileDiff,
  loadExplicitFileSummary,
  loadExplicitReviewTarget
} from "./review-context-service.js";
import {
  commentReportContext,
  fileDiffFromGit,
  patchForDiff,
  reviewCommentReportTarget,
  reviewTargetLabel,
  summarizePatch,
  type ReviewFileDiffContentView,
  type ReviewWorkspaceView
} from "./view-models.js";

type LoadFile = (
  projectPath: string,
  target: ReviewTarget,
  filePath: string,
  previousPath?: string
) => Promise<GitLoadedFileDiff | null>;
type LoadSummary = (
  projectPath: string,
  target: ReviewTarget,
  filePath: string,
  previousPath?: string
) => Promise<GitFileDiffSummary | null>;
type ResolveTarget = (projectPath: string, target: ReviewTarget) => Promise<ReviewTarget>;

async function resolveExplicitTarget(
  projectPath: string,
  target: ReviewTarget
): Promise<ReviewTarget> {
  const selector =
    target.kind === "branch"
      ? { kind: "branch" as const, base: target.baseRefName }
      : target.kind === "commit"
        ? { kind: "commit" as const, commit: target.commitSha }
        : { kind: "working-tree" as const };
  return loadExplicitReviewTarget(projectPath, selector);
}

export async function formatExplicitReviewReport(
  projectPath: string,
  target: ReviewTarget,
  workspace: ReviewWorkspaceView,
  options: {
    readonly loadFile?: LoadFile;
    readonly loadSummary?: LoadSummary;
    readonly resolveTarget?: ResolveTarget;
  } = {}
): Promise<string> {
  const loadFile = options.loadFile ?? loadExplicitFileDiff;
  const loadSummary = options.loadSummary ?? loadExplicitFileSummary;
  const resolveTarget = options.resolveTarget ?? resolveExplicitTarget;
  const matchingTarget = workspace.reviewTarget.id === createReviewTargetId(target);
  const beforeTarget = matchingTarget ? await resolveTarget(projectPath, target) : null;
  const stableBefore =
    beforeTarget !== null &&
    createReviewTargetId(beforeTarget) === createReviewTargetId(target);
  const uniquePaths = [...new Set(workspace.comments.map((comment) => comment.path))];
  const diffEntries = await Promise.all(
    stableBefore
      ? uniquePaths.map(async (filePath) => {
          const file = workspace.files.find((candidate) => candidate.path === filePath);
          if (!file) return [filePath, null] as const;
          const summaryBefore = await loadSummary(
            projectPath,
            target,
            filePath,
            file.previousPath
          );
          if (
            !summaryBefore ||
            file.diffHash !== createDiffHash(target, fileDiffFromGit(summaryBefore))
          )
            return [filePath, null] as const;
          const gitDiff = await loadFile(
            projectPath,
            target,
            filePath,
            file.previousPath
          );
          if (!gitDiff) return [filePath, null] as const;
          const diff = fileDiffFromGit(gitDiff);
          const summaryAfter = await loadSummary(
            projectPath,
            target,
            filePath,
            file.previousPath
          );
          const targetAfter = await resolveTarget(projectPath, target);
          if (
            !summaryAfter ||
            file.diffHash !== createDiffHash(target, fileDiffFromGit(summaryAfter)) ||
            createReviewTargetId(targetAfter) !== createReviewTargetId(target)
          )
            return [filePath, null] as const;
          const patch = patchForDiff(diff);
          const summary = summarizePatch(patch);
          const textContent = diff.content.kind === "text" ? diff.content : undefined;
          const content: ReviewFileDiffContentView = {
            additions: summary.additions,
            deletions: summary.deletions,
            ...(textContent?.newText !== undefined
              ? { newText: textContent.newText }
              : {}),
            ...(textContent?.oldText !== undefined
              ? { oldText: textContent.oldText }
              : {}),
            patch,
            path: diff.newPath,
            status: diff.status
          };
          return [filePath, content] as const;
        })
      : []
  );
  const diffByPath = new Map<string, ReviewFileDiffContentView | null>(diffEntries);
  const comments = workspace.comments.map((comment) => {
    const file = workspace.files.find((candidate) => candidate.path === comment.path);
    const content =
      file?.diffHash === comment.diffHash ? (diffByPath.get(comment.path) ?? null) : null;
    const context = commentReportContext(comment, content);
    return { ...comment, ...(context ? { context } : {}) };
  });
  const reviewNote = workspace.reviewNote ?? null;
  const activeNote = reviewNote && !reviewNote.dismissedAt ? reviewNote : null;
  const reportTarget = reviewCommentReportTarget(workspace.reviewTarget);
  return formatReviewCommentsReport({
    comments,
    fileComments: (workspace.fileComments ?? []).map((comment) => ({
      body: comment.body,
      path: comment.path
    })),
    projectName: workspace.project.name,
    reviewedPaths: workspace.files
      .filter((file) => file.visible)
      .map((file) => file.path),
    ...(activeNote ? { reviewNote: activeNote.body } : {}),
    ...(reportTarget ? { target: reportTarget } : {}),
    targetLabel: reviewTargetLabel(workspace.reviewTarget)
  });
}
