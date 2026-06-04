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
  readonly wrapDiffLines: boolean;
};

export function clampFileListWidth(value: number): number {
  return Math.min(540, Math.max(220, Math.round(value)));
}

export function clampAutoCollapseHunks(value: number): number {
  return Math.min(999, Math.max(20, Math.round(value)));
}

export function reviewResetTriggerFromValue(value: string): ReviewResetTrigger {
  return value === "line_count" || value === "commit_sha" ? value : "diff_content";
}

export function diffModeFromValue(value: string): DiffMode {
  return value === "unified" ? "unified" : "split";
}

export function appBooleanSetting(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  return value === "1";
}

export function appNumberSetting(
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

export function defaultAppSettings(): AppSettingsRecord {
  return {
    autoCollapseHunksOver: 120,
    defaultDiffMode: "split",
    hideWhitespaceOnlyChanges: false,
    notifyOnDrift: true,
    reviewResetTrigger: "diff_content",
    showGeneratedFiles: false,
    themeMode: "system",
    wrapDiffLines: true
  };
}

export function parseEditorLaunchConfig(value: string): EditorLaunchConfig {
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

export function parseOptionalEditorLaunchConfig(
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

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "dark" || value === "light" || value === "system";
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
