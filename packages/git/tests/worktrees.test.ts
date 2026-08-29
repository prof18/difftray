import { execFile } from "node:child_process";
import { mkdtemp, mkdir, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

import {
  listGitWorktrees,
  parseWorktreePorcelain,
  worktreeOpaqueId
} from "../src/worktrees.js";

const execFileAsync = promisify(execFile);

describe("parseWorktreePorcelain", () => {
  it("parses main and linked worktrees from NUL-delimited porcelain", () => {
    const output = Buffer.from(
      [
        "worktree /workspace/main",
        `HEAD ${"1".repeat(40)}`,
        "branch refs/heads/main",
        "",
        "worktree /workspace/agent tree",
        `HEAD ${"2".repeat(40)}`,
        "branch refs/heads/codex/feature",
        "locked in use",
        "",
        ""
      ].join("\0")
    );

    expect(parseWorktreePorcelain(output)).toEqual([
      {
        branchName: "main",
        headSha: "1".repeat(40),
        locked: false,
        path: "/workspace/main"
      },
      {
        branchName: "codex/feature",
        headSha: "2".repeat(40),
        lockReason: "in use",
        locked: true,
        path: "/workspace/agent tree"
      }
    ]);
  });

  it("preserves newlines in paths and parses detached, bare, and prunable states", () => {
    const output = Buffer.from(
      [
        "worktree /workspace/line\nbreak",
        `HEAD ${"a".repeat(40)}`,
        "detached",
        "",
        "worktree /workspace/bare",
        "bare",
        "",
        "worktree /workspace/missing",
        `HEAD ${"b".repeat(40)}`,
        "prunable gitdir file points to non-existent location",
        "",
        ""
      ].join("\0")
    );

    expect(parseWorktreePorcelain(output)).toEqual([
      {
        detached: true,
        headSha: "a".repeat(40),
        locked: false,
        path: "/workspace/line\nbreak"
      },
      {
        bare: true,
        locked: false,
        path: "/workspace/bare"
      },
      {
        headSha: "b".repeat(40),
        locked: false,
        path: "/workspace/missing",
        prunable: true,
        prunableReason: "gitdir file points to non-existent location"
      }
    ]);
  });

  it("rejects malformed fields before the first worktree path", () => {
    expect(() =>
      parseWorktreePorcelain(Buffer.from(`HEAD ${"1".repeat(40)}\0\0`))
    ).toThrow("worktree path");
  });
});

describe("worktreeOpaqueId", () => {
  it("is stable for a common Git directory and normalized worktree path", () => {
    expect(worktreeOpaqueId("/workspace/main/.git", "/workspace/agent/../agent")).toBe(
      worktreeOpaqueId("/workspace/main/.git", "/workspace/agent")
    );
    expect(worktreeOpaqueId("/workspace/main/.git", "/workspace/other")).not.toBe(
      worktreeOpaqueId("/workspace/main/.git", "/workspace/agent")
    );
  });
});

describe("listGitWorktrees", () => {
  it("preserves newlines and surrounding spaces in repository paths", async () => {
    const temporaryParent = await mkdtemp(
      path.join(os.tmpdir(), "difftray-worktrees-path-")
    );
    const repositoryPath = path.join(temporaryParent, " repo\n ");

    try {
      await mkdir(repositoryPath);
      await execFileAsync("git", ["-C", repositoryPath, "init", "-q"]);

      const worktrees = await listGitWorktrees(repositoryPath);
      const canonicalRepositoryPath = await realpath(repositoryPath);

      expect(worktrees[0]).toEqual(
        expect.objectContaining({
          commonGitDir: path.join(canonicalRepositoryPath, ".git"),
          current: true,
          path: canonicalRepositoryPath
        })
      );
    } finally {
      await rm(temporaryParent, { force: true, recursive: true });
    }
  });
});
