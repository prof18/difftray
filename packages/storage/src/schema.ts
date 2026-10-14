import type { DatabaseSync } from "node:sqlite";

export function runMigrations(db: DatabaseSync): void {
  db.exec(`
    create table if not exists projects (
      id text primary key,
      name text not null,
      path text not null unique,
      repository_name text,
      worktree_name text,
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

    create table if not exists review_file_comments (
      id text primary key,
      project_id text not null references projects(id) on delete cascade,
      review_target_id text not null references review_targets(id) on delete cascade,
      path text not null,
      previous_path text,
      diff_hash text not null,
      body text not null,
      created_at text not null,
      updated_at text not null
    );

    create index if not exists review_file_comments_target_path_idx
      on review_file_comments(review_target_id, path, diff_hash);

    -- Agent feedback pages and project deletion filter by project.
    create index if not exists review_comments_project_idx
      on review_comments(project_id);
    create index if not exists review_file_comments_project_idx
      on review_file_comments(project_id);

    create table if not exists review_notes (
      scope_id text primary key,
      project_id text not null references projects(id) on delete cascade,
      body text not null,
      dismissed_at text,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists review_note_revisions (
      scope_id text primary key,
      project_id text not null references projects(id) on delete cascade,
      revision integer not null
    );

    insert or ignore into review_note_revisions(scope_id, project_id, revision)
      select scope_id, project_id, 1 from review_notes;

    create table if not exists project_feedback_revisions (
      project_id text primary key references projects(id) on delete cascade,
      revision integer not null default 0
    );
    insert or ignore into project_feedback_revisions select id, 0 from projects;
    create trigger if not exists initialize_project_feedback_revision after insert on projects
    begin
      insert into project_feedback_revisions values (new.id, 0);
    end;

    create trigger if not exists review_comments_feedback_insert after insert on review_comments
    begin
      update project_feedback_revisions set revision = revision + 1 where project_id = new.project_id;
    end;
    create trigger if not exists review_comments_feedback_update after update on review_comments when old.body is not new.body
    begin
      update project_feedback_revisions set revision = revision + 1 where project_id = new.project_id;
    end;
    create trigger if not exists review_comments_feedback_delete after delete on review_comments
    begin
      update project_feedback_revisions set revision = revision + 1 where project_id = old.project_id;
    end;
    create trigger if not exists review_file_comments_feedback_insert after insert on review_file_comments
    begin
      update project_feedback_revisions set revision = revision + 1 where project_id = new.project_id;
    end;
    create trigger if not exists review_file_comments_feedback_update after update on review_file_comments when old.body is not new.body
    begin
      update project_feedback_revisions set revision = revision + 1 where project_id = new.project_id;
    end;
    create trigger if not exists review_file_comments_feedback_delete after delete on review_file_comments
    begin
      update project_feedback_revisions set revision = revision + 1 where project_id = old.project_id;
    end;
    create trigger if not exists review_notes_feedback_insert after insert on review_notes
    begin
      update project_feedback_revisions set revision = revision + 1 where project_id = new.project_id;
    end;
    create trigger if not exists review_notes_feedback_update after update on review_notes when old.body is not new.body or old.dismissed_at is not new.dismissed_at
    begin
      update project_feedback_revisions set revision = revision + 1 where project_id = new.project_id;
    end;
    create trigger if not exists review_notes_feedback_delete after delete on review_notes
    begin
      update project_feedback_revisions set revision = revision + 1 where project_id = old.project_id;
    end;
    create table if not exists agent_feedback_receipts (
      actor_name text not null,
      run_id text not null,
      request_id text not null,
      payload_hash text not null,
      response_json text not null,
      created_at text not null,
      primary key (actor_name, run_id, request_id)
    );
    create table if not exists agent_review_contexts (
      id text primary key,
      project_id text not null references projects(id) on delete cascade,
      context_json text not null,
      expires_at integer not null
    );

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

    create table if not exists companion_devices (
      id text primary key,
      name text not null,
      platform text not null,
      public_key text not null unique,
      created_at text not null,
      last_seen_at text,
      revoked_at text
    );

    create table if not exists repository_roots (
      id text primary key,
      path text not null unique,
      enabled integer not null,
      discovery_version integer not null default 0,
      last_scan_started_at text,
      last_scan_completed_at text,
      last_scan_error text
    );

    create table if not exists repository_catalog (
      id text primary key,
      root_id text not null references repository_roots(id) on delete cascade,
      path text not null unique,
      name text not null,
      last_seen_at text not null,
      available integer not null
    );

    create table if not exists repository_catalog_roots (
      repository_id text not null references repository_catalog(id) on delete cascade,
      root_id text not null references repository_roots(id) on delete cascade,
      last_seen_at text not null,
      available integer not null,
      primary key (repository_id, root_id)
    );

    insert or ignore into repository_catalog_roots (
      repository_id, root_id, last_seen_at, available
    )
    select id, root_id, last_seen_at, available from repository_catalog;
  `);
  ensureColumn(db, "review_comments", "created_by_json", "text");
  ensureColumn(db, "review_comments", "last_edited_by_json", "text");
  ensureColumn(db, "review_file_comments", "created_by_json", "text");
  ensureColumn(db, "review_file_comments", "last_edited_by_json", "text");
  ensureColumn(db, "review_notes", "last_edited_by_json", "text");
  db.exec(`
    drop trigger if exists review_comments_feedback_update;
    create trigger review_comments_feedback_update after update on review_comments
    when old.body is not new.body or old.last_edited_by_json is not new.last_edited_by_json or old.created_by_json is not new.created_by_json
    begin
      update project_feedback_revisions set revision = revision + 1 where project_id = new.project_id;
    end;
    drop trigger if exists review_file_comments_feedback_update;
    create trigger review_file_comments_feedback_update after update on review_file_comments
    when old.body is not new.body or old.last_edited_by_json is not new.last_edited_by_json or old.created_by_json is not new.created_by_json
    begin
      update project_feedback_revisions set revision = revision + 1 where project_id = new.project_id;
    end;
    drop trigger if exists review_notes_feedback_update;
    create trigger review_notes_feedback_update after update on review_notes
    when old.body is not new.body or old.last_edited_by_json is not new.last_edited_by_json or old.dismissed_at is not new.dismissed_at
    begin
      update project_feedback_revisions set revision = revision + 1 where project_id = new.project_id;
    end;
  `);
  ensureProjectColumn(db, "default_commit_ref", "text");
  ensureProjectColumn(db, "repository_name", "text");
  ensureProjectColumn(db, "worktree_name", "text");
  ensureColumn(db, "repository_roots", "discovery_version", "integer not null default 0");
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
