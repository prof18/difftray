import { describe, expect, it } from "vitest";

import { installedEditorPresetViews } from "./editor-preset-views.js";

describe("installedEditorPresetViews", () => {
  it("maps installed editor presets to renderer-safe views in product order", async () => {
    const loadedIconPaths: string[] = [];
    const views = await installedEditorPresetViews({
      appPathByName: new Map([
        ["Zed.app", "/Applications/Zed.app"],
        ["Visual Studio Code.app", "/Applications/Visual Studio Code.app"],
        ["TextEdit.app", "/Applications/TextEdit.app"]
      ]),
      iconDataUrlForAppPath: async (appPath) => {
        loadedIconPaths.push(appPath);

        return appPath.includes("Visual Studio Code")
          ? "data:image/png;base64,code"
          : undefined;
      },
      platform: "darwin"
    });

    expect(views).toEqual([
      {
        args: ["-b", "com.microsoft.VSCode", "{path}"],
        command: "open",
        iconDataUrl: "data:image/png;base64,code",
        id: "visual-studio-code",
        name: "VS Code"
      },
      {
        args: ["-a", "Zed", "{path}"],
        command: "open",
        id: "zed",
        name: "Zed"
      }
    ]);
    expect(loadedIconPaths).toEqual([
      "/Applications/Visual Studio Code.app",
      "/Applications/Zed.app"
    ]);
  });

  it("returns no app preset views on unsupported platforms", async () => {
    const views = await installedEditorPresetViews({
      appPathByName: new Map([
        ["Visual Studio Code.app", "/Applications/Visual Studio Code.app"]
      ]),
      iconDataUrlForAppPath: async () => {
        throw new Error("icons should not be loaded for unsupported platforms");
      },
      platform: "linux"
    });

    expect(views).toEqual([]);
  });
});
