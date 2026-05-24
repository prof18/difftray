import { describe, expect, it } from "vitest";

import {
  findEditorPresetByLaunchConfig,
  listInstalledEditorPresets
} from "../src/editor-presets.js";

describe("editor presets", () => {
  it("lists only installed common macOS editors in product order", () => {
    const presets = listInstalledEditorPresets({
      installedMacOSAppNames: [
        "Cursor.app",
        "TextEdit.app",
        "Visual Studio Code.app",
        "Zed.app"
      ],
      platform: "darwin"
    });

    expect(presets.map((preset) => preset.id)).toEqual([
      "visual-studio-code",
      "cursor",
      "zed"
    ]);
  });

  it("does not list app presets on unsupported platforms", () => {
    const presets = listInstalledEditorPresets({
      installedMacOSAppNames: ["Visual Studio Code.app"],
      platform: "linux"
    });

    expect(presets).toEqual([]);
  });

  it("keeps preset launch configs structured and tokenized", () => {
    const presets = listInstalledEditorPresets({
      installedMacOSAppNames: ["Sublime Text.app"],
      platform: "darwin"
    });

    expect(presets).toEqual([
      expect.objectContaining({
        launchConfig: {
          args: ["-b", "com.sublimetext.4", "{path}"],
          command: "open"
        },
        name: "Sublime Text"
      })
    ]);
  });

  it("matches stored launch configs back to friendly presets", () => {
    const preset = findEditorPresetByLaunchConfig({
      args: ["-b", "com.microsoft.VSCode", "{path}"],
      command: "open"
    });

    expect(preset?.id).toBe("visual-studio-code");
  });
});
