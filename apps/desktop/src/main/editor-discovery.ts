import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import type { EditorPreset } from "@difftray/core";

export type MacOSApplicationCandidate = {
  readonly appName: string;
  readonly appPath: string;
};

export type MacOSApplicationDiscoveryInput = {
  readonly applicationDirectories?: readonly string[];
  readonly homePath: string;
  readonly platform: NodeJS.Platform;
};

export function discoverMacOSApplicationPathsByName({
  applicationDirectories,
  homePath,
  platform
}: MacOSApplicationDiscoveryInput): Map<string, string> {
  if (platform !== "darwin") {
    return new Map();
  }

  const directories = applicationDirectories ?? [
    "/Applications",
    "/System/Applications",
    path.join(homePath, "Applications")
  ];
  const appPathsByName = new Map<string, string>();

  for (const directory of directories) {
    for (const candidate of macOSApplicationCandidates(directory)) {
      if (!appPathsByName.has(candidate.appName)) {
        appPathsByName.set(candidate.appName, candidate.appPath);
      }
    }
  }

  return appPathsByName;
}

export function macOSApplicationCandidates(
  directory: string
): readonly MacOSApplicationCandidate[] {
  if (!existsSync(directory)) {
    return [];
  }

  try {
    return readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.endsWith(".app"))
      .map((entry) => ({
        appName: entry.name,
        appPath: path.join(directory, entry.name)
      }));
  } catch {
    return [];
  }
}

export function appPathForPreset(
  preset: EditorPreset,
  appPathByName: ReadonlyMap<string, string>
): string | undefined {
  for (const appName of preset.macOS.appNames) {
    const appPath = appPathByName.get(appName);

    if (appPath) {
      return appPath;
    }
  }

  return undefined;
}

export function macOSBundleIconPath(appPath: string): string | undefined {
  const iconFile = macOSBundleIconFile(appPath);

  if (!iconFile) {
    return undefined;
  }

  const normalizedIconFile = iconFile.endsWith(".icns") ? iconFile : `${iconFile}.icns`;
  const iconPath = path.join(appPath, "Contents", "Resources", normalizedIconFile);

  return existsSync(iconPath) ? iconPath : undefined;
}

export function macOSBundleIconFile(appPath: string): string | undefined {
  try {
    const infoPlist = readFileSync(path.join(appPath, "Contents", "Info.plist"), "utf8");
    const match =
      /<key>CFBundleIconFile<\/key>\s*<string>(?<iconFile>[^<]+)<\/string>/u.exec(
        infoPlist
      );

    return match?.groups?.iconFile ? decodeXmlText(match.groups.iconFile) : undefined;
  } catch {
    return undefined;
  }
}

export function decodeXmlText(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}
