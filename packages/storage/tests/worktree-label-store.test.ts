import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  openStorage,
  type ProjectRecord,
  type ReviewTargetRecord
} from "../src/index.js";

const commonGitDir = "/work/difftray/.git";

const project = {
  id: "project-1",
  name: "Difftray",
  path: "/work/difftray"
} satisfies ProjectRecord;

const reviewTarget = {
  headKind: "working_tree",
  headRefName: "main",
  headRefSha: "1111111111111111111111111111111111111111",
  id: "target-1",
  mode: "working_tree",
  projectId: project.id
} satisfies ReviewTargetRecord;

const temporaryDirectories: string[] = [];

afterEach(() => {
  vi.useRealTimers();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function temporaryDatabasePath(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "difftray-labels-"));
  temporaryDirectories.push(directory);
  return path.join(directory, "difftray.sqlite");
}

describe("worktree label store", () => {
  it("adds the label table to an existing database without changing projects or reviews", () => {
    const filename = temporaryDatabasePath();
    const original = openStorage(filename);
    original.upsertProject(project);
    original.upsertReviewTarget(reviewTarget);
    original.markReviewed({
      path: "src/index.ts",
      projectId: project.id,
      reviewedDiffHash: "hash-1",
      reviewTargetId: reviewTarget.id
    });
    const projectBefore = original.getProject(project.id);
    original.close();

    const legacy = new DatabaseSync(filename);
    legacy.exec("drop index if exists worktree_labels_path");
    legacy.exec("drop table if exists worktree_labels");
    legacy.close();

    const migrated = openStorage(filename);

    expect(migrated.getProject(project.id)).toEqual(projectBefore);
    expect(migrated.listReviewMarks(reviewTarget.id)).toEqual([
      expect.objectContaining({ path: "src/index.ts", reviewedDiffHash: "hash-1" })
    ]);
    expect(migrated.listWorktreeLabels([project.path])).toEqual([]);
    migrated.close();

    const inspection = new DatabaseSync(filename);
    const indexes = inspection
      .prepare("pragma index_list(worktree_labels)")
      .all() as unknown as readonly { readonly name: string }[];
    inspection.close();
    expect(indexes.map((index) => index.name)).toContain("worktree_labels_path");
  });

  it("sets, overwrites and resets a label and keeps it across reopen", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-17T10:00:00.000Z"));
    const filename = temporaryDatabasePath();
    const storage = openStorage(filename);

    const created = storage.setWorktreeLabel({
      commonGitDir,
      label: "Payments refactor",
      worktreeId: "worktree-a",
      worktreePath: "/work/difftray-payments"
    });

    expect(created).toEqual({
      commonGitDir,
      label: "Payments refactor",
      updatedAt: "2026-10-17T10:00:00.000Z",
      worktreeId: "worktree-a",
      worktreePath: "/work/difftray-payments"
    });

    vi.setSystemTime(new Date("2026-10-17T11:00:00.000Z"));
    storage.setWorktreeLabel({
      commonGitDir,
      label: "Checkout rework",
      worktreeId: "worktree-a",
      worktreePath: "/work/difftray-payments"
    });
    storage.close();

    const reopened = openStorage(filename);
    expect(reopened.getWorktreeLabel("worktree-a")).toEqual({
      commonGitDir,
      label: "Checkout rework",
      updatedAt: "2026-10-17T11:00:00.000Z",
      worktreeId: "worktree-a",
      worktreePath: "/work/difftray-payments"
    });

    expect(reopened.resetWorktreeLabel("worktree-a")).toBe(true);
    expect(reopened.getWorktreeLabel("worktree-a")).toBeNull();
    expect(reopened.resetWorktreeLabel("worktree-a")).toBe(false);
    reopened.close();
  });

  it("isolates labels by worktree id and resets only the matching row", () => {
    const storage = openStorage(":memory:");
    storage.setWorktreeLabel({
      commonGitDir,
      label: "First",
      worktreeId: "worktree-a",
      worktreePath: "/work/a"
    });
    storage.setWorktreeLabel({
      commonGitDir,
      label: "Second",
      worktreeId: "worktree-b",
      worktreePath: "/work/b"
    });

    storage.resetWorktreeLabel("worktree-a");

    expect(storage.getWorktreeLabel("worktree-a")).toBeNull();
    expect(storage.getWorktreeLabel("worktree-b")).toEqual(
      expect.objectContaining({ label: "Second" })
    );
    storage.close();
  });

  it("stores labels for worktrees that are not open projects", () => {
    const storage = openStorage(":memory:");
    storage.setWorktreeLabel({
      commonGitDir,
      label: "Unopened sibling",
      worktreeId: "worktree-sibling",
      worktreePath: "/work/sibling"
    });

    expect(storage.listKnownProjects()).toEqual([]);
    expect(storage.listWorktreeLabels(["/work/sibling"])).toEqual([
      expect.objectContaining({
        label: "Unopened sibling",
        worktreeId: "worktree-sibling"
      })
    ]);
    storage.close();
  });

  it("stores normalized paths and finds them by normalized lookup", () => {
    const storage = openStorage(":memory:");
    storage.setWorktreeLabel({
      commonGitDir: "/work/difftray/.git/",
      label: "Normalized",
      worktreeId: "worktree-a",
      worktreePath: "/work/./a/"
    });

    expect(storage.getWorktreeLabel("worktree-a")).toEqual(
      expect.objectContaining({
        commonGitDir: path.normalize("/work/difftray/.git/"),
        worktreePath: path.normalize("/work/./a/")
      })
    );
    expect(storage.listWorktreeLabels(["/work/a/", "/work/./a/"])).toHaveLength(1);
    storage.close();
  });

  it("returns no rows for an empty path list", () => {
    const storage = openStorage(":memory:");
    storage.setWorktreeLabel({
      commonGitDir,
      label: "Unrelated",
      worktreeId: "worktree-a",
      worktreePath: "/work/a"
    });

    expect(storage.listWorktreeLabels([])).toEqual([]);
    storage.close();
  });

  it("returns only labels for requested paths among many retained rows", () => {
    const storage = openStorage(":memory:");
    for (let index = 0; index < 500; index += 1) {
      storage.setWorktreeLabel({
        commonGitDir,
        label: `Retained ${index}`,
        worktreeId: `retained-${index}`,
        worktreePath: `/old/worktree-${index}`
      });
    }
    storage.setWorktreeLabel({
      commonGitDir,
      label: "Wanted",
      worktreeId: "wanted",
      worktreePath: "/work/wanted"
    });

    expect(storage.listWorktreeLabels(["/work/wanted", "/work/missing"])).toEqual([
      expect.objectContaining({ label: "Wanted", worktreeId: "wanted" })
    ]);
    storage.close();
  });

  it("looks up more paths than one query batch", () => {
    const storage = openStorage(":memory:");
    const paths = Array.from({ length: 450 }, (_, index) => `/work/worktree-${index}`);
    for (const [index, worktreePath] of paths.entries()) {
      storage.setWorktreeLabel({
        commonGitDir,
        label: `Label ${index}`,
        worktreeId: `worktree-${index}`,
        worktreePath
      });
    }

    const labels = storage.listWorktreeLabels(paths);

    expect(labels).toHaveLength(450);
    expect(new Set(labels.map((label) => label.worktreeId)).size).toBe(450);
    storage.close();
  });

  it("returns every identity that shares a path", () => {
    const storage = openStorage(":memory:");
    storage.setWorktreeLabel({
      commonGitDir: "/old/repository/.git",
      label: "Old repository",
      worktreeId: "old-identity",
      worktreePath: "/work/shared"
    });
    storage.setWorktreeLabel({
      commonGitDir,
      label: "Current repository",
      worktreeId: "current-identity",
      worktreePath: "/work/shared"
    });

    expect(
      storage
        .listWorktreeLabels(["/work/shared"])
        .map((label) => label.worktreeId)
        .sort()
    ).toEqual(["current-identity", "old-identity"]);
    storage.close();
  });
});
