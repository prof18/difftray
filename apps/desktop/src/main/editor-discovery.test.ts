import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

import type { EditorPreset } from "@difftray/core";
import { afterEach, describe, expect, it } from "vitest";

import {
  appPathForPreset,
  decodeXmlText,
  discoverMacOSApplicationPathsByName,
  macOSApplicationCandidates,
  macOSBundleIconFile,
  macOSBundleIconPath
} from "./editor-discovery.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true }))
  );
});

describe("discoverMacOSApplicationPathsByName", () => {
  it("returns no applications on non-macOS platforms", () => {
    const appPathsByName = discoverMacOSApplicationPathsByName({
      applicationDirectories: ["/Applications"],
      homePath: "/Users/example",
      platform: "linux"
    });

    expect([...appPathsByName.entries()]).toEqual([]);
  });

  it("finds .app directories and keeps the first path for duplicate app names", async () => {
    const firstDirectory = await makeTemporaryDirectory();
    const secondDirectory = await makeTemporaryDirectory();
    const firstCursorPath = path.join(firstDirectory, "Cursor.app");

    await mkdir(firstCursorPath);
    await mkdir(path.join(firstDirectory, "Notes.txt"));
    await writeFile(path.join(firstDirectory, "PlainFile.app"), "");
    await mkdir(path.join(secondDirectory, "Cursor.app"));
    await mkdir(path.join(secondDirectory, "Zed.app"));

    const appPathsByName = discoverMacOSApplicationPathsByName({
      applicationDirectories: [firstDirectory, secondDirectory],
      homePath: "/Users/example",
      platform: "darwin"
    });

    expect([...appPathsByName.entries()]).toEqual([
      ["Cursor.app", firstCursorPath],
      ["Zed.app", path.join(secondDirectory, "Zed.app")]
    ]);
  });
});

describe("macOSApplicationCandidates", () => {
  it("returns no candidates when the application directory is unavailable", () => {
    expect(macOSApplicationCandidates("/missing/applications")).toEqual([]);
  });
});

describe("appPathForPreset", () => {
  it("returns the first installed app path accepted by the preset", () => {
    const preset: EditorPreset = {
      id: "editor",
      launchConfig: {
        args: ["-a", "Editor", "{path}"],
        command: "open"
      },
      macOS: {
        appNames: ["Missing.app", "Editor.app"]
      },
      name: "Editor"
    };

    expect(
      appPathForPreset(
        preset,
        new Map([
          ["Editor.app", "/Applications/Editor.app"],
          ["Other.app", "/Applications/Other.app"]
        ])
      )
    ).toBe("/Applications/Editor.app");
  });
});

describe("macOS bundle icons", () => {
  it("reads and decodes the bundle icon file from Info.plist", async () => {
    const appPath = await makeAppBundle({
      iconFile: "Difftray &amp; Review"
    });

    expect(macOSBundleIconFile(appPath)).toBe("Difftray & Review");
  });

  it("resolves existing icon paths and appends the icns extension when needed", async () => {
    const appPath = await makeAppBundle({
      iconFile: "DifftrayIcon",
      resourceFiles: ["DifftrayIcon.icns"]
    });

    expect(macOSBundleIconPath(appPath)).toBe(
      path.join(appPath, "Contents", "Resources", "DifftrayIcon.icns")
    );
  });

  it("returns no icon path when the declared resource is absent", async () => {
    const appPath = await makeAppBundle({
      iconFile: "MissingIcon.icns"
    });

    expect(macOSBundleIconPath(appPath)).toBeUndefined();
  });
});

describe("decodeXmlText", () => {
  it("decodes XML text entities used in plist string values", () => {
    expect(decodeXmlText("&lt;Icon &amp; Name&quot;&apos;&gt;")).toBe(`<Icon & Name"'>`);
  });
});

async function makeTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "difftray-editor-discovery-"));

  temporaryDirectories.push(directory);

  return directory;
}

async function makeAppBundle(input: {
  readonly iconFile: string;
  readonly resourceFiles?: readonly string[];
}): Promise<string> {
  const root = await makeTemporaryDirectory();
  const appPath = path.join(root, "Difftray.app");
  const contentsPath = path.join(appPath, "Contents");
  const resourcesPath = path.join(contentsPath, "Resources");

  await mkdir(resourcesPath, { recursive: true });
  await writeFile(
    path.join(contentsPath, "Info.plist"),
    [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      "<plist>",
      "<dict>",
      "<key>CFBundleIconFile</key>",
      `<string>${input.iconFile}</string>`,
      "</dict>",
      "</plist>"
    ].join("\n")
  );

  for (const resourceFile of input.resourceFiles ?? []) {
    await writeFile(path.join(resourcesPath, resourceFile), "");
  }

  return appPath;
}
