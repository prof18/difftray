import type { EditorLaunchConfig } from "@difftray/storage";

import { trustedEditorLaunchConfig } from "./security.js";

export type EditorArgExpansionInput = {
  readonly column: number;
  readonly filePath: string;
  readonly line: number;
  readonly projectPath: string;
};

export function editorConfigFromInput(
  command: string | undefined,
  args: readonly string[] | string | undefined
): EditorLaunchConfig {
  const trimmedCommand = command?.trim();

  if (!trimmedCommand) {
    throw new Error("Editor preset command is required.");
  }

  const normalizedArgs =
    typeof args === "string" || args === undefined
      ? splitEditorArgs(args ?? "")
      : normalizeEditorArgs(args);

  const launchConfig = {
    args: normalizedArgs,
    command: trimmedCommand
  };
  const trustedConfig = trustedEditorLaunchConfig(launchConfig);

  if (!trustedConfig) {
    throw new Error("Only built-in editor presets are supported.");
  }

  return trustedConfig;
}

export function expandEditorArg(arg: string, input: EditorArgExpansionInput): string {
  return arg
    .replaceAll("{path}", input.filePath)
    .replaceAll("{line}", String(input.line))
    .replaceAll("{column}", String(input.column))
    .replaceAll("{project}", input.projectPath);
}

function splitEditorArgs(value: string): readonly string[] {
  return normalizeEditorArgs(
    value
      .trim()
      .split(/\s+/)
      .filter((arg) => arg.length > 0)
  );
}

function normalizeEditorArgs(args: readonly string[]): readonly string[] {
  return args.map((arg) => arg.trim()).filter((arg) => arg.length > 0);
}
