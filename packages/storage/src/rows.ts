import { clampFileListWidth, type ProjectSettingsRecord } from "./settings.js";
import type {
  ReviewCommentRecord,
  ReviewCommentSide,
  ReviewMarkRecord,
  StoredProjectRecord,
  StoredReviewTargetRecord
} from "./index.js";

export type ProjectRow = {
  readonly created_at: string;
  readonly default_base_ref: null | string;
  readonly id: string;
  readonly last_opened_at: null | string;
  readonly name: string;
  readonly path: string;
  readonly updated_at: string;
};

export type ReviewTargetRow = {
  readonly base_ref_name: null | string;
  readonly base_ref_sha: null | string;
  readonly created_at: string;
  readonly head_kind: "ref" | "working_tree";
  readonly head_ref_name: null | string;
  readonly head_ref_sha: null | string;
  readonly id: string;
  readonly last_used_at: string;
  readonly merge_base_sha: null | string;
  readonly mode: "branch" | "working_tree";
  readonly project_id: string;
};

export type ProjectSettingsRow = {
  readonly auto_collapse_hunks_over: number;
  readonly default_diff_mode: string;
  readonly editor_launch_config_json: null | string;
  readonly file_list_collapsed: 0 | 1;
  readonly file_list_width: number;
  readonly hide_whitespace_only_changes: 0 | 1;
  readonly notify_on_drift: 0 | 1;
  readonly project_id: string;
  readonly review_reset_trigger: string;
  readonly show_generated_files: 0 | 1;
};

export type ReviewMarkRow = {
  readonly path: string;
  readonly previous_path: null | string;
  readonly reviewed_diff_hash: string;
  readonly review_target_id: string;
};

export type ReviewCommentRow = {
  readonly body: string;
  readonly created_at: string;
  readonly diff_hash: string;
  readonly id: string;
  readonly line_end: number;
  readonly line_start: number;
  readonly path: string;
  readonly previous_path: null | string;
  readonly project_id: string;
  readonly review_target_id: string;
  readonly side: ReviewCommentSide;
  readonly updated_at: string;
};

export function projectFromRow(row: ProjectRow): StoredProjectRecord {
  return {
    createdAt: row.created_at,
    ...(row.default_base_ref ? { defaultBaseRef: row.default_base_ref } : {}),
    id: row.id,
    ...(row.last_opened_at ? { lastOpenedAt: row.last_opened_at } : {}),
    name: row.name,
    path: row.path,
    updatedAt: row.updated_at
  };
}

export function reviewTargetFromRow(row: ReviewTargetRow): StoredReviewTargetRecord {
  return {
    ...(row.base_ref_name ? { baseRefName: row.base_ref_name } : {}),
    ...(row.base_ref_sha ? { baseRefSha: row.base_ref_sha } : {}),
    createdAt: row.created_at,
    headKind: row.head_kind,
    ...(row.head_ref_name ? { headRefName: row.head_ref_name } : {}),
    ...(row.head_ref_sha ? { headRefSha: row.head_ref_sha } : {}),
    id: row.id,
    lastUsedAt: row.last_used_at,
    ...(row.merge_base_sha ? { mergeBaseSha: row.merge_base_sha } : {}),
    mode: row.mode,
    projectId: row.project_id
  };
}

export function projectSettingsFromRow(row: ProjectSettingsRow): ProjectSettingsRecord {
  return {
    fileListCollapsed: row.file_list_collapsed === 1,
    fileListWidth: clampFileListWidth(row.file_list_width),
    projectId: row.project_id
  };
}

export function reviewMarkFromRow(row: ReviewMarkRow): ReviewMarkRecord {
  return {
    path: row.path,
    ...(row.previous_path ? { previousPath: row.previous_path } : {}),
    reviewedDiffHash: row.reviewed_diff_hash,
    reviewTargetId: row.review_target_id
  };
}

export function reviewCommentFromRow(row: ReviewCommentRow): ReviewCommentRecord {
  return {
    body: row.body,
    createdAt: row.created_at,
    diffHash: row.diff_hash,
    id: row.id,
    lineEnd: row.line_end,
    lineStart: row.line_start,
    path: row.path,
    ...(row.previous_path ? { previousPath: row.previous_path } : {}),
    projectId: row.project_id,
    reviewTargetId: row.review_target_id,
    side: row.side,
    updatedAt: row.updated_at
  };
}
