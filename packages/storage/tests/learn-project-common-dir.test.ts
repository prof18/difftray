import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import { openStorage, type ProjectRecord } from "../src/index.js";

const main = {
  id: "/work/app",
  name: "app",
  path: "/work/app"
} satisfies ProjectRecord;

const linked = {
  id: "/work/app-feature",
  name: "app-feature",
  path: "/work/app-feature"
} satisfies ProjectRecord;

const other = {
  id: "/work/other",
  name: "other",
  path: "/work/other"
} satisfies ProjectRecord;

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function temporaryDatabasePath(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "difftray-learn-project-"));
  temporaryDirectories.push(directory);
  return path.join(directory, "difftray.sqlite");
}

function columnNames(filename: string, table: string): readonly string[] {
  const db = new DatabaseSync(filename);
  try {
    return (
      db.prepare(`pragma table_info(${table})`).all() as unknown as readonly {
        readonly name: string;
      }[]
    ).map((column) => column.name);
  } finally {
    db.close();
  }
}

describe("project common Git directory", () => {
  it("adds the repository key columns to an existing database without changing projects", () => {
    const filename = temporaryDatabasePath();
    const original = openStorage(filename);
    original.upsertProject(main);
    original.close();

    const legacy = new DatabaseSync(filename);
    legacy.exec("drop index if exists projects_common_git_dir_idx");
    legacy.exec("alter table projects drop column common_git_dir");
    legacy.exec("alter table projects drop column common_git_dir_since");
    legacy.exec("alter table projects drop column repository_root_commit");
    legacy.close();
    expect(columnNames(filename, "projects")).not.toContain("common_git_dir");

    const migrated = openStorage(filename);
    expect(migrated.getProject(main.id)).toMatchObject(main);
    expect(migrated.getProjectRepositoryKey(main.id)).toEqual({
      commonGitDir: null,
      commonGitDirSince: null,
      repositoryRootCommit: null
    });
    migrated.close();

    expect(columnNames(filename, "projects")).toEqual(
      expect.arrayContaining([
        "common_git_dir",
        "common_git_dir_since",
        "repository_root_commit"
      ])
    );
    const inspected = new DatabaseSync(filename);
    const indexes = (
      inspected.prepare("pragma index_list(projects)").all() as unknown as readonly {
        readonly name: string;
      }[]
    ).map((index) => index.name);
    inspected.close();
    expect(indexes).toContain("projects_common_git_dir_idx");
  });

  it("stores and reads the repository key of a project", () => {
    const storage = openStorage(":memory:");
    storage.upsertProject(main);

    storage.setProjectCommonGitDir(
      main.id,
      "/work/app/.git",
      "2026-11-01T10:00:00.000Z",
      "a".repeat(40)
    );

    expect(storage.getProjectRepositoryKey(main.id)).toEqual({
      commonGitDir: "/work/app/.git",
      commonGitDirSince: "2026-11-01T10:00:00.000Z",
      repositoryRootCommit: "a".repeat(40)
    });

    storage.setProjectCommonGitDir(main.id, "/work/app/.git", null, null);
    expect(storage.getProjectRepositoryKey(main.id)).toEqual({
      commonGitDir: "/work/app/.git",
      commonGitDirSince: null,
      repositoryRootCommit: null
    });
    storage.close();
  });

  it("returns null for an unknown project", () => {
    const storage = openStorage(":memory:");
    expect(storage.getProjectRepositoryKey("missing")).toBeNull();
    storage.close();
  });

  it("lists projects by common Git directory and projects without one", () => {
    const storage = openStorage(":memory:");
    storage.upsertProject(main);
    storage.upsertProject(linked);
    storage.upsertProject(other);
    storage.setProjectCommonGitDir(main.id, "/work/app/.git", null, "b".repeat(40));
    storage.setProjectCommonGitDir(
      linked.id,
      "/work/app/.git",
      "2026-11-02T10:00:00.000Z",
      "b".repeat(40)
    );

    const grouped = storage.listProjectsByCommonGitDir("/work/app/.git");
    expect(grouped.map((project) => project.id).sort()).toEqual(
      [linked.id, main.id].sort()
    );
    expect(grouped.find((project) => project.id === main.id)).toMatchObject({
      ...main,
      commonGitDir: "/work/app/.git",
      commonGitDirSince: null,
      repositoryRootCommit: "b".repeat(40)
    });
    expect(grouped.find((project) => project.id === linked.id)).toMatchObject({
      ...linked,
      commonGitDir: "/work/app/.git",
      commonGitDirSince: "2026-11-02T10:00:00.000Z",
      repositoryRootCommit: "b".repeat(40)
    });
    expect(storage.listProjectsByCommonGitDir("/work/none/.git")).toEqual([]);
    expect(
      storage.listProjectsMissingCommonGitDir().map((project) => project.id)
    ).toEqual([other.id]);
    storage.close();
  });

  it("keeps the repository key when a project is opened again", () => {
    const storage = openStorage(":memory:");
    storage.upsertProject(main);
    storage.setProjectCommonGitDir(main.id, "/work/app/.git", null, "c".repeat(40));
    storage.upsertProject({ ...main, lastOpenedAt: "2026-11-03T10:00:00.000Z" });
    expect(storage.getProjectRepositoryKey(main.id)).toEqual({
      commonGitDir: "/work/app/.git",
      commonGitDirSince: null,
      repositoryRootCommit: "c".repeat(40)
    });
    storage.close();
  });
});
