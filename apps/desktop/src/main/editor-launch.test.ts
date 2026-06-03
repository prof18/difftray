import { describe, expect, it } from "vitest";

import { editorConfigFromInput, expandEditorArg } from "./editor-launch.js";

describe("editorConfigFromInput", () => {
  it("normalizes trusted editor presets from argument strings", () => {
    expect(
      editorConfigFromInput(" open ", " -b   com.microsoft.VSCode   {path} ")
    ).toEqual({
      args: ["-b", "com.microsoft.VSCode", "{path}"],
      command: "open"
    });
  });

  it("normalizes trusted editor presets from argument arrays", () => {
    expect(
      editorConfigFromInput("open", [" -b ", " com.jetbrains.intellij ", "", "{path}"])
    ).toEqual({
      args: ["-b", "com.jetbrains.intellij", "{path}"],
      command: "open"
    });
  });

  it("rejects missing commands and non-preset launch configs", () => {
    expect(() => editorConfigFromInput(" ", ["-b", "com.microsoft.VSCode"])).toThrow(
      "Editor preset command is required."
    );
    expect(() => editorConfigFromInput("/bin/sh", ["-c", "touch /tmp/nope"])).toThrow(
      "Only built-in editor presets are supported."
    );
  });
});

describe("expandEditorArg", () => {
  it("expands editor placeholders without invoking a shell", () => {
    expect(
      expandEditorArg("{project}:{path}:{line}:{column}", {
        column: 5,
        filePath: "/repo/difftray/src/App.tsx",
        line: 12,
        projectPath: "/repo/difftray"
      })
    ).toBe("/repo/difftray:/repo/difftray/src/App.tsx:12:5");
  });
});
