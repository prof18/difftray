export type WorkspaceLoadStatus = {
  readonly detail: string;
  readonly loadedFiles?: number;
  readonly title: string;
  readonly totalFiles?: number;
};

const immediateTabSwitchLoaderFileThreshold = 75;
export const delayedTabSwitchLoaderMs = 500;

/**
 * A pinned title (why the load started, such as "Worktree removed") stays in
 * place and the status's own title moves into the detail line.
 */
export function withPinnedLoadTitle(
  status: WorkspaceLoadStatus,
  pinnedTitle?: string
): WorkspaceLoadStatus {
  return pinnedTitle === undefined
    ? status
    : { ...status, detail: `${status.title} · ${status.detail}`, title: pinnedTitle };
}

export function loadStatusFromProgress(
  progress: ProjectLoadProgressView,
  pinnedTitle?: string
): WorkspaceLoadStatus {
  return withPinnedLoadTitle(
    {
      detail: loadProgressDetail(progress),
      ...(progress.loadedFiles !== undefined
        ? { loadedFiles: progress.loadedFiles }
        : {}),
      title: progress.message,
      ...(progress.totalFiles !== undefined ? { totalFiles: progress.totalFiles } : {})
    },
    pinnedTitle
  );
}

export function loadProgressDetail(progress: ProjectLoadProgressView): string {
  if (progress.phase === "loading_files" && progress.totalFiles !== undefined) {
    const loadedFiles = progress.loadedFiles ?? 0;
    const pathSuffix = progress.path ? ` · ${progress.path}` : "";

    return `${String(loadedFiles)} / ${String(progress.totalFiles)} files${pathSuffix}`;
  }

  return progress.projectName;
}

export function tabLoadingText(status: WorkspaceLoadStatus): string {
  if (
    status.loadedFiles !== undefined &&
    status.totalFiles !== undefined &&
    status.totalFiles > 0
  ) {
    return `${String(status.loadedFiles)}/${String(status.totalFiles)}`;
  }

  return "Loading";
}

export function tabSwitchLoaderDelayMs(project: RecentProjectView | undefined): number {
  const changedFileCount = project?.reviewSummary?.progress.totalVisibleReviewableFiles;

  if (
    changedFileCount !== undefined &&
    changedFileCount > immediateTabSwitchLoaderFileThreshold
  ) {
    return 0;
  }

  return delayedTabSwitchLoaderMs;
}

export function tabReviewCountText(
  summary: ProjectReviewSummaryView | undefined
): string {
  if (!summary) {
    return "-/-";
  }

  return `${String(summary.progress.reviewedVisibleFiles)}/${String(
    summary.progress.totalVisibleReviewableFiles
  )}`;
}

export function projectTabTitle(
  project: RecentProjectView,
  summary: ProjectReviewSummaryView | undefined,
  isSummaryLoading: boolean
): string {
  if (isSummaryLoading) {
    return `${project.path} · Updating review status`;
  }

  if (!summary) {
    return `${project.path} · Review status not loaded`;
  }

  if (summary.attentionCount > 0) {
    return `${project.path} · ${String(summary.attentionCount)} reviewed files changed`;
  }

  const total = summary.progress.totalVisibleReviewableFiles;
  const reviewed = summary.progress.reviewedVisibleFiles;

  if (total === 0) {
    return `${project.path} · No changed files`;
  }

  if (reviewed >= total) {
    return `${project.path} · All files reviewed`;
  }

  return `${project.path} · ${String(reviewed)} of ${String(total)} files reviewed`;
}
