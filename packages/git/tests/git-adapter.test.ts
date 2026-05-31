import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  mkdtemp,
  mkdir,
  realpath,
  rm,
  symlink,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  findGitRepository,
  getGitStatus,
  getWorktreeInfo,
  listBranchRefs,
  loadBranchDiffs,
  loadBranchDiffSummaries,
  loadBranchFileDiff,
  loadWorkingTreeDiffs,
  loadWorkingTreeDiffSummaries,
  loadWorkingTreeFileDiff,
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

describe("working tree diff loading", () => {
  it("loads added files from a repository before the first commit", async () => {
    const repo = await createUnbornRepo();
    await writeFile(path.join(repo, "staged.txt"), "staged\n");
    await git(repo, "add", "staged.txt");
    await writeFile(path.join(repo, "untracked.txt"), "untracked\n");

    const result = await loadWorkingTreeDiffs(repo);
    const summary = await loadWorkingTreeDiffSummaries(repo);

    expect(result.reviewTarget).toEqual({
      headRefName: "main",
      headSha: "4b825dc642cb6eb9a060e54bf8d69288fbee4904",
      kind: "working_tree",
      projectId: repo
    });
    expect(result.files).toEqual([
      expect.objectContaining({
        content: expect.objectContaining({
          kind: "text",
          newText: "staged\n",
          patch: expect.stringContaining("+staged")
        }),
        newPath: "staged.txt",
        status: "added"
      }),
      expect.objectContaining({
        content: expect.objectContaining({
          kind: "text",
          newText: "untracked\n",
          patch: expect.stringContaining("+untracked")
        }),
        newPath: "untracked.txt",
        status: "added"
      })
    ]);
    expect(summary.reviewTarget).toEqual(result.reviewTarget);
    expect(summary.files.map((file) => file.newPath)).toEqual([
      "staged.txt",
      "untracked.txt"
    ]);
  });

  it("returns no files for a clean working tree", async () => {
    const repo = await createRepo();

    await expect(loadWorkingTreeDiffs(repo)).resolves.toEqual(
      expect.objectContaining({
        files: []
      })
    );
  });

  it("reports progress while loading changed files", async () => {
    const repo = await createRepo();
    await writeFile(path.join(repo, "tracked.txt"), "changed\n");
    const progressEvents: {
      readonly loadedFiles?: number;
      readonly path?: string;
      readonly phase: string;
      readonly totalFiles?: number;
    }[] = [];

    const result = await loadWorkingTreeDiffs(repo, {
      onProgress: (progress) => {
        progressEvents.push(progress);
      }
    });

    expect(result.files).toEqual([
      expect.objectContaining({
        newPath: "tracked.txt",
        status: "modified"
      })
    ]);
    expect(progressEvents.map((event) => event.phase)).toEqual(
      expect.arrayContaining(["resolving_target", "scanning_files", "loading_files"])
    );
    expect(progressEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          loadedFiles: 0,
          phase: "loading_files",
          totalFiles: 1
        }),
        expect.objectContaining({
          loadedFiles: 1,
          path: "tracked.txt",
          phase: "loading_files",
          totalFiles: 1
        })
      ])
    );
  });

  it("loads lightweight summaries before selected working tree file details", async () => {
    const repo = await createRepo();
    await writeFile(path.join(repo, "tracked.txt"), "changed\n");

    const summary = await loadWorkingTreeDiffSummaries(repo);
    const detail = await loadWorkingTreeFileDiff(repo, "tracked.txt");

    expect(summary.files).toEqual([
      expect.objectContaining({
        content: expect.objectContaining({ kind: "binary" }),
        newPath: "tracked.txt",
        status: "modified"
      })
    ]);
    expect(summary.files[0]?.content).not.toEqual(
      expect.objectContaining({ patch: expect.any(String) })
    );
    expect(detail).toEqual(
      expect.objectContaining({
        content: expect.objectContaining({
          kind: "text",
          patch: expect.stringContaining("+changed")
        }),
        newPath: "tracked.txt",
        status: "modified"
      })
    );
  });

  it("loads modified, deleted, and untracked text files", async () => {
    const repo = await createRepo();
    await writeFile(path.join(repo, "modified.txt"), "before\n");
    await git(repo, "add", "modified.txt");
    await git(repo, "commit", "-m", "add modified fixture");
    await git(repo, "rm", "tracked.txt");
    await writeFile(path.join(repo, "modified.txt"), "after\n");
    await writeFile(path.join(repo, "untracked.txt"), "new\n");

    const result = await loadWorkingTreeDiffs(repo);

    expect(result.reviewTarget).toEqual(
      expect.objectContaining({
        headRefName: "main",
        kind: "working_tree",
        projectId: repo
      })
    );
    expect(result.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          content: expect.objectContaining({
            kind: "text",
            patch: expect.stringContaining("+after")
          }),
          newPath: "modified.txt",
          status: "modified"
        }),
        expect.objectContaining({
          newPath: "tracked.txt",
          status: "deleted"
        }),
        expect.objectContaining({
          content: expect.objectContaining({
            kind: "text",
            patch: expect.stringContaining("+new")
          }),
          newPath: "untracked.txt",
          status: "added"
        })
      ])
    );
  });

  it("loads staged-only tracked files", async () => {
    const repo = await createRepo();
    await writeFile(path.join(repo, "tracked.txt"), "staged\n");
    await git(repo, "add", "tracked.txt");

    const result = await loadWorkingTreeDiffs(repo);

    expect(result.files).toEqual([
      expect.objectContaining({
        content: expect.objectContaining({
          kind: "text",
          patch: expect.stringContaining("+staged")
        }),
        newPath: "tracked.txt",
        status: "modified"
      })
    ]);
  });

  it("loads mixed staged and unstaged files as final working-tree content", async () => {
    const repo = await createRepo();
    await writeFile(path.join(repo, "tracked.txt"), "staged\n");
    await git(repo, "add", "tracked.txt");
    await writeFile(path.join(repo, "tracked.txt"), "working tree\n");

    const result = await loadWorkingTreeDiffs(repo);

    expect(result.files).toEqual([
      expect.objectContaining({
        content: expect.objectContaining({
          kind: "text",
          newText: "working tree\n",
          patch: expect.stringContaining("+working tree")
        }),
        newPath: "tracked.txt",
        status: "modified"
      })
    ]);
  });

  it("loads staged added tracked files", async () => {
    const repo = await createRepo();
    await writeFile(path.join(repo, "added.txt"), "added\n");
    await git(repo, "add", "added.txt");

    const result = await loadWorkingTreeDiffs(repo);

    expect(result.files).toEqual([
      expect.objectContaining({
        content: expect.objectContaining({
          kind: "text",
          patch: expect.stringContaining("+added")
        }),
        newPath: "added.txt",
        status: "added"
      })
    ]);
  });

  it("loads Git-reported renames", async () => {
    const repo = await createRepo();
    await git(repo, "mv", "tracked.txt", "renamed.txt");

    const result = await loadWorkingTreeDiffs(repo);

    expect(result.files).toEqual([
      expect.objectContaining({
        newPath: "renamed.txt",
        oldPath: "tracked.txt",
        status: "renamed"
      })
    ]);
  });

  it("loads case-only renames when Git reports them", async () => {
    const repo = await createRepo();
    await git(repo, "mv", "tracked.txt", "TRACKED.txt");

    const result = await loadWorkingTreeDiffs(repo);

    expect(result.files).toEqual([
      expect.objectContaining({
        newPath: "TRACKED.txt",
        oldPath: "tracked.txt",
        status: "renamed"
      })
    ]);
  });

  it("loads paths with spaces and unicode through NUL-delimited Git output", async () => {
    const repo = await createRepo();
    const nestedDirectory = path.join(repo, "space dir");
    const relativePath = "space dir/über file.txt";
    await mkdir(nestedDirectory);
    await writeFile(path.join(repo, relativePath), "before\n");
    await git(repo, "add", relativePath);
    await git(repo, "commit", "-m", "add unicode path");
    await writeFile(path.join(repo, relativePath), "after\n");

    const result = await loadWorkingTreeDiffs(repo);

    expect(result.files).toEqual([
      expect.objectContaining({
        content: expect.objectContaining({
          kind: "text",
          patch: expect.stringContaining("+after")
        }),
        newPath: relativePath,
        status: "modified"
      })
    ]);
  });

  it("fingerprints untracked binary files by bytes", async () => {
    const repo = await createRepo();
    const bytes = Buffer.from([0, 1, 2, 3, 255]);
    await writeFile(path.join(repo, "image.bin"), bytes);

    const result = await loadWorkingTreeDiffs(repo);

    expect(result.files).toEqual([
      expect.objectContaining({
        content: {
          byteSize: bytes.byteLength,
          digest: sha256(bytes),
          kind: "binary"
        },
        newPath: "image.bin",
        status: "added"
      })
    ]);
  });

  it("fingerprints tracked binary modifications by final content bytes", async () => {
    const repo = await createRepo();
    await writeFile(path.join(repo, "image.bin"), Buffer.from([0, 1, 2]));
    await git(repo, "add", "image.bin");
    await git(repo, "commit", "-m", "add binary fixture");
    const changedBytes = Buffer.from([0, 1, 3]);
    await writeFile(path.join(repo, "image.bin"), changedBytes);

    const result = await loadWorkingTreeDiffs(repo);

    expect(result.files).toEqual([
      expect.objectContaining({
        content: {
          byteSize: changedBytes.byteLength,
          digest: sha256(changedBytes),
          kind: "binary"
        },
        newPath: "image.bin",
        status: "modified"
      })
    ]);
  });

  it("fingerprints tracked binary deletions by old content bytes", async () => {
    const repo = await createRepo();
    const bytes = Buffer.from([0, 1, 2]);
    await writeFile(path.join(repo, "image.bin"), bytes);
    await git(repo, "add", "image.bin");
    await git(repo, "commit", "-m", "add binary fixture");
    await git(repo, "rm", "image.bin");

    const result = await loadWorkingTreeDiffs(repo);

    expect(result.files).toEqual([
      expect.objectContaining({
        content: {
          byteSize: bytes.byteLength,
          digest: sha256(bytes),
          kind: "binary"
        },
        newPath: "image.bin",
        status: "deleted"
      })
    ]);
  });

  it("treats oversized tracked text changes as fingerprint-only content", async () => {
    const repo = await createRepo();
    const originalBytes = Buffer.alloc(2_200_000, "a");
    const changedBytes = Buffer.concat([Buffer.from("changed\n"), originalBytes]);
    await writeFile(path.join(repo, "large.txt"), originalBytes);
    await git(repo, "add", "large.txt");
    await git(repo, "commit", "-m", "add large text fixture");
    await writeFile(path.join(repo, "large.txt"), changedBytes);

    const result = await loadWorkingTreeDiffs(repo);

    expect(result.files).toEqual([
      expect.objectContaining({
        content: {
          byteSize: changedBytes.byteLength,
          digest: sha256(changedBytes),
          kind: "binary"
        },
        newPath: "large.txt",
        status: "modified"
      })
    ]);
  });

  it("loads aggregate oversized tracked patches as per-file fingerprints", async () => {
    const repo = await createRepo();
    const originalBytes = Buffer.alloc(2_200_000, "m");
    const changedBytes = Buffer.concat([Buffer.from("changed\n"), originalBytes]);
    const fileNames = Array.from({ length: 10 }, (_, index) => `large-${index}.txt`);

    for (const fileName of fileNames) {
      await writeFile(path.join(repo, fileName), originalBytes);
    }
    await git(repo, "add", ...fileNames);
    await git(repo, "commit", "-m", "add large text fixtures");

    for (const fileName of fileNames) {
      await writeFile(path.join(repo, fileName), changedBytes);
    }

    const result = await loadWorkingTreeDiffs(repo);

    expect(result.files).toHaveLength(fileNames.length);
    expect(result.files).toEqual(
      expect.arrayContaining(
        fileNames.map((fileName) =>
          expect.objectContaining({
            content: {
              byteSize: changedBytes.byteLength,
              digest: sha256(changedBytes),
              kind: "binary"
            },
            newPath: fileName,
            status: "modified"
          })
        )
      )
    );
  });

  it("loads mode-only changes explicitly", async () => {
    const repo = await createRepo();
    await chmod(path.join(repo, "tracked.txt"), 0o755);

    const result = await loadWorkingTreeDiffs(repo);

    expect(result.files).toEqual([
      expect.objectContaining({
        content: { kind: "mode_only" },
        newMode: "100755",
        newPath: "tracked.txt",
        oldMode: "100644",
        status: "mode_changed"
      })
    ]);
  });

  it("loads untracked symlinks without reading the link target", async () => {
    const repo = await createRepo();
    const outsideFile = path.join(await createTempRoot(), "outside.txt");
    await writeFile(outsideFile, "outside secret\n");
    await symlink(outsideFile, path.join(repo, "outside-link"));

    const result = await loadWorkingTreeDiffs(repo);

    expect(result.files).toEqual([
      expect.objectContaining({
        content: {
          kind: "symlink",
          newTarget: outsideFile
        },
        newMode: "120000",
        newPath: "outside-link",
        status: "added"
      })
    ]);
  });

  it("treats oversized untracked text files as fingerprint-only content", async () => {
    const repo = await createRepo();
    const bytes = Buffer.alloc(2_200_000, "u");
    await writeFile(path.join(repo, "large-untracked.txt"), bytes);

    const result = await loadWorkingTreeDiffs(repo);

    expect(result.files).toEqual([
      expect.objectContaining({
        content: {
          byteSize: bytes.byteLength,
          digest: sha256(bytes),
          kind: "binary"
        },
        newPath: "large-untracked.txt",
        status: "added"
      })
    ]);
  });

  it("loads symlink target changes explicitly", async () => {
    const repo = await createRepo();
    await symlink("old-target", path.join(repo, "linked"));
    await git(repo, "add", "linked");
    await git(repo, "commit", "-m", "add symlink fixture");
    await rm(path.join(repo, "linked"));
    await symlink("new-target", path.join(repo, "linked"));

    const result = await loadWorkingTreeDiffs(repo);

    expect(result.files).toEqual([
      expect.objectContaining({
        content: {
          kind: "symlink",
          newTarget: "new-target",
          oldTarget: "old-target"
        },
        newMode: "120000",
        newPath: "linked",
        oldMode: "120000",
        status: "modified"
      })
    ]);
  });

  it("loads submodule pointer changes explicitly", async () => {
    const repo = await createRepo();
    const submoduleRepo = await createRepo();
    await git(
      repo,
      "-c",
      "protocol.file.allow=always",
      "submodule",
      "add",
      submoduleRepo,
      "vendor/module"
    );
    await git(repo, "commit", "-m", "add submodule fixture");
    const submodulePath = path.join(repo, "vendor", "module");
    const oldCommit = await gitOutput(repo, "rev-parse", "HEAD:vendor/module");
    await writeFile(path.join(submodulePath, "tracked.txt"), "advanced\n");
    await git(submodulePath, "commit", "-am", "advance submodule");
    const newCommit = await gitOutput(submodulePath, "rev-parse", "HEAD");

    const result = await loadWorkingTreeDiffs(repo);

    expect(result.files).toEqual([
      expect.objectContaining({
        content: {
          kind: "submodule",
          newCommit,
          oldCommit
        },
        newMode: "160000",
        newPath: "vendor/module",
        oldMode: "160000",
        status: "modified"
      })
    ]);
  });

  it("ignores untracked directories reported by Git", async () => {
    const repo = await createRepo();
    const nestedRepo = path.join(repo, "nested-repo");
    await mkdir(nestedRepo);
    await git(nestedRepo, "init", "--initial-branch=main");

    await expect(loadWorkingTreeDiffs(repo)).resolves.toEqual(
      expect.objectContaining({
        files: []
      })
    );
  });

  it("loads old and new text snapshots for modified files", async () => {
    const repo = await createRepo();
    const originalLines = Array.from(
      { length: 16 },
      (_, index) => `original line ${index + 1}`
    );
    await writeFile(path.join(repo, "context.txt"), `${originalLines.join("\n")}\n`);
    await git(repo, "add", "context.txt");
    await git(repo, "commit", "-m", "add context fixture");
    const changedLines = [...originalLines];
    changedLines[7] = "changed line 8";
    await writeFile(path.join(repo, "context.txt"), `${changedLines.join("\n")}\n`);

    const result = await loadWorkingTreeDiffs(repo);
    const file = result.files.find((candidate) => candidate.newPath === "context.txt");

    expect(file?.content).toMatchObject({
      kind: "text",
      newText: expect.stringContaining("changed line 8"),
      oldText: expect.stringContaining("original line 8"),
      patch: expect.stringContaining("+changed line 8")
    });
    expect(file?.content).toMatchObject({
      patch: expect.not.stringContaining("original line 2")
    });
  });
});

describe("branch diff loading", () => {
  it("lists local and remote branch refs for branch selection", async () => {
    const repo = await createRepo();
    await git(repo, "checkout", "-b", "feature/change");
    await git(repo, "update-ref", "refs/remotes/origin/main", "main");
    await git(
      repo,
      "symbolic-ref",
      "refs/remotes/origin/HEAD",
      "refs/remotes/origin/main"
    );

    await expect(listBranchRefs(repo)).resolves.toEqual([
      "feature/change",
      "main",
      "origin/main"
    ]);
  });

  it("compares merge-base to HEAD for a branch", async () => {
    const repo = await createRepo();
    await git(repo, "checkout", "-b", "feature/change");
    await writeFile(path.join(repo, "tracked.txt"), "branch\n");
    await git(repo, "commit", "-am", "change tracked");
    const headSha = await gitOutput(repo, "rev-parse", "HEAD");
    const mergeBaseSha = await gitOutput(repo, "merge-base", "main", "HEAD");

    const result = await loadBranchDiffs(repo, "main");

    expect(result.reviewTarget).toEqual({
      baseRefName: "main",
      baseSha: mergeBaseSha,
      headRefName: "feature/change",
      headSha,
      kind: "branch",
      mergeBaseSha,
      projectId: repo
    });
    expect(result.files).toEqual([
      expect.objectContaining({
        content: expect.objectContaining({
          kind: "text",
          patch: expect.stringContaining("+branch")
        }),
        newPath: "tracked.txt",
        status: "modified"
      })
    ]);
  });

  it("loads branch summaries separately from selected file details", async () => {
    const repo = await createRepo();
    await git(repo, "checkout", "-b", "feature/change");
    await writeFile(path.join(repo, "tracked.txt"), "branch\n");
    await git(repo, "commit", "-am", "change tracked");

    const summary = await loadBranchDiffSummaries(repo, "main");
    const detail = await loadBranchFileDiff(repo, "main", "tracked.txt");

    expect(summary.files).toEqual([
      expect.objectContaining({
        content: expect.objectContaining({ kind: "binary" }),
        newPath: "tracked.txt",
        status: "modified"
      })
    ]);
    expect(detail).toEqual(
      expect.objectContaining({
        content: expect.objectContaining({
          kind: "text",
          patch: expect.stringContaining("+branch")
        }),
        newPath: "tracked.txt",
        status: "modified"
      })
    );
  });

  it("loads committed binary content identity in branch diffs", async () => {
    const repo = await createRepo();
    await writeFile(path.join(repo, "image.bin"), Buffer.from([0, 1, 2]));
    await git(repo, "add", "image.bin");
    await git(repo, "commit", "-m", "add binary fixture");
    await git(repo, "checkout", "-b", "feature/binary");
    const changedBytes = Buffer.from([0, 1, 4]);
    await writeFile(path.join(repo, "image.bin"), changedBytes);
    await git(repo, "commit", "-am", "change binary fixture");

    const result = await loadBranchDiffs(repo, "main");

    expect(result.files).toEqual([
      expect.objectContaining({
        content: {
          byteSize: changedBytes.byteLength,
          digest: sha256(changedBytes),
          kind: "binary"
        },
        newPath: "image.bin",
        status: "modified"
      })
    ]);
  });

  it("changes review target identity when the base ref moves", async () => {
    const repo = await createRepo();
    await git(repo, "checkout", "-b", "feature/change");
    await writeFile(path.join(repo, "tracked.txt"), "branch\n");
    await git(repo, "commit", "-am", "change tracked on branch");
    const before = await loadBranchDiffs(repo, "main");
    await git(repo, "checkout", "main");
    await writeFile(path.join(repo, "base-only.txt"), "base\n");
    await git(repo, "add", "base-only.txt");
    await git(repo, "commit", "-m", "move base");
    await git(repo, "checkout", "feature/change");

    const after = await loadBranchDiffs(repo, "main");

    expect(after.reviewTarget.baseSha).not.toBe(before.reviewTarget.baseSha);
    expect(after.reviewTarget.mergeBaseSha).toBe(before.reviewTarget.mergeBaseSha);
  });

  it("throws a clear error when the base ref is missing", async () => {
    const repo = await createRepo();

    await expect(loadBranchDiffs(repo, "missing/base")).rejects.toThrow(
      /Unable to resolve base ref/
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

async function createUnbornRepo(): Promise<string> {
  const repo = await createTempRoot();
  await git(repo, "init", "--initial-branch=main");
  await git(repo, "config", "user.email", "difftray@example.test");
  await git(repo, "config", "user.name", "Difftray Test");
  return repo;
}

async function git(cwd: string, ...args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd });
}

async function gitOutput(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, encoding: "utf8" });
  return stdout.trim();
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
