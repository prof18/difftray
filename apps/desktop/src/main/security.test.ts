import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  resolveRendererDevUrl,
  resolveSafeProjectFilePath,
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
