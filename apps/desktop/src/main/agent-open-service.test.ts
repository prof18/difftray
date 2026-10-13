import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prepareAgentOpen } from "./agent-open-service.js";
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function git(root: string, ...args: string[]) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}
function fixture() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "agent-open-")));
  roots.push(root);
  git(root, "init", "-b", "main");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "Test");
  writeFileSync(path.join(root, "file.txt"), "initial\n");
  git(root, "add", ".");
  git(root, "commit", "-m", "initial");
  return root;
}
describe("exact agent opening", () => {
  it("resolves nested symlink paths and a detached linked worktree without catalog lookup", async () => {
    const root = fixture();
    const linked = path.join(root, "sibling's checkout");
    git(root, "worktree", "add", "--detach", linked);
    mkdirSync(path.join(linked, "nested"));
    const alias = path.join(root, "alias");
    symlinkSync(linked, alias);
    const result = await prepareAgentOpen(path.join(alias, "nested"), {
      kind: "working-tree"
    });
    expect(result.repoPath).toBe(linked);
    expect(result.target.kind).toBe("working_tree");
    expect(result.repoPath).not.toBe(root);
  });
  it("rejects nonrepositories and missing refs before any selection", async () => {
    const root = fixture();
    const other = realpathSync(mkdtempSync(path.join(tmpdir(), "agent-not-repo-")));
    roots.push(other);
    await expect(prepareAgentOpen(other, { kind: "working-tree" })).rejects.toMatchObject(
      { code: "repository_missing" }
    );
    await expect(
      prepareAgentOpen(root, { kind: "branch", base: "missing" })
    ).rejects.toMatchObject({ code: "invalid_target" });
  });
  it("pins commit selectors and rejects already cancelled opens", async () => {
    const root = fixture();
    const sha = git(root, "rev-parse", "HEAD");
    const result = await prepareAgentOpen(root, { kind: "commit", commit: "HEAD" });
    expect(result.selector).toEqual({ kind: "commit", commit: sha });
    const controller = new AbortController();
    controller.abort();
    await expect(
      prepareAgentOpen(root, { kind: "working-tree" }, controller.signal)
    ).rejects.toMatchObject({ code: "request_timeout" });
  });
});
