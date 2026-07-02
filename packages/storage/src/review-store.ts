import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import {
  type CreateReviewCommentInput,
  type ReviewCommentRecord,
  type ReviewMarkInput,
  type ReviewMarkRecord
} from "./records.js";
import {
  reviewCommentFromRow,
  reviewMarkFromRow,
  type ReviewCommentRow,
  type ReviewMarkRow
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
