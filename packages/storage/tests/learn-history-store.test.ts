import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import { openStorage, type DifftrayStorage } from "../src/index.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

type Fixture = {
  readonly filename: string;
  readonly storage: DifftrayStorage;
};

function openFixture(): Fixture {
  const directory = mkdtempSync(path.join(tmpdir(), "difftray-learn-history-"));
  temporaryDirectories.push(directory);
  const filename = path.join(directory, "difftray.sqlite");
  const storage = openStorage(filename);

  for (const id of ["a", "b", "other"]) {
    storage.upsertProject({ id, name: id, path: `/${id}` });
  }
  storage.upsertReviewTarget({
    baseRefName: "main",
    headKind: "ref",
    headRefName: "feature",
    headRefSha: "head-sha",
    id: "branch-a",
    mergeBaseSha: "base-sha",
    mode: "branch",
    projectId: "a"
  });
  storage.upsertReviewTarget({
    commitSha: "commit-sha",
    headKind: "ref",
    id: "commit-b",
    mode: "commit",
    parentSha: "parent-sha",
    projectId: "b"
  });
  storage.upsertReviewTarget({
    headKind: "working_tree",
    id: "wt-other",
    mode: "working_tree",
    projectId: "other"
  });
  return { filename, storage };
}

// Rewrites timestamps directly so the window tests do not depend on the clock.
function setTimes(
  filename: string,
  table: "review_comments" | "review_file_comments" | "review_notes",
  key: string,
  times: { createdAt?: string; updatedAt?: string; bodySavedAt?: string }
): void {
  const db = new DatabaseSync(filename);
  const keyColumn = table === "review_notes" ? "scope_id" : "id";
  try {
    if (times.createdAt)
      db.prepare(`update ${table} set created_at = ? where ${keyColumn} = ?`).run(
        times.createdAt,
        key
      );
    if (times.updatedAt)
      db.prepare(`update ${table} set updated_at = ? where ${keyColumn} = ?`).run(
        times.updatedAt,
        key
      );
    if (times.bodySavedAt)
      db.prepare(`update ${table} set body_saved_at = ? where ${keyColumn} = ?`).run(
        times.bodySavedAt,
        key
      );
  } finally {
    db.close();
  }
}

function seedFeedback(fixture: Fixture): void {
  const { filename, storage } = fixture;
  const line = storage.createReviewComment({
    body: "line body",
    diffHash: "h1",
    excerptJson: '{"v":1}',
    lineEnd: 4,
    lineStart: 2,
    path: "src/new.ts",
    previousPath: "src/old.ts",
    projectId: "a",
    reviewTargetId: "branch-a",
    side: "deletions"
  });
  setTimes(filename, "review_comments", line.id, {
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z"
  });
  const file = storage.createReviewFileComment({
    body: "file body",
    diffHash: "h2",
    path: "README.md",
    projectId: "b",
    reviewTargetId: "commit-b"
  });
  setTimes(filename, "review_file_comments", file.id, {
    createdAt: "2026-01-03T00:00:00.000Z",
    updatedAt: "2026-01-03T00:00:00.000Z"
  });
  storage.saveReviewNote({ body: "note body", projectId: "a", scopeId: "scope-a" });
  setTimes(filename, "review_notes", "scope-a", {
    bodySavedAt: "2026-01-04T00:00:00.000Z",
    createdAt: "2026-01-04T00:00:00.000Z",
    updatedAt: "2026-01-04T00:00:00.000Z"
  });
  const old = storage.createReviewComment({
    body: "old body",
    diffHash: "h3",
    lineEnd: 1,
    lineStart: 1,
    path: "src/a.ts",
    projectId: "a",
    reviewTargetId: "branch-a",
    side: "additions"
  });
  setTimes(filename, "review_comments", old.id, {
    createdAt: "2025-12-01T00:00:00.000Z",
    updatedAt: "2025-12-01T00:00:00.000Z"
  });
  const older = storage.createReviewComment({
    body: "older body",
    diffHash: "h4",
    lineEnd: 1,
    lineStart: 1,
    path: "src/b.ts",
    projectId: "b",
    reviewTargetId: "commit-b",
    side: "additions"
  });
  setTimes(filename, "review_comments", older.id, {
    createdAt: "2025-11-01T00:00:00.000Z",
    updatedAt: "2025-11-01T00:00:00.000Z"
  });
  const foreign = storage.createReviewComment({
    body: "foreign",
    diffHash: "h5",
    lineEnd: 1,
    lineStart: 1,
    path: "src/a.ts",
    projectId: "other",
    reviewTargetId: "wt-other",
    side: "additions"
  });
  setTimes(filename, "review_comments", foreign.id, {
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z"
  });
}

const both = [
  { projectId: "a", since: null },
  { projectId: "b", since: null }
] as const;

describe("listLearnHistoryRows", () => {
  it("returns every row of the given projects as new when after is null", () => {
    const fixture = openFixture();
    seedFeedback(fixture);

    const result = fixture.storage.listLearnHistoryRows({
      after: null,
      earlierFrom: "2025-01-01T00:00:00.000Z",
      earlierLimit: 10,
      projects: both,
      upTo: "2026-02-01T00:00:00.000Z"
    });

    expect(result.newRows.map((row) => row.body).sort()).toEqual([
      "file body",
      "line body",
      "note body",
      "old body",
      "older body"
    ]);
    expect(result.earlierRows).toEqual([]);
  });

  it("splits rows into new and earlier, newest earlier first, with the limit", () => {
    const fixture = openFixture();
    seedFeedback(fixture);
    const input = {
      after: "2026-01-01T00:00:00.000Z",
      earlierFrom: "2025-01-01T00:00:00.000Z",
      earlierLimit: 10,
      projects: both,
      upTo: "2026-01-03T00:00:00.000Z"
    };

    const result = fixture.storage.listLearnHistoryRows(input);

    expect(result.newRows.map((row) => row.body)).toEqual(["line body", "file body"]);
    expect(result.earlierRows.map((row) => row.body)).toEqual(["old body", "older body"]);
    expect(
      fixture.storage
        .listLearnHistoryRows({ ...input, earlierLimit: 1 })
        .earlierRows.map((row) => row.body)
    ).toEqual(["old body"]);
    expect(
      fixture.storage
        .listLearnHistoryRows({ ...input, earlierFrom: "2025-11-15T00:00:00.000Z" })
        .earlierRows.map((row) => row.body)
    ).toEqual(["old body"]);
  });

  it("keeps earlier rows within upTo when after is later than the snapshot", () => {
    const fixture = openFixture();
    seedFeedback(fixture);

    const result = fixture.storage.listLearnHistoryRows({
      after: "2026-06-01T00:00:00.000Z",
      earlierFrom: "2025-01-01T00:00:00.000Z",
      earlierLimit: 10,
      projects: both,
      upTo: "2026-01-02T00:00:00.000Z"
    });

    expect(result.newRows).toEqual([]);
    expect(result.earlierRows.map((row) => row.body)).toEqual([
      "line body",
      "old body",
      "older body"
    ]);
  });

  it("returns only the given projects", () => {
    const fixture = openFixture();
    seedFeedback(fixture);

    const result = fixture.storage.listLearnHistoryRows({
      after: null,
      earlierFrom: "2025-01-01T00:00:00.000Z",
      earlierLimit: 10,
      projects: [{ projectId: "b", since: null }],
      upTo: "2026-02-01T00:00:00.000Z"
    });

    expect(result.newRows.map((row) => row.projectId)).toEqual(["b", "b"]);
  });

  it("honours a project's since for created_at and body_saved_at", () => {
    const fixture = openFixture();
    seedFeedback(fixture);

    const result = fixture.storage.listLearnHistoryRows({
      after: null,
      earlierFrom: "2025-01-01T00:00:00.000Z",
      earlierLimit: 10,
      projects: [
        { projectId: "a", since: "2026-01-03T00:00:00.000Z" },
        { projectId: "b", since: "2026-01-03T00:00:00.000Z" }
      ],
      upTo: "2026-02-01T00:00:00.000Z"
    });

    expect(result.newRows.map((row) => row.body).sort()).toEqual([
      "file body",
      "note body"
    ]);

    setTimes(fixture.filename, "review_notes", "scope-a", {
      bodySavedAt: "2026-01-02T00:00:00.000Z"
    });
    const withOldNote = fixture.storage.listLearnHistoryRows({
      after: null,
      earlierFrom: "2025-01-01T00:00:00.000Z",
      earlierLimit: 10,
      projects: [{ projectId: "a", since: "2026-01-03T00:00:00.000Z" }],
      upTo: "2026-02-01T00:00:00.000Z"
    });
    expect(withOldNote.newRows).toEqual([]);
  });

  it("includes previous_path, the note scope and the joined review target", () => {
    const fixture = openFixture();
    seedFeedback(fixture);

    const { newRows } = fixture.storage.listLearnHistoryRows({
      after: "2026-01-01T00:00:00.000Z",
      earlierFrom: "2025-01-01T00:00:00.000Z",
      earlierLimit: 10,
      projects: both,
      upTo: "2026-02-01T00:00:00.000Z"
    });
    const line = newRows.find((row) => row.kind === "line");
    const file = newRows.find((row) => row.kind === "file");
    const note = newRows.find((row) => row.kind === "note");

    expect(line).toMatchObject({
      createdBy: { kind: "human" },
      excerptJson: '{"v":1}',
      lineEnd: 4,
      lineStart: 2,
      path: "src/new.ts",
      previousPath: "src/old.ts",
      reviewTargetId: "branch-a",
      side: "deletions",
      target: {
        baseRefName: "main",
        headRefName: "feature",
        headRefSha: "head-sha",
        mergeBaseSha: "base-sha",
        mode: "branch"
      }
    });
    expect(file).toMatchObject({
      path: "README.md",
      previousPath: null,
      target: { commitSha: "commit-sha", mode: "commit", parentSha: "parent-sha" }
    });
    expect(note).toMatchObject({
      dismissedAt: null,
      lastEditedBy: { kind: "human" },
      path: null,
      scopeId: "scope-a",
      target: null
    });
  });
});

describe("listLearnReviewTargets", () => {
  it("lists the review targets of one project, oldest first", () => {
    const fixture = openFixture();
    fixture.storage.upsertReviewTarget({
      headKind: "working_tree",
      headRefName: "feature",
      headRefSha: "later-sha",
      id: "wt-a",
      mode: "working_tree",
      projectId: "a"
    });

    const targets = fixture.storage.listLearnReviewTargets("a");

    expect(targets.map((target) => target.id)).toEqual(["branch-a", "wt-a"]);
    expect(targets[1]).toMatchObject({ headRefName: "feature", headRefSha: "later-sha" });
  });
});
