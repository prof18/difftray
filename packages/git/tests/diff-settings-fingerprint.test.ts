import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadDiffSettingsFingerprint } from "../src/index.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function repository(): string {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "difftray-diff-settings-")));
  roots.push(root);
  execFileSync("git", ["-C", root, "init", "-q", "-b", "main"]);
  return root;
}

describe("diff settings fingerprint", () => {
  it("is stable until attributes or diff config change", async () => {
    const root = repository();
    const initial = await loadDiffSettingsFingerprint(root);
    expect(await loadDiffSettingsFingerprint(root)).toBe(initial);
    writeFileSync(path.join(root, "unrelated.txt"), "content\n");
    expect(await loadDiffSettingsFingerprint(root)).toBe(initial);

    mkdirSync(path.join(root, "nested"));
    writeFileSync(path.join(root, "nested/.gitattributes"), "*.bin binary\n");
    const nested = await loadDiffSettingsFingerprint(root);
    expect(nested).not.toBe(initial);

    writeFileSync(path.join(root, ".git/info/attributes"), "*.txt -diff\n");
    const info = await loadDiffSettingsFingerprint(root);
    expect(info).not.toBe(nested);

    execFileSync("git", ["-C", root, "config", "diff.renames", "false"]);
    expect(await loadDiffSettingsFingerprint(root)).not.toBe(info);
  });
});
