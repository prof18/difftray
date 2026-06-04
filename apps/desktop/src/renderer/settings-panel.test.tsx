import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { SettingsPanel } from "./settings-panel.js";

describe("SettingsPanel", () => {
  it("renders app settings sections, active values, and actions", () => {
    const html = renderToStaticMarkup(
      <SettingsPanel
        appSettings={appSettings({
          defaultDiffMode: "unified",
          editorArgList: ["-b", "com.microsoft.VSCode", "{path}"],
          editorArgs: "-b com.microsoft.VSCode {path}",
          editorCommand: "open",
          editorMode: "preset",
          notifyOnDrift: false,
          showGeneratedFiles: true,
          themeMode: "dark",
          wrapDiffLines: false
        })}
        disabled={false}
        editorOptions={[
          editorOption({
            args: ["-b", "com.microsoft.VSCode", "{path}"],
            command: "open",
            id: "vscode",
            name: "VS Code"
          })
        ]}
        onCancel={vi.fn()}
        onChangeAppSettings={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain("Settings");
    expect(html).toContain("General");
    expect(html).toContain("Editor");
    expect(html).toContain("Review");
    expect(html).toContain('value="dark" selected=""');
    expect(html).toContain('aria-label="Editor: VS Code"');
    expect(html).toContain("Default diff view");
    expect(html).toContain("Unified");
    expect(html).toContain('data-active="true"');
    expect(html).toContain("Wrap long lines");
    expect(html).toContain("Show generated files");
    expect(html).toContain("Notify when reviewed file drifts");
    expect(html).toContain("Cancel");
    expect(html).toContain("Save");
    expect(html).toContain('aria-label="Close settings"');
  });

  it("disables controls while settings are saving", () => {
    const html = renderToStaticMarkup(
      <SettingsPanel
        appSettings={appSettings({})}
        disabled={true}
        editorOptions={[]}
        onCancel={vi.fn()}
        onChangeAppSettings={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(html).toContain('aria-label="Editor: System default"');
    expect(html).toContain('disabled=""');
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
