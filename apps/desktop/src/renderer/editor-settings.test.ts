import { describe, expect, it } from "vitest";

import {
  editorChoices,
  editorOptionMatchesSettings,
  editorPatchForSelection,
  editorSelectionValue
} from "./editor-settings.js";

describe("editorChoices", () => {
  it("builds the system choice followed by installed editor presets", () => {
    expect(
      editorChoices([
        editorOption({
          iconDataUrl: "data:image/png;base64,abc",
          id: "vscode",
          name: "VS Code"
        })
      ])
    ).toEqual([
      { label: "System default", value: "system" },
      {
        iconDataUrl: "data:image/png;base64,abc",
        label: "VS Code",
        value: "preset:vscode"
      }
    ]);
  });
});

describe("editorSelectionValue", () => {
  it("selects system when settings use the system editor", () => {
    expect(editorSelectionValue(appSettings({ editorMode: "system" }), [])).toBe(
      "system"
    );
  });

  it("selects the matching preset by trimmed command and exact argument list", () => {
    expect(
      editorSelectionValue(
        appSettings({
          editorArgList: ["-b", "com.microsoft.VSCode", "{path}"],
          editorCommand: " open ",
          editorMode: "preset"
        }),
        [
          editorOption({
            args: ["-b", "com.microsoft.VSCode", "{path}"],
            command: "open",
            id: "vscode"
          })
        ]
      )
    ).toBe("preset:vscode");
  });

  it("falls back to system when preset settings no longer match an installed preset", () => {
    expect(
      editorSelectionValue(
        appSettings({
          editorArgList: ["-a", "Missing", "{path}"],
          editorCommand: "open",
          editorMode: "preset"
        }),
        [editorOption({ id: "vscode" })]
      )
    ).toBe("system");
  });
});

describe("editorPatchForSelection", () => {
  it("creates a system editor patch for system or unknown preset selections", () => {
    expect(editorPatchForSelection("system", [])).toEqual({
      editorArgList: [],
      editorArgs: "",
      editorCommand: "",
      editorMode: "system"
    });
    expect(
      editorPatchForSelection("preset:missing", [editorOption({ id: "vscode" })])
    ).toEqual({
      editorArgList: [],
      editorArgs: "",
      editorCommand: "",
      editorMode: "system"
    });
  });

  it("creates a preset patch from the selected editor option", () => {
    expect(
      editorPatchForSelection("preset:vscode", [
        editorOption({
          args: ["-b", "com.microsoft.VSCode", "{path}"],
          command: "open",
          id: "vscode"
        })
      ])
    ).toEqual({
      editorArgList: ["-b", "com.microsoft.VSCode", "{path}"],
      editorArgs: "-b com.microsoft.VSCode {path}",
      editorCommand: "open",
      editorMode: "preset"
    });
  });
});

describe("editorOptionMatchesSettings", () => {
  it("requires exact argument order and length", () => {
    const option = editorOption({
      args: ["-b", "com.microsoft.VSCode", "{path}"],
      command: "open"
    });

    expect(
      editorOptionMatchesSettings(
        option,
        appSettings({
          editorArgList: ["-b", "com.microsoft.VSCode", "{path}"],
          editorCommand: "open"
        })
      )
    ).toBe(true);
    expect(
      editorOptionMatchesSettings(
        option,
        appSettings({
          editorArgList: ["com.microsoft.VSCode", "-b", "{path}"],
          editorCommand: "open"
        })
      )
    ).toBe(false);
    expect(
      editorOptionMatchesSettings(
        option,
        appSettings({
          editorArgList: ["-b", "com.microsoft.VSCode"],
          editorCommand: "open"
        })
      )
    ).toBe(false);
  });
});

function appSettings(input: Partial<AppSettingsView>): AppSettingsView {
  return {
    autoCollapseHunksOver: 80,
    defaultDiffMode: "split",
    editorArgList: [],
    editorArgs: "",
    editorCommand: "",
    editorMode: "system",
    hideWhitespaceOnlyChanges: true,
    notifyOnDrift: true,
    reviewResetTrigger: "diff_content",
    showGeneratedFiles: false,
    themeMode: "system",
    wrapDiffLines: true,
    ...input
  };
}

function editorOption(input: Partial<EditorPresetView>): EditorPresetView {
  return {
    args: ["-a", "Editor", "{path}"],
    command: "open",
    id: "editor",
    name: "Editor",
    ...input
  };
}
