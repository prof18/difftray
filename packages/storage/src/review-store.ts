import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import {
  type CreateReviewCommentInput,
  type CreateReviewFileCommentInput,
  type ReviewCommentRecord,
  type ReviewFileCommentRecord,
  type ReviewMarkInput,
  type ReviewMarkRecord,
  type ReviewNoteRecord,
  type SaveReviewNoteInput
} from "./records.js";
import {
  reviewCommentFromRow,
  reviewFileCommentFromRow,
  reviewMarkFromRow,
  reviewNoteFromRow,
  type ReviewCommentRow,
  type ReviewFileCommentRow,
  type ReviewMarkRow,
  type ReviewNoteRow
} from "./rows.js";
import { currentTimestamp } from "./timestamps.js";

export function markReviewed(db: DatabaseSync, input: ReviewMarkInput): void {
  const now = currentTimestamp();
  const id = reviewMarkId(input);
  db.prepare(
    `
    insert into review_marks (
      id,
      project_id,
      review_target_id,
      path,
      previous_path,
      reviewed_diff_hash,
      reviewed_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(review_target_id, path, reviewed_diff_hash) do update set
      previous_path = excluded.previous_path,
      updated_at = excluded.updated_at
  `
  ).run(
    id,
    input.projectId,
    input.reviewTargetId,
    input.path,
    input.previousPath ?? null,
    input.reviewedDiffHash,
    now,
    now
  );
}

export function unmarkReviewed(
  db: DatabaseSync,
  reviewTargetId: string,
  filePath: string,
  reviewedDiffHash: string
): void {
  db.prepare(
    `
      delete from review_marks
      where review_target_id = ?
        and path = ?
        and reviewed_diff_hash = ?
    `
  ).run(reviewTargetId, filePath, reviewedDiffHash);
}

export function isReviewed(
  db: DatabaseSync,
  reviewTargetId: string,
  filePath: string,
  currentDiffHash: string
): boolean {
  const row = db
    .prepare(
      `
        select 1 as found
        from review_marks
        where review_target_id = ?
          and path = ?
          and reviewed_diff_hash = ?
        limit 1
      `
    )
    .get(reviewTargetId, filePath, currentDiffHash);

  return row !== undefined;
}

export function listReviewMarks(
  db: DatabaseSync,
  reviewTargetId: string
): readonly ReviewMarkRecord[] {
  const rows = db
    .prepare(
      `
        select path, previous_path, reviewed_diff_hash, review_target_id
        from review_marks
        where review_target_id = ?
        order by path asc, reviewed_at desc
      `
    )
    .all(reviewTargetId);

  return rows.map((row) => reviewMarkFromRow(row as ReviewMarkRow));
}

export function createReviewComment(
  db: DatabaseSync,
  input: CreateReviewCommentInput
): ReviewCommentRecord {
  const now = currentTimestamp();
  const id = randomUUID();
  const lineStart = normalizeLineNumber(input.lineStart);
  const lineEnd = Math.max(lineStart, normalizeLineNumber(input.lineEnd));

  db.prepare(
    `
    insert into review_comments (
      id,
      project_id,
      review_target_id,
      path,
      previous_path,
      diff_hash,
      side,
      line_start,
      line_end,
      body,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    id,
    input.projectId,
    input.reviewTargetId,
    input.path,
    input.previousPath ?? null,
    input.diffHash,
    input.side,
    lineStart,
    lineEnd,
    input.body,
    now,
    now
  );

  const comment = getReviewComment(db, id);

  if (!comment) {
    throw new Error("Review comment was not stored.");
  }

  return comment;
}

export function updateReviewComment(
  db: DatabaseSync,
  id: string,
  body: string
): ReviewCommentRecord | null {
  const result = db
    .prepare(
      `
      update review_comments
      set body = ?,
          updated_at = ?
      where id = ?
    `
    )
    .run(body, currentTimestamp(), id);

  return result.changes > 0 ? getReviewComment(db, id) : null;
}

export function deleteReviewComment(db: DatabaseSync, id: string): boolean {
  const result = db.prepare("delete from review_comments where id = ?").run(id);

  return result.changes > 0;
}

export function listReviewComments(
  db: DatabaseSync,
  reviewTargetId: string
): readonly ReviewCommentRecord[] {
  const rows = db
    .prepare(
      `
        select *
        from review_comments
        where review_target_id = ?
        order by path asc, line_start asc, line_end asc, created_at asc
      `
    )
    .all(reviewTargetId);

  return rows.map((row) => reviewCommentFromRow(row as ReviewCommentRow));
}

export function getReviewComment(
  db: DatabaseSync,
  id: string
): ReviewCommentRecord | null {
  const row = db.prepare("select * from review_comments where id = ?").get(id);

  return row ? reviewCommentFromRow(row as ReviewCommentRow) : null;
}

export function createReviewFileComment(
  db: DatabaseSync,
  input: CreateReviewFileCommentInput
): ReviewFileCommentRecord {
  const now = currentTimestamp();
  const id = randomUUID();

  db.prepare(
    `
    insert into review_file_comments (
      id,
      project_id,
      review_target_id,
      path,
      previous_path,
      diff_hash,
      body,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    id,
    input.projectId,
    input.reviewTargetId,
    input.path,
    input.previousPath ?? null,
    input.diffHash,
    input.body,
    now,
    now
  );

  const comment = getReviewFileComment(db, id);

  if (!comment) {
    throw new Error("Review file comment was not stored.");
  }

  return comment;
}

export function updateReviewFileComment(
  db: DatabaseSync,
  id: string,
  body: string
): ReviewFileCommentRecord | null {
  const result = db
    .prepare(
      `
      update review_file_comments
      set body = ?,
          updated_at = ?
      where id = ?
    `
    )
    .run(body, currentTimestamp(), id);

  return result.changes > 0 ? getReviewFileComment(db, id) : null;
}

export function deleteReviewFileComment(db: DatabaseSync, id: string): boolean {
  const result = db.prepare("delete from review_file_comments where id = ?").run(id);

  return result.changes > 0;
}

export function listReviewFileComments(
  db: DatabaseSync,
  reviewTargetId: string
): readonly ReviewFileCommentRecord[] {
  const rows = db
    .prepare(
      `
        select *
        from review_file_comments
        where review_target_id = ?
        order by path asc, created_at asc
      `
    )
    .all(reviewTargetId);

  return rows.map((row) => reviewFileCommentFromRow(row as ReviewFileCommentRow));
}

export function getReviewFileComment(
  db: DatabaseSync,
  id: string
): ReviewFileCommentRecord | null {
  const row = db.prepare("select * from review_file_comments where id = ?").get(id);

  return row ? reviewFileCommentFromRow(row as ReviewFileCommentRow) : null;
}

export function getReviewNote(
  db: DatabaseSync,
  scopeId: string
): ReviewNoteRecord | null {
  const row = db.prepare("select * from review_notes where scope_id = ?").get(scopeId);

  return row ? reviewNoteFromRow(row as ReviewNoteRow) : null;
}

export function saveReviewNote(
  db: DatabaseSync,
  input: SaveReviewNoteInput
): ReviewNoteRecord {
  const now = currentTimestamp();

  db.prepare(
    `
    insert into review_notes (
      scope_id,
      project_id,
      body,
      dismissed_at,
      created_at,
      updated_at
    ) values (?, ?, ?, null, ?, ?)
    on conflict(scope_id) do update set
      body = excluded.body,
      dismissed_at = null,
      updated_at = excluded.updated_at
  `
  ).run(input.scopeId, input.projectId, input.body, now, now);

  const note = getReviewNote(db, input.scopeId);

  if (!note) {
    throw new Error("Review note was not stored.");
  }

  return note;
}

export function setReviewNoteDismissed(
  db: DatabaseSync,
  scopeId: string,
  dismissed: boolean
): ReviewNoteRecord | null {
  const now = currentTimestamp();
  const result = db
    .prepare(
      `
      update review_notes
      set dismissed_at = ?,
          updated_at = ?
      where scope_id = ?
    `
    )
    .run(dismissed ? now : null, now, scopeId);

  return result.changes > 0 ? getReviewNote(db, scopeId) : null;
}

export function deleteReviewNote(db: DatabaseSync, scopeId: string): boolean {
  const result = db.prepare("delete from review_notes where scope_id = ?").run(scopeId);

  return result.changes > 0;
}

function reviewMarkId(input: ReviewMarkInput): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        input.projectId,
        input.reviewTargetId,
        input.path,
        input.reviewedDiffHash
      ]),
      "utf8"
    )
    .digest("hex");
}

function normalizeLineNumber(value: number): number {
  return Math.max(1, Math.round(value));
}
