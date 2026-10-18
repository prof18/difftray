export type WorktreeLabelEditorState = {
  readonly initialLabel?: string;
  readonly projectId: string;
  readonly requestId: number;
  readonly subject: string;
  readonly targetError?: string;
  readonly targetPending?: boolean;
  /** Absent until the project's current worktree has been discovered. */
  readonly worktreeId?: string;
};

const unavailableCurrentWorktree = "Current worktree is not available. Retry.";

/**
 * A project tab knows its project id but not its worktree id. Discover the
 * single `current` row on demand without opening the sibling picker.
 */
export async function currentWorktreeForLabel(
  projectId: string
): Promise<{ readonly worktree: RepositoryWorktreeView } | { readonly error: string }> {
  try {
    const current = (await window.difftray.listProjectWorktrees(projectId)).filter(
      (worktree) => worktree.state === "current"
    );
    const worktree = current[0];

    return current.length === 1 && worktree
      ? { worktree }
      : { error: unavailableCurrentWorktree };
  } catch {
    return { error: unavailableCurrentWorktree };
  }
}

/** Applies the refreshed label (or its reset) to a project held outside the tab list. */
export function withProjectLabel<T extends RecentProjectView>(
  project: T,
  refreshedProjects: readonly RecentProjectView[]
): T {
  const refreshed = refreshedProjects.find((candidate) => candidate.id === project.id);
  if (!refreshed) return project;

  const next: Record<string, unknown> = { ...project };
  delete next.customLabel;
  if (refreshed.customLabel) next.customLabel = refreshed.customLabel;
  return next as T;
}

/** Electron wraps errors thrown by main handlers; show only the reason. */
export function ipcErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unexpected Difftray error.";
  return message.replace(
    /^Error invoking remote method '[^']+': (?:[A-Za-z]*Error: )?/,
    ""
  );
}

/**
 * Data for a label refresh. A failing worktree listing (for example a missing
 * directory) must not block the project list that carries the tab labels.
 */
export async function loadLabelRefresh(projectId: string | undefined): Promise<{
  readonly projects: readonly RecentProjectView[];
  readonly worktrees?: readonly RepositoryWorktreeView[];
}> {
  const [projects, worktrees] = await Promise.all([
    window.difftray.listRecentProjects(),
    projectId
      ? window.difftray.listProjectWorktrees(projectId).catch(() => undefined)
      : Promise.resolve(undefined)
  ]);
  return worktrees ? { projects, worktrees } : { projects };
}
