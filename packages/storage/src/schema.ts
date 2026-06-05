import type { DatabaseSync } from "node:sqlite";

export function runMigrations(db: DatabaseSync): void {
  db.exec(`
    create table if not exists projects (
      id text primary key,
      name text not null,
      path text not null unique,
      default_base_ref text,
      default_commit_ref text,
      default_diff_target_mode text not null default 'working_tree',
      created_at text not null,
      updated_at text not null,
      last_opened_at text
    );

    create table if not exists review_targets (
      id text primary key,
      project_id text not null references projects(id) on delete cascade,
      mode text not null,
      base_ref_name text,
      base_ref_sha text,
      commit_sha text,
      commit_short_sha text,
      commit_subject text,
      head_ref_name text,
      head_ref_sha text,
      merge_base_sha text,
      parent_sha text,
      head_kind text not null,
      created_at text not null,
      last_used_at text not null,
      unique(
        project_id,
        mode,
        base_ref_name,
        base_ref_sha,
        commit_sha,
        head_ref_name,
        head_ref_sha,
        merge_base_sha,
        parent_sha,
        head_kind
      )
    );

    create table if not exists review_marks (
      id text primary key,
      project_id text not null references projects(id) on delete cascade,
      review_target_id text not null references review_targets(id) on delete cascade,
      path text not null,
      previous_path text,
      reviewed_diff_hash text not null,
      reviewed_at text not null,
      updated_at text not null,
      unique(review_target_id, path, reviewed_diff_hash)
    );

    create table if not exists review_comments (
      id text primary key,
      project_id text not null references projects(id) on delete cascade,
      review_target_id text not null references review_targets(id) on delete cascade,
      path text not null,
      previous_path text,
      diff_hash text not null,
      side text not null check(side in ('additions', 'deletions')),
      line_start integer not null,
      line_end integer not null,
      body text not null,
      created_at text not null,
      updated_at text not null
    );

    create index if not exists review_comments_target_path_idx
      on review_comments(review_target_id, path, diff_hash, line_start);

    create table if not exists project_settings (
      project_id text primary key references projects(id) on delete cascade,
      show_generated_files integer not null default 0,
      editor_launch_config_json text,
      file_list_width integer not null default 340,
      file_list_collapsed integer not null default 0,
      default_diff_mode text not null default 'split',
      hide_whitespace_only_changes integer not null default 0,
      auto_collapse_hunks_over integer not null default 120,
      notify_on_drift integer not null default 1,
      review_reset_trigger text not null default 'diff_content',
      updated_at text not null
    );

    create table if not exists app_settings (
      key text primary key,
      value text not null,
      updated_at text not null
    );
  `);
  ensureProjectColumn(db, "default_commit_ref", "text");
  ensureProjectColumn(
    db,
    "default_diff_target_mode",
    "text not null default 'working_tree'"
  );
  db.exec(`
    update projects
    set default_diff_target_mode = 'branch'
    where default_base_ref is not null
      and default_diff_target_mode = 'working_tree'
  `);
  ensureReviewTargetColumn(db, "commit_sha", "text");
  ensureReviewTargetColumn(db, "commit_short_sha", "text");
  ensureReviewTargetColumn(db, "commit_subject", "text");
  ensureReviewTargetColumn(db, "parent_sha", "text");
  ensureProjectSettingsColumn(db, "file_list_width", "integer not null default 340");
  ensureProjectSettingsColumn(db, "file_list_collapsed", "integer not null default 0");
  ensureProjectSettingsColumn(db, "default_diff_mode", "text not null default 'split'");
  ensureProjectSettingsColumn(
    db,
    "hide_whitespace_only_changes",
    "integer not null default 0"
  );
  ensureProjectSettingsColumn(
    db,
    "auto_collapse_hunks_over",
    "integer not null default 120"
  );
  ensureProjectSettingsColumn(db, "notify_on_drift", "integer not null default 1");
  ensureProjectSettingsColumn(
    db,
    "review_reset_trigger",
    "text not null default 'diff_content'"
  );
}

function ensureProjectColumn(
  db: DatabaseSync,
  columnName: string,
  columnDefinition: string
): void {
  ensureColumn(db, "projects", columnName, columnDefinition);
}

function ensureProjectSettingsColumn(
  db: DatabaseSync,
  columnName: string,
  columnDefinition: string
): void {
  ensureColumn(db, "project_settings", columnName, columnDefinition);
}

function ensureReviewTargetColumn(
  db: DatabaseSync,
  columnName: string,
  columnDefinition: string
): void {
  ensureColumn(db, "review_targets", columnName, columnDefinition);
}

function ensureColumn(
  db: DatabaseSync,
  tableName: string,
  columnName: string,
  columnDefinition: string
): void {
  const rows = db
    .prepare(`pragma table_info(${tableName})`)
    .all() as unknown as readonly {
    readonly name: string;
  }[];

  if (rows.some((row) => row.name === columnName)) {
    return;
  }

  db.exec(`alter table ${tableName} add column ${columnName} ${columnDefinition}`);
}
