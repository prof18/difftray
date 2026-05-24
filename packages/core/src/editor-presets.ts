export type EditorLaunchConfigPreset = {
  readonly args: readonly string[];
  readonly command: string;
};

export type EditorPreset = {
  readonly id: string;
  readonly launchConfig: EditorLaunchConfigPreset;
  readonly macOS: {
    readonly appNames: readonly string[];
  };
  readonly name: string;
};

export type InstalledEditorPresetInput = {
  readonly installedMacOSAppNames: readonly string[];
  readonly platform: NodeJS.Platform;
};

export const commonEditorPresets = [
  {
    id: "visual-studio-code-insiders",
    launchConfig: {
      args: ["-b", "com.microsoft.VSCodeInsiders", "{path}"],
      command: "open"
    },
    macOS: {
      appNames: ["Visual Studio Code - Insiders.app"]
    },
    name: "VS Code Insiders"
  },
  {
    id: "visual-studio-code",
    launchConfig: {
      args: ["-b", "com.microsoft.VSCode", "{path}"],
      command: "open"
    },
    macOS: {
      appNames: ["Visual Studio Code.app"]
    },
    name: "VS Code"
  },
  {
    id: "cursor",
    launchConfig: {
      args: ["-a", "Cursor", "{path}"],
      command: "open"
    },
    macOS: {
      appNames: ["Cursor.app"]
    },
    name: "Cursor"
  },
  {
    id: "windsurf",
    launchConfig: {
      args: ["-a", "Windsurf", "{path}"],
      command: "open"
    },
    macOS: {
      appNames: ["Windsurf.app"]
    },
    name: "Windsurf"
  },
  {
    id: "zed",
    launchConfig: {
      args: ["-a", "Zed", "{path}"],
      command: "open"
    },
    macOS: {
      appNames: ["Zed.app"]
    },
    name: "Zed"
  },
  {
    id: "sublime-text",
    launchConfig: {
      args: ["-b", "com.sublimetext.4", "{path}"],
      command: "open"
    },
    macOS: {
      appNames: ["Sublime Text.app"]
    },
    name: "Sublime Text"
  },
  {
    id: "xcode",
    launchConfig: {
      args: ["-b", "com.apple.dt.Xcode", "{path}"],
      command: "open"
    },
    macOS: {
      appNames: ["Xcode.app"]
    },
    name: "Xcode"
  },
  {
    id: "android-studio",
    launchConfig: {
      args: ["-b", "com.google.android.studio", "{path}"],
      command: "open"
    },
    macOS: {
      appNames: ["Android Studio.app"]
    },
    name: "Android Studio"
  },
  {
    id: "intellij-idea",
    launchConfig: {
      args: ["-b", "com.jetbrains.intellij", "{path}"],
      command: "open"
    },
    macOS: {
      appNames: ["IntelliJ IDEA.app"]
    },
    name: "IntelliJ IDEA"
  },
  {
    id: "webstorm",
    launchConfig: {
      args: ["-a", "WebStorm", "{path}"],
      command: "open"
    },
    macOS: {
      appNames: ["WebStorm.app"]
    },
    name: "WebStorm"
  },
  {
    id: "pycharm",
    launchConfig: {
      args: ["-a", "PyCharm", "{path}"],
      command: "open"
    },
    macOS: {
      appNames: ["PyCharm.app"]
    },
    name: "PyCharm"
  },
  {
    id: "phpstorm",
    launchConfig: {
      args: ["-a", "PhpStorm", "{path}"],
      command: "open"
    },
    macOS: {
      appNames: ["PhpStorm.app"]
    },
    name: "PhpStorm"
  },
  {
    id: "goland",
    launchConfig: {
      args: ["-a", "GoLand", "{path}"],
      command: "open"
    },
    macOS: {
      appNames: ["GoLand.app"]
    },
    name: "GoLand"
  },
  {
    id: "clion",
    launchConfig: {
      args: ["-a", "CLion", "{path}"],
      command: "open"
    },
    macOS: {
      appNames: ["CLion.app"]
    },
    name: "CLion"
  },
  {
    id: "rider",
    launchConfig: {
      args: ["-a", "Rider", "{path}"],
      command: "open"
    },
    macOS: {
      appNames: ["Rider.app"]
    },
    name: "Rider"
  },
  {
    id: "nova",
    launchConfig: {
      args: ["-a", "Nova", "{path}"],
      command: "open"
    },
    macOS: {
      appNames: ["Nova.app"]
    },
    name: "Nova"
  },
  {
    id: "bbedit",
    launchConfig: {
      args: ["-b", "com.barebones.bbedit", "{path}"],
      command: "open"
    },
    macOS: {
      appNames: ["BBEdit.app"]
    },
    name: "BBEdit"
  },
  {
    id: "textmate",
    launchConfig: {
      args: ["-b", "com.macromates.TextMate", "{path}"],
      command: "open"
    },
    macOS: {
      appNames: ["TextMate.app"]
    },
    name: "TextMate"
  }
] as const satisfies readonly EditorPreset[];

export function listInstalledEditorPresets(
  input: InstalledEditorPresetInput
): readonly EditorPreset[] {
  if (input.platform !== "darwin") {
    return [];
  }

  const installedAppNames = new Set(
    input.installedMacOSAppNames.map((appName) => normalizeMacOSAppName(appName))
  );

  return commonEditorPresets.filter((preset) =>
    preset.macOS.appNames.some((appName) =>
      installedAppNames.has(normalizeMacOSAppName(appName))
    )
  );
}

export function findEditorPresetByLaunchConfig(
  launchConfig: EditorLaunchConfigPreset
): EditorPreset | undefined {
  return commonEditorPresets.find(
    (preset) =>
      preset.launchConfig.command === launchConfig.command.trim() &&
      arraysAreEqual(preset.launchConfig.args, launchConfig.args)
  );
}

function arraysAreEqual(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length && left.every((value, index) => value === right[index])
  );
}

function normalizeMacOSAppName(appName: string): string {
  return appName.trim().toLocaleLowerCase("en-US");
}
