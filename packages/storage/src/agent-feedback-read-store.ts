import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { getReviewNoteSnapshot } from "./review-note-revisions.js";

export type AgentFeedbackPageInput = {
  readonly projectId: string;
  readonly reviewTargetId: string;
  readonly noteScopeId: string;
  readonly files: readonly {
    readonly path: string;
    readonly diffHash: string;
    readonly visible: boolean;
  }[];
  readonly includeInactive: boolean;
  readonly limit: number;
  readonly offset: number;
  readonly expectedFeedbackVersion?: string;
};
export type StoredAgentFeedbackView = {
  readonly id: string;
  readonly kind: "line" | "file" | "overall";
  readonly body: string;
  readonly active: boolean;
  readonly path?: string;
  readonly previousPath?: string;
  readonly diffHash?: string;
  readonly reviewTargetId?: string;
  readonly side?: "additions" | "deletions";
  readonly lineStart?: number;
  readonly lineEnd?: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly inactiveReason?: "target_changed" | "diff_changed" | "dismissed";
};
export type AgentFeedbackPage = {
  readonly items: StoredAgentFeedbackView[];
  readonly total: number;
  readonly inactiveCount: number;
  readonly feedbackVersion: string;
  readonly noteVersion: string;
  readonly note: { readonly body: string; readonly dismissedAt: string | null } | null;
};
export class StaleAgentFeedbackError extends Error {
  constructor() {
    super("Feedback changed; restart feedback pagination.");
    this.name = "StaleAgentFeedbackError";
  }
}

type Row = {
  id: string;
  kind: StoredAgentFeedbackView["kind"];
  body: string;
  path: string | null;
  previous_path: string | null;
  diff_hash: string | null;
  review_target_id: string | null;
  side: "additions" | "deletions" | null;
  line_start: number | null;
  line_end: number | null;
  created_at: string;
  updated_at: string;
  reason: StoredAgentFeedbackView["inactiveReason"] | null;
};
const query = `with files as (
  select json_extract(value, '$.path') as path, json_extract(value, '$.diffHash') as diff_hash from json_each(?)
), feedback as (
 select c.id, 'line' as kind, c.body, c.path, c.previous_path, c.diff_hash, c.review_target_id,
 c.side, c.line_start, c.line_end, c.created_at, c.updated_at,
 case when c.review_target_id != ? then 'target_changed' when f.path is null or c.diff_hash != f.diff_hash then 'diff_changed' else null end as reason
 from review_comments c left join files f on f.path = c.path where c.project_id = ?
 union all
 select c.id, 'file', c.body, c.path, c.previous_path, c.diff_hash, c.review_target_id,
 null, null, null, c.created_at, c.updated_at,
 case when c.review_target_id != ? then 'target_changed' when f.path is null or c.diff_hash != f.diff_hash then 'diff_changed' else null end
 from review_file_comments c left join files f on f.path = c.path where c.project_id = ?
 union all
 select n.scope_id, 'overall', n.body, null, null, null, null, null, null, null, n.created_at, n.updated_at,
 case when n.scope_id != ? then 'target_changed' when n.dismissed_at is not null then 'dismissed' else null end
 from review_notes n where n.project_id = ?
)`;

export function listAgentFeedbackPage(
  db: DatabaseSync,
  input: AgentFeedbackPageInput
): AgentFeedbackPage {
  if (
    !Number.isSafeInteger(input.limit) ||
    input.limit < 1 ||
    input.limit > 1000 ||
    !Number.isSafeInteger(input.offset) ||
    input.offset < 0
  )
    throw new RangeError("Invalid feedback page bounds.");
  db.exec("savepoint agent_feedback_read");
  try {
    const revision =
      db
        .prepare("select revision from project_feedback_revisions where project_id = ?")
        .get(input.projectId)?.revision ?? 0;
    const feedbackVersion = createHash("sha256")
      .update(JSON.stringify([input.projectId, revision]))
      .digest("hex");
    if (
      input.expectedFeedbackVersion !== undefined &&
      input.expectedFeedbackVersion !== feedbackVersion
    )
      throw new StaleAgentFeedbackError();
    const params = [
      JSON.stringify(input.files),
      input.reviewTargetId,
      input.projectId,
      input.reviewTargetId,
      input.projectId,
      input.noteScopeId,
      input.projectId
    ];
    const counts = db
      .prepare(
        query +
          " select count(*) as all_count, coalesce(sum(reason is not null), 0) as inactive_count from feedback"
      )
      .get(...params) as { all_count: number; inactive_count: number };
    const rows = db
      .prepare(
        query +
          ` select * from feedback where (? or reason is null) order by kind, path, line_start, line_end, created_at, id limit ? offset ?`
      )
      .all(
        ...params,
        Number(input.includeInactive),
        input.limit,
        input.offset
      ) as unknown as Row[];
    // Scope ownership is checked independently, since scope IDs are globally unique.
    const owner = db
      .prepare("select project_id from review_note_revisions where scope_id = ?")
      .get(input.noteScopeId);
    if (owner && owner.project_id !== input.projectId)
      throw new Error("Review note scope belongs to another project.");
    const snapshot = getReviewNoteSnapshot(db, input.noteScopeId);
    const items: StoredAgentFeedbackView[] = rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      body: r.body,
      active: r.reason === null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      ...(r.reason ? { inactiveReason: r.reason } : {}),
      ...(r.path !== null ? { path: r.path } : {}),
      ...(r.previous_path !== null ? { previousPath: r.previous_path } : {}),
      ...(r.diff_hash !== null ? { diffHash: r.diff_hash } : {}),
      ...(r.review_target_id !== null ? { reviewTargetId: r.review_target_id } : {}),
      ...(r.side !== null ? { side: r.side } : {}),
      ...(r.line_start !== null ? { lineStart: r.line_start } : {}),
      ...(r.line_end !== null ? { lineEnd: r.line_end } : {})
    }));
    db.exec("release savepoint agent_feedback_read");
    return {
      items,
      total: input.includeInactive
        ? counts.all_count
        : counts.all_count - counts.inactive_count,
      inactiveCount: counts.inactive_count,
      feedbackVersion,
      noteVersion: snapshot.token,
      note: snapshot.note
        ? { body: snapshot.note.body, dismissedAt: snapshot.note.dismissedAt ?? null }
        : null
    };
  } catch (error) {
    db.exec("rollback to savepoint agent_feedback_read");
    db.exec("release savepoint agent_feedback_read");
    throw error;
  }
}
