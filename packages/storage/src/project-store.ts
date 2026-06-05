import type { DatabaseSync } from "node:sqlite";

import {
  type ProjectRecord,
  type ReviewTargetRecord,
  type StoredProjectRecord,
  type StoredReviewTargetRecord
} from "./records.js";
import {
  projectFromRow,
  reviewTargetFromRow,
  type ProjectRow,
  type ReviewTargetRow
} from "./rows.js";
import { currentTimestamp } from "./timestamps.js";

export function upsertProject(db: DatabaseSync, project: ProjectRecord): void {
  const now = currentTimestamp();
  db.prepare(
    `
    insert into projects (
      id,
      name,
      path,
      default_base_ref,
      default_commit_ref,
      default_diff_target_mode,
      created_at,
      updated_at,
      last_opened_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(id) do update set
      name = excluded.name,
      path = excluded.path,
      default_base_ref = case
        when excluded.default_base_ref is null then projects.default_base_ref
        else excluded.default_base_ref
      end,
      default_commit_ref = case
        when excluded.default_commit_ref is null then projects.default_commit_ref
        else excluded.default_commit_ref
      end,
      default_diff_target_mode = case
        when excluded.default_diff_target_mode = 'working_tree'
          then projects.default_diff_target_mode
        else excluded.default_diff_target_mode
      end,
      updated_at = excluded.updated_at,
      last_opened_at = excluded.last_opened_at
  `
  ).run(
    project.id,
    project.name,
    project.path,
    project.defaultBaseRef ?? null,
    project.defaultCommitRef ?? null,
    project.defaultDiffTargetMode ??
      (project.defaultCommitRef
        ? "commit"
        : project.defaultBaseRef
          ? "branch"
          : "working_tree"),
    now,
    now,
    project.lastOpenedAt ?? null
  );
}

export function updateProjectDefaultDiffTarget(
  db: DatabaseSync,
  projectId: string,
  target:
    | {
        readonly mode: "branch";
        readonly ref: string;
      }
    | {
        readonly mode: "commit";
        readonly ref: string;
      }
    | {
        readonly mode: "working_tree";
      }
): void {
  const defaultBaseRef = target.mode === "branch" ? target.ref : undefined;
  const defaultCommitRef = target.mode === "commit" ? target.ref : undefined;

  db.prepare(
    `
      update projects
      set default_base_ref = ?,
          default_commit_ref = ?,
          default_diff_target_mode = ?,
          updated_at = ?
      where id = ?
    `
  ).run(
    defaultBaseRef ?? null,
    defaultCommitRef ?? null,
    target.mode,
    currentTimestamp(),
    projectId
  );
}

export function deleteProject(db: DatabaseSync, projectId: string): void {
  db.prepare("delete from projects where id = ?").run(projectId);
}

export function getProject(
  db: DatabaseSync,
  column: "id" | "path",
  value: string
): StoredProjectRecord | null {
  const row = db.prepare(`select * from projects where ${column} = ?`).get(value);

  if (!row) {
    return null;
  }

  return projectFromRow(row as ProjectRow);
}

export function listRecentProjects(db: DatabaseSync): readonly StoredProjectRecord[] {
  const rows = db
    .prepare(
      `
        select *
        from projects
        order by
          last_opened_at is null,
          last_opened_at desc,
          updated_at desc
      `
    )
    .all();

  return rows.map((row) => projectFromRow(row as ProjectRow));
}

export function upsertReviewTarget(db: DatabaseSync, target: ReviewTargetRecord): void {
  const now = currentTimestamp();
  db.prepare(
    `
    insert into review_targets (
      id,
      project_id,
      mode,
      base_ref_name,
      base_ref_sha,
      commit_sha,
      commit_short_sha,
      commit_subject,
      head_ref_name,
      head_ref_sha,
      merge_base_sha,
      parent_sha,
      head_kind,
      created_at,
      last_used_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(id) do update set
      project_id = excluded.project_id,
      mode = excluded.mode,
      base_ref_name = excluded.base_ref_name,
      base_ref_sha = excluded.base_ref_sha,
      commit_sha = excluded.commit_sha,
      commit_short_sha = excluded.commit_short_sha,
      commit_subject = excluded.commit_subject,
      head_ref_name = excluded.head_ref_name,
      head_ref_sha = excluded.head_ref_sha,
      merge_base_sha = excluded.merge_base_sha,
      parent_sha = excluded.parent_sha,
      head_kind = excluded.head_kind,
      last_used_at = excluded.last_used_at
  `
  ).run(
    target.id,
    target.projectId,
    target.mode,
    target.baseRefName ?? null,
    target.baseRefSha ?? null,
    target.commitSha ?? null,
    target.commitShortSha ?? null,
    target.commitSubject ?? null,
    target.headRefName ?? null,
    target.headRefSha ?? null,
    target.mergeBaseSha ?? null,
    target.parentSha ?? null,
    target.headKind,
    now,
    now
  );
}

export function getReviewTarget(
  db: DatabaseSync,
  id: string
): StoredReviewTargetRecord | null {
  const row = db.prepare("select * from review_targets where id = ?").get(id);

  if (!row) {
    return null;
  }

  return reviewTargetFromRow(row as ReviewTargetRow);
}
