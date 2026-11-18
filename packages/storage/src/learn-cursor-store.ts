import type { DatabaseSync } from "node:sqlite";

import { currentTimestamp } from "./timestamps.js";

export type AdvanceLearnCursorResult = {
  readonly cursorAt: string;
  readonly moved: boolean;
};

export function getLearnCursor(db: DatabaseSync, commonGitDir: string): string | null {
  const row = db
    .prepare("select cursor_at from repository_learn_cursors where common_git_dir = ?")
    .get(commonGitDir) as { readonly cursor_at: string } | undefined;

  return row?.cursor_at ?? null;
}

// The cursor only moves forward. Timestamps are compared as instants, so the same
// moment written with another offset never counts as newer.
export function advanceLearnCursor(
  db: DatabaseSync,
  commonGitDir: string,
  cursorAt: string
): AdvanceLearnCursorResult {
  const next = Date.parse(cursorAt);

  if (Number.isNaN(next)) {
    throw new Error("Learn cursor must be an ISO timestamp.");
  }

  db.exec("begin immediate");

  try {
    const current = getLearnCursor(db, commonGitDir);

    if (current !== null && Date.parse(current) >= next) {
      db.exec("commit");
      return { cursorAt: current, moved: false };
    }

    db.prepare(
      `
        insert into repository_learn_cursors (common_git_dir, cursor_at, updated_at)
        values (?, ?, ?)
        on conflict(common_git_dir) do update set
          cursor_at = excluded.cursor_at,
          updated_at = excluded.updated_at
      `
    ).run(commonGitDir, cursorAt, currentTimestamp());
    db.exec("commit");
    return { cursorAt, moved: true };
  } catch (error) {
    db.exec("rollback");
    throw error;
  }
}

export function deleteLearnCursor(db: DatabaseSync, commonGitDir: string): void {
  db.prepare("delete from repository_learn_cursors where common_git_dir = ?").run(
    commonGitDir
  );
}

// Call inside the transaction that deletes the project row, after the delete.
export function deleteOrphanedLearnCursor(
  db: DatabaseSync,
  commonGitDir: string | null
): void {
  if (commonGitDir === null) return;

  const remaining = db
    .prepare("select 1 from projects where common_git_dir = ? limit 1")
    .get(commonGitDir);

  if (!remaining) deleteLearnCursor(db, commonGitDir);
}
