import type { DatabaseSync } from "node:sqlite";

import { projectSettingsFromRow, type ProjectSettingsRow } from "./rows.js";
import {
  appBooleanSetting,
  appNumberSetting,
  clampAutoCollapseHunks,
  clampCompanionPort,
  clampFileListWidth,
  defaultAppSettings,
  diffModeFromValue,
  isThemeMode,
  parseOptionalEditorLaunchConfig,
  reviewResetTriggerFromValue,
  type AppSettingsRecord,
  type ProjectSettingsRecord
} from "./settings.js";
import { currentTimestamp } from "./timestamps.js";

export type CompanionServerKeyPairRecord = {
  readonly publicKey: string;
  readonly secretKey: string;
};

type AppSettingsRow = {
  readonly value: string;
};

export function upsertProjectSettings(
  db: DatabaseSync,
  settings: ProjectSettingsRecord
): void {
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

export function getProjectSettings(
  db: DatabaseSync,
  projectId: string
): ProjectSettingsRecord {
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

export function upsertAppSettings(db: DatabaseSync, settings: AppSettingsRecord): void {
  upsertAppSetting(
    db,
    "auto_collapse_hunks_over",
    String(clampAutoCollapseHunks(settings.autoCollapseHunksOver))
  );
  upsertAppSetting(db, "companion_enabled", settings.companionEnabled ? "1" : "0");
  upsertAppSetting(
    db,
    "companion_port",
    String(clampCompanionPort(settings.companionPort))
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
  upsertAppSetting(db, "wrap_diff_lines", settings.wrapDiffLines ? "1" : "0");
}

export function getAppSettings(db: DatabaseSync): AppSettingsRecord {
  const legacySettings = latestLegacyProjectAppSettings(db);
  const autoCollapseHunksOver = getAppSetting(db, "auto_collapse_hunks_over");
  const companionEnabled = getAppSetting(db, "companion_enabled");
  const companionPort = getAppSetting(db, "companion_port");
  const defaultDiffMode = getAppSetting(db, "default_diff_mode");
  const editorLaunchConfigJson = getAppSetting(db, "editor_launch_config_json");
  const hideWhitespaceOnlyChanges = getAppSetting(db, "hide_whitespace_only_changes");
  const notifyOnDrift = getAppSetting(db, "notify_on_drift");
  const reviewResetTrigger = getAppSetting(db, "review_reset_trigger");
  const showGeneratedFiles = getAppSetting(db, "show_generated_files");
  const themeMode = getAppSetting(db, "theme_mode");
  const wrapDiffLines = getAppSetting(db, "wrap_diff_lines");
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
    companionEnabled: appBooleanSetting(companionEnabled, false),
    companionPort: appNumberSetting(companionPort, 48620, clampCompanionPort),
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
    themeMode: isThemeMode(themeMode) ? themeMode : "system",
    wrapDiffLines: appBooleanSetting(wrapDiffLines, legacySettings.wrapDiffLines)
  };
}

export function getCompanionServerKeyPair(
  db: DatabaseSync
): CompanionServerKeyPairRecord | null {
  const publicKey = getAppSetting(db, "companion_server_pk");
  const secretKey = getAppSetting(db, "companion_server_sk");

  return publicKey && secretKey ? { publicKey, secretKey } : null;
}

export function upsertCompanionServerKeyPair(
  db: DatabaseSync,
  keyPair: CompanionServerKeyPairRecord
): void {
  upsertAppSetting(db, "companion_server_pk", keyPair.publicKey);
  upsertAppSetting(db, "companion_server_sk", keyPair.secretKey);
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
    companionEnabled: false,
    companionPort: 48620,
    defaultDiffMode: diffModeFromValue(row.default_diff_mode),
    ...(editorLaunchConfig ? { editorLaunchConfig } : {}),
    hideWhitespaceOnlyChanges: row.hide_whitespace_only_changes === 1,
    notifyOnDrift: row.notify_on_drift === 1,
    reviewResetTrigger: reviewResetTriggerFromValue(row.review_reset_trigger),
    showGeneratedFiles: row.show_generated_files === 1,
    themeMode: "system",
    wrapDiffLines: true
  };
}
