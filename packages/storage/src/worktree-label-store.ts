import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { currentTimestamp } from "./timestamps.js";

export const worktreeLabelQueryBatchSize = 200;

export type WorktreeLabelRecord = {
  readonly commonGitDir: string;
  readonly label: string;
  readonly updatedAt: string;
  readonly worktreeId: string;
  readonly worktreePath: string;
};

export type SetWorktreeLabelInput = {
  readonly commonGitDir: string;
  readonly label: string;
  readonly worktreeId: string;
  readonly worktreePath: string;
};

type WorktreeLabelRow = {
  readonly common_git_dir: string;
  readonly label: string;
  readonly updated_at: string;
  readonly worktree_id: string;
  readonly worktree_path: string;
};

export function getWorktreeLabel(
  db: DatabaseSync,
  worktreeId: string
): WorktreeLabelRecord | null {
  const row = db
    .prepare("select * from worktree_labels where worktree_id = ?")
    .get(worktreeId);

  return row ? worktreeLabelFromRow(row as WorktreeLabelRow) : null;
}

export function listWorktreeLabels(
  db: DatabaseSync,
  worktreePaths: readonly string[]
): readonly WorktreeLabelRecord[] {
  const paths = [
    ...new Set(worktreePaths.map((worktreePath) => path.normalize(worktreePath)))
  ];
  const labels: WorktreeLabelRecord[] = [];

  for (let start = 0; start < paths.length; start += worktreeLabelQueryBatchSize) {
    const batch = paths.slice(start, start + worktreeLabelQueryBatchSize);
    const placeholders = batch.map(() => "?").join(", ");
    const rows = db
      .prepare(`select * from worktree_labels where worktree_path in (${placeholders})`)
      .all(...batch) as unknown as readonly WorktreeLabelRow[];
    labels.push(...rows.map(worktreeLabelFromRow));
  }

  return labels;
}

export function setWorktreeLabel(
  db: DatabaseSync,
  input: SetWorktreeLabelInput
): WorktreeLabelRecord {
  const record: WorktreeLabelRecord = {
    commonGitDir: path.normalize(input.commonGitDir),
    label: input.label,
    updatedAt: currentTimestamp(),
    worktreeId: input.worktreeId,
    worktreePath: path.normalize(input.worktreePath)
  };

  db.prepare(
    `
      insert into worktree_labels (
        worktree_id,
        common_git_dir,
        worktree_path,
        label,
        updated_at
      ) values (?, ?, ?, ?, ?)
      on conflict(worktree_id) do update set
        common_git_dir = excluded.common_git_dir,
        worktree_path = excluded.worktree_path,
        label = excluded.label,
        updated_at = excluded.updated_at
    `
  ).run(
    record.worktreeId,
    record.commonGitDir,
    record.worktreePath,
    record.label,
    record.updatedAt
  );

  return record;
}

export function resetWorktreeLabel(db: DatabaseSync, worktreeId: string): boolean {
  return (
    Number(
      db.prepare("delete from worktree_labels where worktree_id = ?").run(worktreeId)
        .changes
    ) > 0
  );
}

function worktreeLabelFromRow(row: WorktreeLabelRow): WorktreeLabelRecord {
  return {
    commonGitDir: row.common_git_dir,
    label: row.label,
    updatedAt: row.updated_at,
    worktreeId: row.worktree_id,
    worktreePath: row.worktree_path
  };
}
