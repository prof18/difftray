import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  externalStoreUrl,
  isTrustedRendererUrl,
  resolveRendererDevUrl,
  resolveSafeProjectFilePath,
  type TrustedRendererLocation,
  trustedEditorLaunchConfig
} from "./security.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (tempRoot) => {
      await rm(tempRoot, { force: true, recursive: true });
    })
  );
});

describe("renderer dev URL resolution", () => {
  it("allows loopback renderer URLs only while unpackaged", () => {
    expect(resolveRendererDevUrl("http://127.0.0.1:5173", false)).toBe(
      "http://127.0.0.1:5173/"
    );
    expect(resolveRendererDevUrl("http://localhost:5173", false)).toBe(
      "http://localhost:5173/"
    );
  });

  it("rejects renderer URLs in packaged builds", () => {
    expect(() => resolveRendererDevUrl("http://127.0.0.1:5173", true)).toThrow(
      /not allowed in packaged builds/
    );
  });

  it("rejects non-loopback renderer URLs", () => {
    expect(() => resolveRendererDevUrl("http://example.com", false)).toThrow(/loopback/);
  });
});

describe("trusted renderer URL validation", () => {
  it("allows only the configured dev renderer origin", () => {
    const location: TrustedRendererLocation = {
      kind: "dev",
      origin: "http://127.0.0.1:5173"
    };

    expect(isTrustedRendererUrl("http://127.0.0.1:5173/settings", location)).toBe(true);
    expect(isTrustedRendererUrl("http://127.0.0.1.attacker.test:5173", location)).toBe(
      false
    );
    expect(isTrustedRendererUrl("https://127.0.0.1:5173", location)).toBe(false);
  });

  it("allows only the packaged renderer file", () => {
    const rendererFilePath = path.resolve("/Applications/Difftray.app/index.html");
    const location: TrustedRendererLocation = {
      kind: "file",
      path: rendererFilePath
    };

    expect(isTrustedRendererUrl(`file://${rendererFilePath}`, location)).toBe(true);
    expect(isTrustedRendererUrl("file:///tmp/index.html", location)).toBe(false);
    expect(isTrustedRendererUrl("https://example.com", location)).toBe(false);
  });
});

describe("external store URL resolution", () => {
  it("maps only known store identifiers to the Difftray listings", () => {
    expect(externalStoreUrl("app-store")).toBe(
      "https://apps.apple.com/pl/app/difftray-code-review-diff/id6789255782"
    );
    expect(externalStoreUrl("google-play")).toBe(
      "https://play.google.com/store/apps/details?id=com.prof18.difftray.companion"
    );
    expect(externalStoreUrl("https://example.com")).toBeUndefined();
    expect(externalStoreUrl(undefined)).toBeUndefined();
  });
});

describe("trusted editor launch configs", () => {
  it("accepts built-in editor presets", () => {
    expect(
      trustedEditorLaunchConfig({
        args: ["-b", "com.microsoft.VSCode", "{path}"],
        command: "open"
      })
    ).toEqual({
      args: ["-b", "com.microsoft.VSCode", "{path}"],
      command: "open"
    });
  });

  it("rejects arbitrary shell-like editor configs", () => {
    expect(
      trustedEditorLaunchConfig({
        args: ["-c", "touch /tmp/difftray-owned"],
        command: "/bin/sh"
      })
    ).toBeUndefined();
  });
});

describe("safe project file paths", () => {
  it("rejects lexical escapes", async () => {
    const projectPath = await createTempRoot();

    await expect(
      resolveSafeProjectFilePath(projectPath, "../outside.txt")
    ).resolves.toBeUndefined();
  });

  it("rejects symlinks that resolve outside the project", async () => {
    const projectPath = await createTempRoot();
    const outsideRoot = await createTempRoot();
    const outsideFile = path.join(outsideRoot, "outside.txt");
    await writeFile(outsideFile, "outside\n");
    await symlink(outsideFile, path.join(projectPath, "outside-link"));

    await expect(
      resolveSafeProjectFilePath(projectPath, "outside-link")
    ).resolves.toBeUndefined();
  });

  it("allows real files inside the project", async () => {
    const projectPath = await createTempRoot();
    await writeFile(path.join(projectPath, "inside.txt"), "inside\n");

    await expect(resolveSafeProjectFilePath(projectPath, "inside.txt")).resolves.toBe(
      path.join(projectPath, "inside.txt")
    );
  });
});

async function createTempRoot(): Promise<string> {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "difftray-security-"));

  tempRoots.push(tempRoot);
  return tempRoot;
}
