import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import type { ReviewNoteRecord } from "./records.js";
import { reviewNoteFromRow, type ReviewNoteRow } from "./rows.js";

export type ReviewNoteSnapshot = {
  readonly note: ReviewNoteRecord | null;
  readonly revision: number;
  readonly token: string;
};

type SnapshotRow = Partial<ReviewNoteRow> & { revision: number | null };

export function getReviewNoteSnapshot(
  db: DatabaseSync,
  scopeId: string
): ReviewNoteSnapshot {
  const row = db
    .prepare(
      `
    select n.*, r.revision
    from (select ? as scope_id) as requested
    left join review_notes as n on n.scope_id = requested.scope_id
    left join review_note_revisions as r on r.scope_id = requested.scope_id
  `
    )
    .get(scopeId) as SnapshotRow;
  const note = row.project_id ? reviewNoteFromRow(row as ReviewNoteRow) : null;
  const revision = row.revision ?? 0;
  const token = createHash("sha256")
    .update(
      JSON.stringify([
        scopeId,
        revision,
        note !== null,
        note?.body ?? null,
        note?.dismissedAt ?? null
      ]),
      "utf8"
    )
    .digest("hex");
  return { note, revision, token };
}

export function incrementReviewNoteRevision(
  db: DatabaseSync,
  scopeId: string,
  projectId: string
): void {
  db.prepare(
    `
    insert into review_note_revisions (scope_id, project_id, revision)
    values (?, ?, 1)
    on conflict(scope_id) do update set revision = revision + 1
  `
  ).run(scopeId, projectId);
}

export function withReviewNoteTransaction<T>(db: DatabaseSync, operation: () => T): T {
  db.exec("savepoint review_note_mutation");
  try {
    const result = operation();
    db.exec("release savepoint review_note_mutation");
    return result;
  } catch (error) {
    db.exec("rollback to savepoint review_note_mutation");
    db.exec("release savepoint review_note_mutation");
    throw error;
  }
}
