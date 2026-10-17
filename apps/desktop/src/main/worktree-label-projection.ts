import path from "node:path";

import { worktreeOpaqueId } from "@difftray/git";
import type { WorktreeLabelRecord } from "@difftray/storage";

import type { RecentProjectView } from "./view-models.js";

export const projectionConcurrency = 4;

export type WorktreeLabelProjectionDependencies = {
  readonly getLabel: (worktreeId: string) => WorktreeLabelRecord | null;
  readonly listLabels: (
    worktreePaths: readonly string[]
  ) => readonly WorktreeLabelRecord[];
  readonly worktreeInfo: (
    worktreePath: string
  ) => Promise<{ readonly commonGitDir: string; readonly root: string }>;
};

/**
 * Overlays stored custom labels on project views. Only paths with a stored
 * label are verified against Git, with bounded concurrency, and a label is
 * shown only when the current worktree identity matches the stored row. The
 * row is read again after verification so a concurrent set or reset wins.
 */
export async function projectViewsWithLabels<T extends RecentProjectView>(
  views: readonly T[],
  dependencies: WorktreeLabelProjectionDependencies
): Promise<readonly T[]> {
  const paths = [...new Set(views.map((view) => path.normalize(view.path)))];
  if (paths.length === 0) return views;

  const storedPaths = [
    ...new Set(
      dependencies.listLabels(paths).map((label) => path.normalize(label.worktreePath))
    )
  ];
  if (storedPaths.length === 0) return views;

  const verifiedIds = new Map<string, string>();
  await forEachBounded(storedPaths, projectionConcurrency, async (worktreePath) => {
    try {
      const info = await dependencies.worktreeInfo(worktreePath);
      if (path.normalize(info.root) !== worktreePath) return;
      verifiedIds.set(worktreePath, worktreeOpaqueId(info.commonGitDir, info.root));
    } catch {
      // A missing, moved or inaccessible worktree keeps its stored label but
      // shows none.
    }
  });

  const labels = new Map<string, string>();
  for (const [worktreePath, worktreeId] of verifiedIds) {
    const current = dependencies.getLabel(worktreeId);
    if (current && path.normalize(current.worktreePath) === worktreePath) {
      labels.set(worktreePath, current.label);
    }
  }

  if (labels.size === 0) return views;

  return views.map((view) => {
    const customLabel = labels.get(path.normalize(view.path));
    return customLabel === undefined ? view : { ...view, customLabel };
  });
}

export async function projectViewWithLabel<T extends RecentProjectView>(
  view: T,
  dependencies: WorktreeLabelProjectionDependencies
): Promise<T> {
  const [decorated] = await projectViewsWithLabels([view], dependencies);
  return decorated ?? view;
}

async function forEachBounded<T>(
  values: readonly T[],
  concurrency: number,
  callback: (value: T) => Promise<void>
): Promise<void> {
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, values.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < values.length) {
        const value = values[nextIndex];
        nextIndex += 1;
        if (value !== undefined) await callback(value);
      }
    })
  );
}
