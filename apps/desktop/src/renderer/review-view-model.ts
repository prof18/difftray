import type { DiffSideFocus } from "./diffs-renderer.js";

export type DiffMode = "split" | "unified";
export type ReviewDiffTargetMode = "branch" | "working_tree";
export type ReviewState = "attention" | "pending" | "reviewed" | "unknown";

export function nextPendingPath(
  workspace: ReviewWorkspaceView,
  reviewedPath: string
): string | undefined {
  const visibleFiles = workspace.files.filter((file) => file.visible && !file.reviewed);
  const reviewedIndex = workspace.files.findIndex((file) => file.path === reviewedPath);

  return (
    visibleFiles.find(
      (file) =>
        workspace.files.findIndex((candidate) => candidate.path === file.path) >
        reviewedIndex
    )?.path ?? visibleFiles[0]?.path
  );
}

export function firstVisiblePath(workspace: ReviewWorkspaceView): string | undefined {
  return workspace.files.find((file) => file.visible)?.path;
}

export function visiblePathOrFirst(
  workspace: ReviewWorkspaceView,
  preferredPath: string | undefined
): string | undefined {
  return workspace.files.some((file) => file.path === preferredPath && file.visible)
    ? preferredPath
    : firstVisiblePath(workspace);
}

export function diffTargetLabel(target: ReviewWorkspaceView["reviewTarget"]): string {
  if (target.kind === "branch") {
    return `against ${target.baseRefName ?? "base"}`;
  }

  return target.headRefName ?? "worktree";
}

export function projectReviewSummary(
  workspace: ReviewWorkspaceView
): ProjectReviewSummaryView {
  return {
    attentionCount: workspace.files.filter((file) => file.visible && file.invalidated)
      .length,
    progress: workspace.progress
  };
}

export function reviewSummariesEqual(
  left: ProjectReviewSummaryView | undefined,
  right: ProjectReviewSummaryView
): boolean {
  if (!left) {
    return false;
  }

  return (
    left.attentionCount === right.attentionCount &&
    left.progress.reviewedVisibleFiles === right.progress.reviewedVisibleFiles &&
    left.progress.totalVisibleReviewableFiles ===
      right.progress.totalVisibleReviewableFiles
  );
}

export function omitProjectReviewSummary(project: RecentProjectView): RecentProjectView {
  const { reviewSummary, ...projectWithoutSummary } = project;

  void reviewSummary;

  return projectWithoutSummary;
}

export function suggestedBaseRef(
  branchRefs: readonly string[],
  headRefName: string | undefined
): string | undefined {
  const preferredRefs = ["origin/main", "main", "origin/master", "master", "develop"];

  return (
    preferredRefs.find(
      (branchRef) => branchRef !== headRefName && branchRefs.includes(branchRef)
    ) ?? branchRefs.find((branchRef) => branchRef !== headRefName)
  );
}

export function reviewState(file: ReviewFileView): ReviewState {
  if (file.invalidated) {
    return "attention";
  }

  return file.reviewed ? "reviewed" : "pending";
}

export function diffSideFocusForFile(
  file: ReviewFileView,
  diffMode: DiffMode,
  requestedFocus: DiffSideFocus
): DiffSideFocus {
  if (diffMode === "unified") {
    return "both";
  }

  if (file.status === "added" || file.status === "deleted") {
    return "both";
  }

  return requestedFocus;
}

export function reviewSummaryState(summary: ProjectReviewSummaryView): ReviewState {
  if (summary.attentionCount > 0) {
    return "attention";
  }

  if (
    summary.progress.totalVisibleReviewableFiles > 0 &&
    summary.progress.reviewedVisibleFiles >= summary.progress.totalVisibleReviewableFiles
  ) {
    return "reviewed";
  }

  return "pending";
}

export function splitPath(path: string): {
  readonly dirname: string;
  readonly filename: string;
} {
  const segments = path.split("/");
  const filename = segments.at(-1) ?? path;
  const dirname = segments.slice(0, -1).join("/");

  return {
    dirname: dirname.length > 0 ? dirname : ".",
    filename
  };
}

export function clampIndex(index: number, length: number): number {
  if (length <= 0) {
    return 0;
  }

  if (index < 0) {
    return length - 1;
  }

  if (index >= length) {
    return 0;
  }

  return index;
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function classList(...classes: readonly (string | undefined)[]): string {
  return classes.filter((className): className is string => Boolean(className)).join(" ");
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected Difftray error.";
}

export function themeModeFromValue(value: string): ThemeMode {
  return value === "dark" || value === "light" || value === "system" ? value : "system";
}
