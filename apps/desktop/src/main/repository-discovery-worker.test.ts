import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { traverseRepositoryMarkers } from "./repository-discovery-worker.js";

describe("repository discovery traversal", () => {
  it("finds repository roots without cataloging worktrees or nested repositories", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "difftray-discovery-"));
    const directoryRepo = path.join(root, "directory repo");
    const worktree = path.join(root, "linked worktree");
    const worktreeNestedRepo = path.join(worktree, "vendor", "nested-repo");
    const nestedRepo = path.join(directoryRepo, "vendor", "nested-repo");
    const excludedRepo = path.join(root, "node_modules", "hidden-repo");
    const outside = await mkdtemp(path.join(os.tmpdir(), "difftray-outside-"));
    await mkdir(path.join(directoryRepo, ".git"), { recursive: true });
    await mkdir(path.join(nestedRepo, ".git"), { recursive: true });
    await mkdir(worktree, { recursive: true });
    await writeFile(path.join(worktree, ".git"), "gitdir: /tmp/common/worktrees/one\n");
    await mkdir(path.join(worktreeNestedRepo, ".git"), { recursive: true });
    await mkdir(path.join(excludedRepo, ".git"), { recursive: true });
    await mkdir(path.join(outside, ".git"), { recursive: true });
    await symlink(outside, path.join(root, "outside-link"));

    const result = await traverseRepositoryMarkers(root);

    expect(result.markerPaths).toEqual([directoryRepo]);
    expect(result.markerPaths).not.toContain(worktreeNestedRepo);
    expect(result.scannedDirectories).toBeGreaterThan(0);
  });

  it("coalesces progress updates and still reports the final totals", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "difftray-discovery-progress-"));
    await Promise.all(
      Array.from({ length: 250 }, (_, index) =>
        mkdir(path.join(root, `directory-${String(index)}`))
      )
    );
    const progress: {
      readonly scannedDirectories: number;
      readonly skippedDirectories: number;
    }[] = [];

    const result = await traverseRepositoryMarkers(
      root,
      (scannedDirectories, skippedDirectories) => {
        progress.push({ scannedDirectories, skippedDirectories });
      }
    );

    expect(progress.length).toBeLessThan(10);
    expect(progress.at(-1)).toEqual({
      scannedDirectories: result.scannedDirectories,
      skippedDirectories: result.skippedDirectories
    });
  });
});
