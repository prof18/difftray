import { execFile } from "node:child_process";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  findGitRepository,
  getGitStatus,
  getWorktreeInfo,
  parseStatusPorcelainV2
} from "../src/index.js";

const execFileAsync = promisify(execFile);
const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (tempRoot) => {
      await rm(tempRoot, { force: true, recursive: true });
    })
  );
});

describe("Git repository detection", () => {
  it("returns null outside a Git repository", async () => {
    const tempRoot = await createTempRoot();

    await expect(findGitRepository(tempRoot)).resolves.toBeNull();
  });

  it("finds the repository root from a nested path", async () => {
    const repo = await createRepo();
    const nestedPath = path.join(repo, "packages", "app");
    await mkdir(nestedPath, { recursive: true });

    await expect(findGitRepository(nestedPath)).resolves.toEqual({
      gitDir: path.join(repo, ".git"),
      root: repo
    });
  });
});

describe("Git worktree detection", () => {
  it("describes the main worktree", async () => {
    const repo = await createRepo();

    await expect(getWorktreeInfo(repo)).resolves.toEqual({
      commonGitDir: path.join(repo, ".git"),
      gitDir: path.join(repo, ".git"),
      isLinkedWorktree: false,
      root: repo
    });
  });

  it("detects a linked worktree", async () => {
    const repo = await createRepo();
    const linkedParent = await createTempRoot();
    const linkedWorktree = path.join(linkedParent, "linked-worktree");
    await git(repo, "worktree", "add", "-b", "feature/test", linkedWorktree);

    const info = await getWorktreeInfo(linkedWorktree);

    expect(info.root).toBe(linkedWorktree);
    expect(info.commonGitDir).toBe(path.join(repo, ".git"));
    expect(info.gitDir).toContain(path.join(repo, ".git", "worktrees"));
    expect(info.isLinkedWorktree).toBe(true);
  });
});

describe("Git status parsing", () => {
  it("parses porcelain-v2 ordinary, rename, and untracked records", () => {
    const status = parseStatusPorcelainV2(
      [
        "1 .M N... 100644 100644 100644 aaa bbb src/changed.ts",
        "2 R. N... 100644 100644 100644 aaa bbb R100 src/new-name.ts",
        "src/old-name.ts",
        "? src/untracked.ts",
        ""
      ].join("\0")
    );

    expect(status).toEqual([
      expect.objectContaining({
        path: "src/changed.ts",
        status: "modified",
        workingTreeStatus: "modified"
      }),
      expect.objectContaining({
        path: "src/new-name.ts",
        previousPath: "src/old-name.ts",
        status: "renamed"
      }),
      expect.objectContaining({
        path: "src/untracked.ts",
        status: "untracked"
      })
    ]);
  });

  it("loads status from a real repository", async () => {
    const repo = await createRepo();
    await writeFile(path.join(repo, "tracked.txt"), "changed\n");
    await writeFile(path.join(repo, "untracked.txt"), "new\n");

    const status = await getGitStatus(repo);

    expect(status).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "tracked.txt", status: "modified" }),
        expect.objectContaining({ path: "untracked.txt", status: "untracked" })
      ])
    );
  });
});

async function createTempRoot(): Promise<string> {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "difftray-git-"));
  const realTempRoot = await realpath(tempRoot);
  tempRoots.push(realTempRoot);
  return realTempRoot;
}

async function createRepo(): Promise<string> {
  const repo = await createTempRoot();
  await git(repo, "init", "--initial-branch=main");
  await git(repo, "config", "user.email", "difftray@example.test");
  await git(repo, "config", "user.name", "Difftray Test");
  await writeFile(path.join(repo, "tracked.txt"), "initial\n");
  await git(repo, "add", "tracked.txt");
  await git(repo, "commit", "-m", "initial");
  return repo;
}

async function git(cwd: string, ...args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd });
}
