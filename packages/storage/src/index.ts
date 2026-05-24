import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

export type ProjectRecord = {
  readonly defaultBaseRef?: string;
  readonly id: string;
  readonly lastOpenedAt?: string;
  readonly name: string;
  readonly path: string;
};

export type StoredProjectRecord = ProjectRecord & {
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type ReviewTargetRecord = {
  readonly baseRefName?: string;
  readonly baseRefSha?: string;
  readonly headKind: "ref" | "working_tree";
  readonly headRefName?: string;
  readonly headRefSha?: string;
  readonly id: string;
  readonly mergeBaseSha?: string;
  readonly mode: "branch" | "working_tree";
  readonly projectId: string;
};

export type StoredReviewTargetRecord = ReviewTargetRecord & {
  readonly createdAt: string;
  readonly lastUsedAt: string;
};

export type EditorLaunchConfig = {
  readonly args: readonly string[];
  readonly command: string;
};

export type DiffMode = "split" | "unified";
export type ReviewResetTrigger = "commit_sha" | "diff_content" | "line_count";
export type ThemeMode = "dark" | "light" | "system";

export type ProjectSettingsRecord = {
  readonly fileListCollapsed: boolean;
  readonly fileListWidth: number;
  readonly projectId: string;
};

export type AppSettingsRecord = {
  readonly autoCollapseHunksOver: number;
  readonly defaultDiffMode: DiffMode;
  readonly editorLaunchConfig?: EditorLaunchConfig;
  readonly hideWhitespaceOnlyChanges: boolean;
  readonly notifyOnDrift: boolean;
  readonly reviewResetTrigger: ReviewResetTrigger;
  readonly showGeneratedFiles: boolean;
  readonly themeMode: ThemeMode;
};

export type ReviewMarkInput = {
  readonly path: string;
  readonly previousPath?: string;
  readonly projectId: string;
  readonly reviewedDiffHash: string;
  readonly reviewTargetId: string;
};

export type ReviewMarkRecord = {
  readonly path: string;
  readonly previousPath?: string;
  readonly reviewedDiffHash: string;
  readonly reviewTargetId: string;
};

export type VerifyAndMarkReviewedInput = {
  readonly currentDiffHash: string;
  readonly displayedDiffHash: string;
  readonly path: string;
  readonly previousPath?: string;
  readonly projectId: string;
  readonly reviewTargetId: string;
};

export type VerifyAndMarkReviewedResult =
  | {
      readonly marked: false;
      readonly reason: "stale_diff";
    }
  | {
      readonly marked: true;
    };

export type VerifyAndUnmarkReviewedInput = {
  readonly currentDiffHash: string;
  readonly displayedDiffHash: string;
  readonly path: string;
  readonly reviewTargetId: string;
};

export type VerifyAndUnmarkReviewedResult =
  | {
      readonly reason: "stale_diff";
      readonly unmarked: false;
    }
  | {
      readonly unmarked: true;
    };

export type DifftrayStorage = {
  readonly close: () => void;
  readonly deleteProject: (id: string) => void;
  readonly getAppSettings: () => AppSettingsRecord;
  readonly getProject: (id: string) => StoredProjectRecord | null;
  readonly getProjectByPath: (path: string) => StoredProjectRecord | null;
  readonly getProjectSettings: (projectId: string) => ProjectSettingsRecord;
  readonly getReviewTarget: (id: string) => StoredReviewTargetRecord | null;
  readonly isReviewed: (
    reviewTargetId: string,
    path: string,
    currentDiffHash: string
  ) => boolean;
  readonly listRecentProjects: () => readonly StoredProjectRecord[];
  readonly listReviewMarks: (reviewTargetId: string) => readonly ReviewMarkRecord[];
  readonly markReviewed: (input: ReviewMarkInput) => void;
  readonly unmarkReviewed: (
    reviewTargetId: string,
    path: string,
    reviewedDiffHash: string
  ) => void;
  readonly updateProjectDefaultBaseRef: (
    projectId: string,
    defaultBaseRef: string | undefined
  ) => void;
  readonly upsertProject: (project: ProjectRecord) => void;
  readonly upsertAppSettings: (settings: AppSettingsRecord) => void;
  readonly upsertProjectSettings: (settings: ProjectSettingsRecord) => void;
  readonly upsertReviewTarget: (target: ReviewTargetRecord) => void;
  readonly verifyAndMarkReviewed: (
    input: VerifyAndMarkReviewedInput
  ) => VerifyAndMarkReviewedResult;
  readonly verifyAndUnmarkReviewed: (
    input: VerifyAndUnmarkReviewedInput
  ) => VerifyAndUnmarkReviewedResult;
};

export function openStorage(filename: string): DifftrayStorage {
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA foreign_keys = ON");
  runMigrations(db);

  return {
    close: () => {
      db.close();
    },
    deleteProject: (id) => {
      deleteProject(db, id);
    },
    getAppSettings: () => getAppSettings(db),
    getProject: (id) => getProject(db, "id", id),
    getProjectByPath: (projectPath) => getProject(db, "path", projectPath),
    getProjectSettings: (projectId) => getProjectSettings(db, projectId),
    getReviewTarget: (id) => getReviewTarget(db, id),
    isReviewed: (reviewTargetId, filePath, currentDiffHash) =>
      isReviewed(db, reviewTargetId, filePath, currentDiffHash),
    listRecentProjects: () => listRecentProjects(db),
    listReviewMarks: (reviewTargetId) => listReviewMarks(db, reviewTargetId),
    markReviewed: (input) => {
      markReviewed(db, input);
    },
    unmarkReviewed: (reviewTargetId, filePath, reviewedDiffHash) => {
      unmarkReviewed(db, reviewTargetId, filePath, reviewedDiffHash);
    },
    updateProjectDefaultBaseRef: (projectId, defaultBaseRef) => {
      updateProjectDefaultBaseRef(db, projectId, defaultBaseRef);
    },
    upsertProject: (project) => {
      upsertProject(db, project);
    },
    upsertAppSettings: (settings) => {
      upsertAppSettings(db, settings);
    },
    upsertProjectSettings: (settings) => {
      upsertProjectSettings(db, settings);
    },
    upsertReviewTarget: (target) => {
      upsertReviewTarget(db, target);
    },
    verifyAndMarkReviewed: (input) => {
      if (input.currentDiffHash !== input.displayedDiffHash) {
        return {
          marked: false,
          reason: "stale_diff"
        };
      }

      markReviewed(db, {
        path: input.path,
        ...(input.previousPath ? { previousPath: input.previousPath } : {}),
        projectId: input.projectId,
        reviewedDiffHash: input.currentDiffHash,
        reviewTargetId: input.reviewTargetId
      });

      return { marked: true };
    },
    verifyAndUnmarkReviewed: (input) => {
      if (input.currentDiffHash !== input.displayedDiffHash) {
        return {
          reason: "stale_diff",
          unmarked: false
        };
      }

      unmarkReviewed(db, input.reviewTargetId, input.path, input.currentDiffHash);

      return { unmarked: true };
    }
  };
}

function runMigrations(db: DatabaseSync): void {
  db.exec(`
    create table if not exists projects (
      id text primary key,
      name text not null,
      path text not null unique,
      default_base_ref text,
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
      head_ref_name text,
      head_ref_sha text,
      merge_base_sha text,
      head_kind text not null,
      created_at text not null,
      last_used_at text not null,
      unique(
        project_id,
        mode,
        base_ref_name,
        base_ref_sha,
        head_ref_name,
        head_ref_sha,
        merge_base_sha,
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

function ensureProjectSettingsColumn(
  db: DatabaseSync,
  columnName: string,
  columnDefinition: string
): void {
  const rows = db
    .prepare("pragma table_info(project_settings)")
    .all() as unknown as readonly {
    readonly name: string;
  }[];

  if (rows.some((row) => row.name === columnName)) {
    return;
  }

  db.exec(`alter table project_settings add column ${columnName} ${columnDefinition}`);
}

function upsertProject(db: DatabaseSync, project: ProjectRecord): void {
  const now = currentTimestamp();
  db.prepare(
    `
    insert into projects (
      id,
      name,
      path,
      default_base_ref,
      created_at,
      updated_at,
      last_opened_at
    ) values (?, ?, ?, ?, ?, ?, ?)
    on conflict(id) do update set
      name = excluded.name,
      path = excluded.path,
      default_base_ref = case
        when excluded.default_base_ref is null then projects.default_base_ref
        else excluded.default_base_ref
      end,
      updated_at = excluded.updated_at,
      last_opened_at = excluded.last_opened_at
  `
  ).run(
    project.id,
    project.name,
    project.path,
    project.defaultBaseRef ?? null,
    now,
    now,
    project.lastOpenedAt ?? null
  );
}

function updateProjectDefaultBaseRef(
  db: DatabaseSync,
  projectId: string,
  defaultBaseRef: string | undefined
): void {
  db.prepare(
    `
      update projects
      set default_base_ref = ?,
          updated_at = ?
      where id = ?
    `
  ).run(defaultBaseRef ?? null, currentTimestamp(), projectId);
}

function deleteProject(db: DatabaseSync, projectId: string): void {
  db.prepare("delete from projects where id = ?").run(projectId);
}

function getProject(
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

function listRecentProjects(db: DatabaseSync): readonly StoredProjectRecord[] {
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

function upsertReviewTarget(db: DatabaseSync, target: ReviewTargetRecord): void {
  const now = currentTimestamp();
  db.prepare(
    `
    insert into review_targets (
      id,
      project_id,
      mode,
      base_ref_name,
      base_ref_sha,
      head_ref_name,
      head_ref_sha,
      merge_base_sha,
      head_kind,
      created_at,
      last_used_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(id) do update set
      project_id = excluded.project_id,
      mode = excluded.mode,
      base_ref_name = excluded.base_ref_name,
      base_ref_sha = excluded.base_ref_sha,
      head_ref_name = excluded.head_ref_name,
      head_ref_sha = excluded.head_ref_sha,
      merge_base_sha = excluded.merge_base_sha,
      head_kind = excluded.head_kind,
      last_used_at = excluded.last_used_at
  `
  ).run(
    target.id,
    target.projectId,
    target.mode,
    target.baseRefName ?? null,
    target.baseRefSha ?? null,
    target.headRefName ?? null,
    target.headRefSha ?? null,
    target.mergeBaseSha ?? null,
    target.headKind,
    now,
    now
  );
}

function getReviewTarget(db: DatabaseSync, id: string): StoredReviewTargetRecord | null {
  const row = db.prepare("select * from review_targets where id = ?").get(id);

  if (!row) {
    return null;
  }

  return reviewTargetFromRow(row as ReviewTargetRow);
}

function upsertProjectSettings(db: DatabaseSync, settings: ProjectSettingsRecord): void {
  db.prepare(
    `
    insert into project_settings (
      project_id,
      file_list_width,
      file_list_collapsed,
      updated_at
    ) values (?, ?, ?, ?)
    on conflict(project_id) do update set
      file_list_width = excluded.file_list_width,
      file_list_collapsed = excluded.file_list_collapsed,
      updated_at = excluded.updated_at
  `
  ).run(
    settings.projectId,
    clampFileListWidth(settings.fileListWidth),
    settings.fileListCollapsed ? 1 : 0,
    currentTimestamp()
  );
}

function getProjectSettings(db: DatabaseSync, projectId: string): ProjectSettingsRecord {
  const row = db
    .prepare("select * from project_settings where project_id = ?")
    .get(projectId);

  if (!row) {
    return {
      fileListCollapsed: false,
      fileListWidth: 340,
      projectId
    };
  }

  return projectSettingsFromRow(row as ProjectSettingsRow);
}

function upsertAppSettings(db: DatabaseSync, settings: AppSettingsRecord): void {
  upsertAppSetting(
    db,
    "auto_collapse_hunks_over",
    String(clampAutoCollapseHunks(settings.autoCollapseHunksOver))
  );
  upsertAppSetting(db, "default_diff_mode", settings.defaultDiffMode);
  upsertAppSetting(
    db,
    "editor_launch_config_json",
    settings.editorLaunchConfig ? JSON.stringify(settings.editorLaunchConfig) : ""
  );
  upsertAppSetting(
    db,
    "hide_whitespace_only_changes",
    settings.hideWhitespaceOnlyChanges ? "1" : "0"
  );
  upsertAppSetting(db, "notify_on_drift", settings.notifyOnDrift ? "1" : "0");
  upsertAppSetting(db, "review_reset_trigger", settings.reviewResetTrigger);
  upsertAppSetting(db, "show_generated_files", settings.showGeneratedFiles ? "1" : "0");
  upsertAppSetting(db, "theme_mode", settings.themeMode);
}

function getAppSettings(db: DatabaseSync): AppSettingsRecord {
  const legacySettings = latestLegacyProjectAppSettings(db);
  const autoCollapseHunksOver = getAppSetting(db, "auto_collapse_hunks_over");
  const defaultDiffMode = getAppSetting(db, "default_diff_mode");
  const editorLaunchConfigJson = getAppSetting(db, "editor_launch_config_json");
  const hideWhitespaceOnlyChanges = getAppSetting(db, "hide_whitespace_only_changes");
  const notifyOnDrift = getAppSetting(db, "notify_on_drift");
  const reviewResetTrigger = getAppSetting(db, "review_reset_trigger");
  const showGeneratedFiles = getAppSetting(db, "show_generated_files");
  const themeMode = getAppSetting(db, "theme_mode");
  const editorLaunchConfig =
    editorLaunchConfigJson === undefined
      ? legacySettings.editorLaunchConfig
      : editorLaunchConfigJson.length > 0
        ? parseOptionalEditorLaunchConfig(editorLaunchConfigJson)
        : undefined;

  return {
    autoCollapseHunksOver: appNumberSetting(
      autoCollapseHunksOver,
      legacySettings.autoCollapseHunksOver,
      clampAutoCollapseHunks
    ),
    defaultDiffMode: diffModeFromValue(defaultDiffMode ?? legacySettings.defaultDiffMode),
    ...(editorLaunchConfig ? { editorLaunchConfig } : {}),
    hideWhitespaceOnlyChanges: appBooleanSetting(
      hideWhitespaceOnlyChanges,
      legacySettings.hideWhitespaceOnlyChanges
    ),
    notifyOnDrift: appBooleanSetting(notifyOnDrift, legacySettings.notifyOnDrift),
    reviewResetTrigger: reviewResetTriggerFromValue(
      reviewResetTrigger ?? legacySettings.reviewResetTrigger
    ),
    showGeneratedFiles: appBooleanSetting(
      showGeneratedFiles,
      legacySettings.showGeneratedFiles
    ),
    themeMode: isThemeMode(themeMode) ? themeMode : "system"
  };
}

function upsertAppSetting(db: DatabaseSync, key: string, value: string): void {
  db.prepare(
    `
    insert into app_settings (
      key,
      value,
      updated_at
    ) values (?, ?, ?)
    on conflict(key) do update set
      value = excluded.value,
      updated_at = excluded.updated_at
  `
  ).run(key, value, currentTimestamp());
}

function getAppSetting(db: DatabaseSync, key: string): string | undefined {
  const row = db.prepare("select value from app_settings where key = ?").get(key);

  return row ? (row as AppSettingsRow).value : undefined;
}

function markReviewed(db: DatabaseSync, input: ReviewMarkInput): void {
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

function unmarkReviewed(
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

function isReviewed(
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

function listReviewMarks(
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

function currentTimestamp(): string {
  return new Date().toISOString();
}

type ProjectRow = {
  readonly created_at: string;
  readonly default_base_ref: null | string;
  readonly id: string;
  readonly last_opened_at: null | string;
  readonly name: string;
  readonly path: string;
  readonly updated_at: string;
};

type ReviewTargetRow = {
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

type ProjectSettingsRow = {
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

type AppSettingsRow = {
  readonly value: string;
};

type ReviewMarkRow = {
  readonly path: string;
  readonly previous_path: null | string;
  readonly reviewed_diff_hash: string;
  readonly review_target_id: string;
};

function projectFromRow(row: ProjectRow): StoredProjectRecord {
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

function reviewTargetFromRow(row: ReviewTargetRow): StoredReviewTargetRecord {
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

function projectSettingsFromRow(row: ProjectSettingsRow): ProjectSettingsRecord {
  return {
    fileListCollapsed: row.file_list_collapsed === 1,
    fileListWidth: clampFileListWidth(row.file_list_width),
    projectId: row.project_id
  };
}

function clampFileListWidth(value: number): number {
  return Math.min(540, Math.max(220, Math.round(value)));
}

function clampAutoCollapseHunks(value: number): number {
  return Math.min(999, Math.max(20, Math.round(value)));
}

function reviewResetTriggerFromValue(value: string): ReviewResetTrigger {
  return value === "line_count" || value === "commit_sha" ? value : "diff_content";
}

function diffModeFromValue(value: string): DiffMode {
  return value === "unified" ? "unified" : "split";
}

function appBooleanSetting(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  return value === "1";
}

function appNumberSetting(
  value: string | undefined,
  fallback: number,
  clamp: (input: number) => number
): number {
  if (value === undefined) {
    return clamp(fallback);
  }

  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) ? clamp(parsedValue) : clamp(fallback);
}

function latestLegacyProjectAppSettings(db: DatabaseSync): AppSettingsRecord {
  const row = db
    .prepare(
      `
        select *
        from project_settings
        order by
          case
            when show_generated_files != 0
              or editor_launch_config_json is not null
              or default_diff_mode != 'split'
              or hide_whitespace_only_changes != 0
              or auto_collapse_hunks_over != 120
              or notify_on_drift != 1
              or review_reset_trigger != 'diff_content'
            then 0
            else 1
          end,
          updated_at desc
        limit 1
      `
    )
    .get() as ProjectSettingsRow | undefined;

  if (!row) {
    return defaultAppSettings();
  }

  const editorLaunchConfig = parseOptionalEditorLaunchConfig(
    row.editor_launch_config_json
  );

  return {
    autoCollapseHunksOver: clampAutoCollapseHunks(row.auto_collapse_hunks_over),
    defaultDiffMode: diffModeFromValue(row.default_diff_mode),
    ...(editorLaunchConfig ? { editorLaunchConfig } : {}),
    hideWhitespaceOnlyChanges: row.hide_whitespace_only_changes === 1,
    notifyOnDrift: row.notify_on_drift === 1,
    reviewResetTrigger: reviewResetTriggerFromValue(row.review_reset_trigger),
    showGeneratedFiles: row.show_generated_files === 1,
    themeMode: "system"
  };
}

function defaultAppSettings(): AppSettingsRecord {
  return {
    autoCollapseHunksOver: 120,
    defaultDiffMode: "split",
    hideWhitespaceOnlyChanges: false,
    notifyOnDrift: true,
    reviewResetTrigger: "diff_content",
    showGeneratedFiles: false,
    themeMode: "system"
  };
}

function reviewMarkFromRow(row: ReviewMarkRow): ReviewMarkRecord {
  return {
    path: row.path,
    ...(row.previous_path ? { previousPath: row.previous_path } : {}),
    reviewedDiffHash: row.reviewed_diff_hash,
    reviewTargetId: row.review_target_id
  };
}

function parseEditorLaunchConfig(value: string): EditorLaunchConfig {
  let parsedValue: unknown;

  try {
    parsedValue = JSON.parse(value) as unknown;
  } catch {
    throw new Error("Stored editor launch config is invalid.");
  }

  if (!isEditorLaunchConfig(parsedValue)) {
    throw new Error("Stored editor launch config is invalid.");
  }

  return parsedValue;
}

function parseOptionalEditorLaunchConfig(
  value: string | undefined | null
): EditorLaunchConfig | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return parseEditorLaunchConfig(value);
  } catch {
    return undefined;
  }
}

function isEditorLaunchConfig(value: unknown): value is EditorLaunchConfig {
  return (
    typeof value === "object" &&
    value !== null &&
    "command" in value &&
    "args" in value &&
    typeof value.command === "string" &&
    Array.isArray(value.args) &&
    value.args.every((arg) => typeof arg === "string")
  );
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "dark" || value === "light" || value === "system";
}
