export type EditorChoice = {
  readonly iconDataUrl?: string;
  readonly label: string;
  readonly value: string;
};

export function editorChoices(
  editorOptions: readonly EditorPresetView[]
): readonly EditorChoice[] {
  return [
    { label: "System default", value: "system" },
    ...editorOptions.map((option) => ({
      ...(option.iconDataUrl ? { iconDataUrl: option.iconDataUrl } : {}),
      label: option.name,
      value: `preset:${option.id}`
    }))
  ];
}

export function editorSelectionValue(
  appSettings: AppSettingsView,
  editorOptions: readonly EditorPresetView[]
): string {
  if (appSettings.editorMode === "system") {
    return "system";
  }

  const matchingOption = editorOptions.find((option) =>
    editorOptionMatchesSettings(option, appSettings)
  );

  return matchingOption ? `preset:${matchingOption.id}` : "system";
}

export function editorPatchForSelection(
  value: string,
  editorOptions: readonly EditorPresetView[]
): Partial<AppSettingsView> {
  if (value === "system") {
    return systemEditorPatch();
  }

  const presetId = value.replace(/^preset:/, "");
  const option = editorOptions.find((candidate) => candidate.id === presetId);

  if (!option) {
    return systemEditorPatch();
  }

  return {
    editorArgList: option.args,
    editorArgs: option.args.join(" "),
    editorCommand: option.command,
    editorMode: "preset"
  };
}

export function editorOptionMatchesSettings(
  option: EditorPresetView,
  appSettings: AppSettingsView
): boolean {
  return (
    option.command === appSettings.editorCommand.trim() &&
    arraysAreEqual(option.args, appSettings.editorArgList)
  );
}

export function editorSettingsError(appSettings: AppSettingsView): string | undefined {
  return appSettings.editorMode === "preset" &&
    appSettings.editorCommand.trim().length === 0
    ? "Editor preset is required."
    : undefined;
}

export function updateAppSettingsInput(
  appSettings: AppSettingsView
): UpdateAppSettingsInput {
  return {
    autoCollapseHunksOver: appSettings.autoCollapseHunksOver,
    defaultDiffMode: appSettings.defaultDiffMode,
    editorArgList: appSettings.editorArgList,
    editorArgs: appSettings.editorArgs,
    editorCommand: appSettings.editorCommand,
    editorMode: appSettings.editorMode,
    hideWhitespaceOnlyChanges: appSettings.hideWhitespaceOnlyChanges,
    notifyOnDrift: appSettings.notifyOnDrift,
    reviewResetTrigger: appSettings.reviewResetTrigger,
    showGeneratedFiles: appSettings.showGeneratedFiles,
    themeMode: appSettings.themeMode,
    wrapDiffLines: appSettings.wrapDiffLines
  };
}

function systemEditorPatch(): Partial<AppSettingsView> {
  return {
    editorArgList: [],
    editorArgs: "",
    editorCommand: "",
    editorMode: "system"
  };
}

function arraysAreEqual(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length && left.every((value, index) => value === right[index])
  );
}
