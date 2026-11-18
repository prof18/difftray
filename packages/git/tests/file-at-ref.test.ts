import { execFile } from "node:child_process";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  commitExists,
  firstCommitTouchingPathSince,
  listPathCommits,
  readFileAtRef,
  readPatchBetween,
  readRootCommit
} from "../src/index.js";

const execFileAsync = promisify(execFile);
const tempRoots: string[] = [];
const unknownSha = "0123456789abcdef0123456789abcdef01234567";

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { force: true, recursive: true }))
  );
});

describe("readFileAtRef", () => {
  it("returns the file text at a commit", async () => {
    const repo = await createRepo();
    await writeFile(path.join(repo, "a.txt"), "one\n");
    const first = await commitAll(repo, "first");
    await writeFile(path.join(repo, "a.txt"), "two\n");
    const second = await commitAll(repo, "second");

    await expect(readFileAtRef(repo, first, "a.txt")).resolves.toBe("one\n");
    await expect(readFileAtRef(repo, second, "a.txt")).resolves.toBe("two\n");
  });

  it("returns null for a missing path or an unknown SHA", async () => {
    const repo = await createRepo();
    const head = await gitText(repo, "rev-parse", "HEAD");

    await expect(readFileAtRef(repo, head, "missing.txt")).resolves.toBeNull();
    await expect(readFileAtRef(repo, unknownSha, "tracked.txt")).resolves.toBeNull();
    await expect(readFileAtRef(repo, "--output=x", "tracked.txt")).resolves.toBeNull();
  });
});

describe("listPathCommits", () => {
  it("lists the commits that changed a path, including other branches", async () => {
    const repo = await createRepo();
    await writeFile(path.join(repo, "a.txt"), "one\n");
    const onMain = await commitAll(repo, "main change", "2026-01-01T10:00:00Z");
    await git(repo, "checkout", "-b", "side");
    await writeFile(path.join(repo, "a.txt"), "side\n");
    const onSide = await commitAll(repo, "side change", "2026-02-01T10:00:00Z");
    await git(repo, "checkout", "main");

    const commits = await listPathCommits(repo, "a.txt");

    expect(commits.map((commit) => commit.sha)).toEqual([onMain, onSide]);
    expect(commits[0]?.committedAt).toBe("2026-01-01T10:00:00.000Z");
    expect(firstCommitTouchingPathSince(commits, "2026-01-15T00:00:00.000Z")).toEqual(
      commits[1]
    );
    expect(firstCommitTouchingPathSince(commits, "2025-12-01T00:00:00.000Z")).toEqual(
      commits[0]
    );
    expect(firstCommitTouchingPathSince(commits, "2026-01-01T10:00:00.000Z")).toEqual(
      commits[0]
    );
    expect(firstCommitTouchingPathSince(commits, "2026-03-01T00:00:00.000Z")).toBeNull();
  });

  it("matches a path with glob characters only literally", async () => {
    const repo = await createRepo();
    await writeFile(path.join(repo, "x*?.txt"), "glob\n");
    const globCommit = await commitAll(repo, "glob");
    await writeFile(path.join(repo, "xab.txt"), "other\n");
    await commitAll(repo, "other");
    await writeFile(path.join(repo, ":(glob)y.txt"), "magic\n");
    const magicCommit = await commitAll(repo, "magic");
    await writeFile(path.join(repo, "y.txt"), "plain\n");
    await commitAll(repo, "plain");

    const globCommits = await listPathCommits(repo, "x*?.txt");
    const magicCommits = await listPathCommits(repo, ":(glob)y.txt");

    expect(globCommits.map((commit) => commit.sha)).toEqual([globCommit]);
    expect(magicCommits.map((commit) => commit.sha)).toEqual([magicCommit]);
    await expect(readFileAtRef(repo, globCommit, "x*?.txt")).resolves.toBe("glob\n");
  });
});

describe("readRootCommit and commitExists", () => {
  it("stays the same after checking out a branch with unrelated history", async () => {
    const repo = await createRepo();
    const before = await readRootCommit(repo);
    await git(repo, "checkout", "--orphan", "unrelated");
    await writeFile(path.join(repo, "other.txt"), "other\n");
    await commitAll(repo, "unrelated root");

    // readRootCommit picks the smallest root SHA, so an orphan root can sort first.
    // Branch switches stay non-replacements because the stored root still exists.
    expect(before).not.toBeNull();
    const after = await readRootCommit(repo);
    const roots = (await gitText(repo, "rev-list", "--max-parents=0", "--all"))
      .split("\n")
      .sort();
    expect(after).toBe(roots[0]);
    expect(roots).toContain(before);
    await expect(commitExists(repo, before ?? "")).resolves.toBe(true);
  });

  it("matches across clones and differs for unrelated repositories", async () => {
    const repo = await createRepo();
    const cloneParent = await createTempRoot();
    const clone = path.join(cloneParent, "clone");
    await execFileAsync("git", ["clone", "--quiet", repo, clone]);
    const unrelated = await createRepo("unrelated\n");
    const empty = await createTempRoot();
    await git(empty, "init", "--initial-branch=main");

    const root = await readRootCommit(repo);
    expect(root).toMatch(/^[0-9a-f]{40}$/);
    await expect(readRootCommit(clone)).resolves.toBe(root);
    await expect(readRootCommit(unrelated)).resolves.not.toBe(root);
    await expect(readRootCommit(empty)).resolves.toBeNull();
  });

  it("is false for an unknown SHA", async () => {
    const repo = await createRepo();
    const head = await gitText(repo, "rev-parse", "HEAD");

    await expect(commitExists(repo, head)).resolves.toBe(true);
    await expect(commitExists(repo, unknownSha)).resolves.toBe(false);
  });
});

describe("readPatchBetween", () => {
  it("returns the unified diff for one file", async () => {
    const repo = await createRepo();
    const before = await gitText(repo, "rev-parse", "HEAD");
    await writeFile(path.join(repo, "tracked.txt"), "changed\n");
    await writeFile(path.join(repo, "other.txt"), "other\n");
    const after = await commitAll(repo, "change");

    const patch = await readPatchBetween(
      repo,
      before,
      after,
      "tracked.txt",
      "tracked.txt"
    );

    expect(patch).toContain("diff --git a/tracked.txt b/tracked.txt");
    expect(patch).toContain("-initial");
    expect(patch).toContain("+changed");
    expect(patch).not.toContain("other.txt");
  });

  it("follows a rename from oldPath to newPath", async () => {
    const repo = await createRepo();
    await writeFile(
      path.join(repo, "old.txt"),
      Array.from({ length: 20 }, (_, index) => `line ${String(index)}`).join("\n") + "\n"
    );
    const before = await commitAll(repo, "add old");
    await git(repo, "mv", "old.txt", "new.txt");
    const after = await commitAll(repo, "rename");

    const patch = await readPatchBetween(repo, before, after, "old.txt", "new.txt");

    expect(patch).toContain("rename from old.txt");
    expect(patch).toContain("rename to new.txt");
  });

  it("returns null when either ref is missing", async () => {
    const repo = await createRepo();
    const head = await gitText(repo, "rev-parse", "HEAD");

    await expect(
      readPatchBetween(repo, unknownSha, head, "tracked.txt", "tracked.txt")
    ).resolves.toBeNull();
    await expect(
      readPatchBetween(repo, head, unknownSha, "tracked.txt", "tracked.txt")
    ).resolves.toBeNull();
    const written = path.join(repo, "written.patch");
    await expect(
      readPatchBetween(repo, `--output=${written}`, head, "tracked.txt", "tracked.txt")
    ).resolves.toBeNull();
    await expect(readFile(written, "utf8")).rejects.toThrow();
  });
});

async function createTempRoot(): Promise<string> {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "difftray-file-at-ref-"));
  const realTempRoot = await realpath(tempRoot);
  tempRoots.push(realTempRoot);
  return realTempRoot;
}

async function createRepo(initialText = "initial\n"): Promise<string> {
  const repo = await createTempRoot();
  await git(repo, "init", "--initial-branch=main");
  await git(repo, "config", "user.email", "difftray@example.test");
  await git(repo, "config", "user.name", "Difftray Test");
  await writeFile(path.join(repo, "tracked.txt"), initialText);
  await commitAll(repo, "initial");
  return repo;
}

async function commitAll(repo: string, message: string, date?: string): Promise<string> {
  await git(repo, "add", "--all");
  await execFileAsync("git", ["commit", "--quiet", "-m", message], {
    cwd: repo,
    env: {
      ...process.env,
      ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {})
    }
  });
  return gitText(repo, "rev-parse", "HEAD");
}

async function git(cwd: string, ...args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd });
}

async function gitText(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, encoding: "utf8" });
  return stdout.trim();
}
