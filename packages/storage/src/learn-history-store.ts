import type { DatabaseSync } from "node:sqlite";

import type { FeedbackActor, StoredReviewTargetRecord } from "./records.js";
import { parseFeedbackActor, reviewTargetFromRow, type ReviewTargetRow } from "./rows.js";

export type LearnHistoryProjectInput = {
  readonly projectId: string;
  // When set, only comments created and notes saved at or after it belong to the
  // project's current repository.
  readonly since: string | null;
};

export type LearnHistoryQueryInput = {
  readonly projects: readonly LearnHistoryProjectInput[];
  // New rows have updated_at after `after` (no lower limit when null) and at or
  // before `upTo`. Earlier rows exist only when `after` is set.
  readonly after: string | null;
  readonly upTo: string;
  readonly earlierFrom: string;
  readonly earlierLimit: number;
};

export type LearnHistoryRow = {
  readonly kind: "line" | "file" | "note";
  // The comment id, or the note scope id.
  readonly id: string;
  readonly projectId: string;
  readonly body: string;
  readonly path: string | null;
  readonly previousPath: string | null;
  readonly side: "additions" | "deletions" | null;
  readonly lineStart: number | null;
  readonly lineEnd: number | null;
  readonly diffHash: string | null;
  readonly reviewTargetId: string | null;
  readonly scopeId: string | null;
  readonly excerptJson: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly createdBy: FeedbackActor | null;
  readonly lastEditedBy: FeedbackActor;
  readonly dismissedAt: string | null;
  readonly target: StoredReviewTargetRecord | null;
};

export type LearnHistoryRows = {
  readonly newRows: readonly LearnHistoryRow[];
  readonly earlierRows: readonly LearnHistoryRow[];
};

type Row = {
  readonly kind: LearnHistoryRow["kind"];
  readonly id: string;
  readonly project_id: string;
  readonly body: string;
  readonly path: string | null;
  readonly previous_path: string | null;
  readonly side: "additions" | "deletions" | null;
  readonly line_start: number | null;
  readonly line_end: number | null;
  readonly diff_hash: string | null;
  readonly review_target_id: string | null;
  readonly scope_id: string | null;
  readonly excerpt_json: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly created_by_json: string | null;
  readonly last_edited_by_json: string | null;
  readonly dismissed_at: string | null;
  readonly t_id: string | null;
  readonly t_project_id: string | null;
  readonly t_mode: ReviewTargetRow["mode"] | null;
  readonly t_base_ref_name: string | null;
  readonly t_base_ref_sha: string | null;
  readonly t_commit_sha: string | null;
  readonly t_commit_short_sha: string | null;
  readonly t_commit_subject: string | null;
  readonly t_head_kind: ReviewTargetRow["head_kind"] | null;
  readonly t_head_ref_name: string | null;
  readonly t_head_ref_sha: string | null;
  readonly t_merge_base_sha: string | null;
  readonly t_parent_sha: string | null;
  readonly t_created_at: string | null;
  readonly t_last_used_at: string | null;
};

const targetColumns = `t.id as t_id, t.project_id as t_project_id, t.mode as t_mode,
 t.base_ref_name as t_base_ref_name, t.base_ref_sha as t_base_ref_sha,
 t.commit_sha as t_commit_sha, t.commit_short_sha as t_commit_short_sha,
 t.commit_subject as t_commit_subject, t.head_kind as t_head_kind,
 t.head_ref_name as t_head_ref_name, t.head_ref_sha as t_head_ref_sha,
 t.merge_base_sha as t_merge_base_sha, t.parent_sha as t_parent_sha,
 t.created_at as t_created_at, t.last_used_at as t_last_used_at`;

const nullTargetColumns = `null as t_id, null as t_project_id, null as t_mode,
 null as t_base_ref_name, null as t_base_ref_sha, null as t_commit_sha,
 null as t_commit_short_sha, null as t_commit_subject, null as t_head_kind,
 null as t_head_ref_name, null as t_head_ref_sha, null as t_merge_base_sha,
 null as t_parent_sha, null as t_created_at, null as t_last_used_at`;

// One query per table, joined into one union like listAgentFeedbackPage. The
// projects parameter is a JSON array of { projectId, since }.
const feedbackQuery = `with scope as (
  select json_extract(value, '$.projectId') as project_id,
    json_extract(value, '$.since') as since
  from json_each(?)
), feedback as (
 select 'line' as kind, c.id, c.project_id, c.body, c.path, c.previous_path, c.side,
 c.line_start, c.line_end, c.diff_hash, c.review_target_id, null as scope_id,
 c.excerpt_json, c.created_at, c.updated_at, c.created_by_json, c.last_edited_by_json,
 null as dismissed_at, ${targetColumns}
 from review_comments c join scope s on s.project_id = c.project_id
 left join review_targets t on t.id = c.review_target_id
 where s.since is null or c.created_at >= s.since
 union all
 select 'file', c.id, c.project_id, c.body, c.path, c.previous_path, null, null, null,
 c.diff_hash, c.review_target_id, null, c.excerpt_json, c.created_at, c.updated_at,
 c.created_by_json, c.last_edited_by_json, null, ${targetColumns}
 from review_file_comments c join scope s on s.project_id = c.project_id
 left join review_targets t on t.id = c.review_target_id
 where s.since is null or c.created_at >= s.since
 union all
 select 'note', n.scope_id, n.project_id, n.body, null, null, null, null, null, null,
 null, n.scope_id, n.excerpt_json, n.created_at, n.updated_at, null,
 n.last_edited_by_json, n.dismissed_at, ${nullTargetColumns}
 from review_notes n join scope s on s.project_id = n.project_id
 where s.since is null or (n.body_saved_at is not null and n.body_saved_at >= s.since)
)`;

export function listLearnHistoryRows(
  db: DatabaseSync,
  input: LearnHistoryQueryInput
): LearnHistoryRows {
  if (!Number.isSafeInteger(input.earlierLimit) || input.earlierLimit < 0) {
    throw new RangeError("Invalid earlier history limit.");
  }

  const projects = JSON.stringify(
    input.projects.map((project) => ({
      projectId: project.projectId,
      since: project.since
    }))
  );
  const newRows = db
    .prepare(
      feedbackQuery +
        ` select * from feedback
          where (? is null or updated_at > ?) and updated_at <= ?
          order by updated_at, kind, id`
    )
    .all(projects, input.after, input.after, input.upTo) as unknown as Row[];
  const earlierRows =
    input.after === null || input.earlierLimit === 0
      ? []
      : (db
          .prepare(
            feedbackQuery +
              ` select * from feedback
                where updated_at <= ? and updated_at <= ? and updated_at >= ?
                order by updated_at desc, kind, id
                limit ?`
          )
          .all(
            projects,
            input.after,
            input.upTo,
            input.earlierFrom,
            input.earlierLimit
          ) as unknown as Row[]);

  return { earlierRows: earlierRows.map(historyRow), newRows: newRows.map(historyRow) };
}

export function listLearnReviewTargets(
  db: DatabaseSync,
  projectId: string
): readonly StoredReviewTargetRecord[] {
  const rows = db
    .prepare("select * from review_targets where project_id = ? order by created_at, id")
    .all(projectId);

  return rows.map((row) => reviewTargetFromRow(row as ReviewTargetRow));
}

function historyRow(row: Row): LearnHistoryRow {
  return {
    body: row.body,
    createdAt: row.created_at,
    createdBy: row.kind === "note" ? null : parseFeedbackActor(row.created_by_json),
    diffHash: row.diff_hash,
    dismissedAt: row.dismissed_at,
    excerptJson: row.excerpt_json,
    id: row.id,
    kind: row.kind,
    lastEditedBy: parseFeedbackActor(row.last_edited_by_json),
    lineEnd: row.line_end,
    lineStart: row.line_start,
    path: row.path,
    previousPath: row.previous_path,
    projectId: row.project_id,
    reviewTargetId: row.review_target_id,
    scopeId: row.scope_id,
    side: row.side,
    target: joinedTarget(row),
    updatedAt: row.updated_at
  };
}

function joinedTarget(row: Row): StoredReviewTargetRecord | null {
  if (
    row.t_id === null ||
    row.t_project_id === null ||
    row.t_mode === null ||
    row.t_head_kind === null ||
    row.t_created_at === null ||
    row.t_last_used_at === null
  ) {
    return null;
  }

  return reviewTargetFromRow({
    base_ref_name: row.t_base_ref_name,
    base_ref_sha: row.t_base_ref_sha,
    commit_sha: row.t_commit_sha,
    commit_short_sha: row.t_commit_short_sha,
    commit_subject: row.t_commit_subject,
    created_at: row.t_created_at,
    head_kind: row.t_head_kind,
    head_ref_name: row.t_head_ref_name,
    head_ref_sha: row.t_head_ref_sha,
    id: row.t_id,
    last_used_at: row.t_last_used_at,
    merge_base_sha: row.t_merge_base_sha,
    mode: row.t_mode,
    parent_sha: row.t_parent_sha,
    project_id: row.t_project_id
  });
}
