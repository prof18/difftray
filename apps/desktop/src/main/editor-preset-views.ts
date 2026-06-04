import { listInstalledEditorPresets } from "@difftray/core";

import { appPathForPreset } from "./editor-discovery.js";

export type EditorPresetView = {
  readonly args: readonly string[];
  readonly command: string;
  readonly iconDataUrl?: string;
  readonly id: string;
  readonly name: string;
};

export type InstalledEditorPresetViewsInput = {
  readonly appPathByName: ReadonlyMap<string, string>;
  readonly iconDataUrlForAppPath: (appPath: string) => Promise<string | undefined>;
  readonly platform: NodeJS.Platform;
};

export async function installedEditorPresetViews({
  appPathByName,
  iconDataUrlForAppPath,
  platform
}: InstalledEditorPresetViewsInput): Promise<readonly EditorPresetView[]> {
  const presets = listInstalledEditorPresets({
    installedMacOSAppNames: [...appPathByName.keys()],
    platform
  });

  return Promise.all(
    presets.map(async (preset) => {
      const appPath = appPathForPreset(preset, appPathByName);
      const iconDataUrl = appPath ? await iconDataUrlForAppPath(appPath) : undefined;

      return {
        args: preset.launchConfig.args,
        command: preset.launchConfig.command,
        ...(iconDataUrl ? { iconDataUrl } : {}),
        id: preset.id,
        name: preset.name
      };
    })
  );
}
