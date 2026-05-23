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

export type ProjectSettingsRecord = {
  readonly editorLaunchConfig?: EditorLaunchConfig;
  readonly projectId: string;
  readonly showGeneratedFiles: boolean;
};

export type ReviewMarkInput = {
  readonly path: string;
  readonly previousPath?: string;
  readonly projectId: string;
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

export type DifftrayStorage = {
  readonly close: () => void;
  readonly getProject: (id: string) => StoredProjectRecord | null;
  readonly getProjectByPath: (path: string) => StoredProjectRecord | null;
  readonly getProjectSettings: (projectId: string) => ProjectSettingsRecord;
  readonly getReviewTarget: (id: string) => StoredReviewTargetRecord | null;
  readonly isReviewed: (
    reviewTargetId: string,
    path: string,
    currentDiffHash: string
  ) => boolean;
  readonly markReviewed: (input: ReviewMarkInput) => void;
  readonly upsertProject: (project: ProjectRecord) => void;
  readonly upsertProjectSettings: (settings: ProjectSettingsRecord) => void;
  readonly upsertReviewTarget: (target: ReviewTargetRecord) => void;
  readonly verifyAndMarkReviewed: (
    input: VerifyAndMarkReviewedInput
  ) => VerifyAndMarkReviewedResult;
};

export function openStorage(filename: string): DifftrayStorage {
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA foreign_keys = ON");
  runMigrations(db);

  return {
    close: () => {
      db.close();
    },
    getProject: (id) => getProject(db, "id", id),
    getProjectByPath: (projectPath) => getProject(db, "path", projectPath),
    getProjectSettings: (projectId) => getProjectSettings(db, projectId),
    getReviewTarget: (id) => getReviewTarget(db, id),
    isReviewed: (reviewTargetId, filePath, currentDiffHash) =>
      isReviewed(db, reviewTargetId, filePath, currentDiffHash),
    markReviewed: (input) => {
      markReviewed(db, input);
    },
    upsertProject: (project) => {
      upsertProject(db, project);
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
      updated_at text not null
    );

    create table if not exists app_settings (
      key text primary key,
      value text not null,
      updated_at text not null
    );
  `);
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
      default_base_ref = excluded.default_base_ref,
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
      show_generated_files,
      editor_launch_config_json,
      updated_at
    ) values (?, ?, ?, ?)
    on conflict(project_id) do update set
      show_generated_files = excluded.show_generated_files,
      editor_launch_config_json = excluded.editor_launch_config_json,
      updated_at = excluded.updated_at
  `
  ).run(
    settings.projectId,
    settings.showGeneratedFiles ? 1 : 0,
    settings.editorLaunchConfig ? JSON.stringify(settings.editorLaunchConfig) : null,
    currentTimestamp()
  );
}

function getProjectSettings(db: DatabaseSync, projectId: string): ProjectSettingsRecord {
  const row = db
    .prepare("select * from project_settings where project_id = ?")
    .get(projectId);

  if (!row) {
    return {
      projectId,
      showGeneratedFiles: false
    };
  }

  return projectSettingsFromRow(row as ProjectSettingsRow);
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
  readonly editor_launch_config_json: null | string;
  readonly project_id: string;
  readonly show_generated_files: 0 | 1;
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
  const editorLaunchConfig = row.editor_launch_config_json
    ? parseEditorLaunchConfig(row.editor_launch_config_json)
    : undefined;

  return {
    ...(editorLaunchConfig ? { editorLaunchConfig } : {}),
    projectId: row.project_id,
    showGeneratedFiles: row.show_generated_files === 1
  };
}

function parseEditorLaunchConfig(value: string): EditorLaunchConfig {
  const parsedValue = JSON.parse(value) as unknown;

  if (!isEditorLaunchConfig(parsedValue)) {
    throw new Error("Stored editor launch config is invalid.");
  }

  return parsedValue;
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
