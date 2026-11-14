import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  openStorage,
  type DifftrayStorage,
  type ProjectRecord,
  type ReviewTargetRecord
} from "../src/index.js";

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

const rebasedTarget = {
  ...reviewTarget,
  headRefSha: "2222222222222222222222222222222222222222",
  id: "target-2"
} satisfies ReviewTargetRecord;

const temporaryDirectories: string[] = [];

afterEach(() => {
  vi.useRealTimers();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function temporaryDatabasePath(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "difftray-lineage-"));
  temporaryDirectories.push(directory);
  return path.join(directory, "difftray.sqlite");
}

function openSeeded(): DifftrayStorage {
  const storage = openStorage(":memory:");
  storage.upsertProject(project);
  storage.upsertReviewTarget(reviewTarget);
  storage.upsertReviewTarget(rebasedTarget);
  return storage;
}

describe("review mark lineage", () => {
  it("adds lineage columns to an existing database without changing marks", () => {
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
    original.close();

    const legacy = new DatabaseSync(filename);
    legacy.exec("drop index if exists review_marks_lineage_path_idx");
    legacy.exec("alter table review_marks drop column content_fingerprint");
    legacy.exec("alter table review_marks drop column lineage_id");
    legacy.close();

    const migrated = openStorage(filename);
    expect(migrated.listReviewMarks(reviewTarget.id)).toEqual([
      {
        path: "src/index.ts",
        reviewedDiffHash: "hash-1",
        reviewTargetId: reviewTarget.id
      }
    ]);
    migrated.close();

    const inspected = new DatabaseSync(filename);
    const columns = (
      inspected.prepare("pragma table_info(review_marks)").all() as unknown as readonly {
        readonly name: string;
      }[]
    ).map((column) => column.name);
    const indexes = (
      inspected.prepare("pragma index_list(review_marks)").all() as unknown as readonly {
        readonly name: string;
      }[]
    ).map((index) => index.name);
    inspected.close();

    expect(columns).toEqual(
      expect.arrayContaining(["lineage_id", "content_fingerprint"])
    );
    expect(indexes).toContain("review_marks_lineage_path_idx");
  });

  it("lists marks of a lineage across targets", () => {
    const storage = openSeeded();
    storage.markReviewed({
      contentFingerprint: "fp-1",
      lineageId: "lineage-1",
      path: "f.txt",
      projectId: project.id,
      reviewedDiffHash: "hash-f",
      reviewTargetId: reviewTarget.id
    });
    storage.markReviewed({
      contentFingerprint: "fp-2",
      lineageId: "lineage-1",
      path: "g.txt",
      projectId: project.id,
      reviewedDiffHash: "hash-g",
      reviewTargetId: rebasedTarget.id
    });
    storage.markReviewed({
      contentFingerprint: "fp-3",
      lineageId: "lineage-2",
      path: "h.txt",
      projectId: project.id,
      reviewedDiffHash: "hash-h",
      reviewTargetId: reviewTarget.id
    });

    expect(storage.listLineageReviewMarks("lineage-1")).toEqual([
      {
        contentFingerprint: "fp-1",
        path: "f.txt",
        reviewedDiffHash: "hash-f",
        reviewTargetId: reviewTarget.id
      },
      {
        contentFingerprint: "fp-2",
        path: "g.txt",
        reviewedDiffHash: "hash-g",
        reviewTargetId: rebasedTarget.id
      }
    ]);
    storage.close();
  });

  it("skips marks without a fingerprint", () => {
    const storage = openSeeded();
    storage.markReviewed({
      lineageId: "lineage-1",
      path: "f.txt",
      projectId: project.id,
      reviewedDiffHash: "hash-f",
      reviewTargetId: reviewTarget.id
    });

    expect(storage.listLineageReviewMarks("lineage-1")).toEqual([]);
    storage.close();
  });

  it("returns the fingerprint from listReviewMarks", () => {
    const storage = openSeeded();
    storage.markReviewed({
      contentFingerprint: "fp-1",
      lineageId: "lineage-1",
      path: "f.txt",
      projectId: project.id,
      reviewedDiffHash: "hash-f",
      reviewTargetId: reviewTarget.id
    });

    expect(storage.listReviewMarks(reviewTarget.id)).toEqual([
      expect.objectContaining({ contentFingerprint: "fp-1", path: "f.txt" })
    ]);
    storage.close();
  });

  it("fills the fields when an old mark is marked again", () => {
    const storage = openSeeded();
    const mark = {
      path: "f.txt",
      projectId: project.id,
      reviewedDiffHash: "hash-1",
      reviewTargetId: reviewTarget.id
    };
    storage.markReviewed(mark);
    storage.markReviewed({ ...mark, contentFingerprint: "fp-1", lineageId: "lineage-1" });

    expect(storage.listLineageReviewMarks("lineage-1")).toHaveLength(1);
    storage.close();
  });

  it("unmark clears matching earlier marks", () => {
    const storage = seedCarriedMarks();

    expect(unmarkRebased(storage)).toEqual({ unmarked: true });
    expect(storage.listLineageReviewMarks("lineage-1")).toEqual([
      expect.objectContaining({
        contentFingerprint: "fp-2",
        reviewTargetId: rebasedTarget.id
      })
    ]);
    storage.close();
  });

  it("unmark keeps other lineages", () => {
    const storage = seedCarriedMarks();
    storage.markReviewed({
      contentFingerprint: "fp-1",
      lineageId: "lineage-2",
      path: "f.txt",
      projectId: project.id,
      reviewedDiffHash: "hash-other-lineage",
      reviewTargetId: reviewTarget.id
    });

    unmarkRebased(storage);

    expect(storage.listLineageReviewMarks("lineage-2")).toEqual([
      expect.objectContaining({ contentFingerprint: "fp-1", path: "f.txt" })
    ]);
    storage.close();
  });

  it("unmark without lineage fields behaves as before", () => {
    const storage = seedCarriedMarks();
    storage.markReviewed({
      path: "f.txt",
      projectId: project.id,
      reviewedDiffHash: "hash-current",
      reviewTargetId: rebasedTarget.id
    });

    expect(
      storage.verifyAndUnmarkReviewed({
        currentDiffHash: "hash-current",
        displayedDiffHash: "hash-current",
        path: "f.txt",
        reviewTargetId: rebasedTarget.id
      })
    ).toEqual({ unmarked: true });
    expect(storage.listReviewMarks(rebasedTarget.id)).toEqual([
      expect.objectContaining({ contentFingerprint: "fp-2", reviewedDiffHash: "hash-2" })
    ]);
    expect(storage.listLineageReviewMarks("lineage-1")).toHaveLength(2);
    storage.close();
  });

  it("verifyAndMarkReviewed stores lineage fields", () => {
    const storage = openSeeded();

    expect(
      storage.verifyAndMarkReviewed({
        contentFingerprint: "fp-1",
        currentDiffHash: "hash-1",
        displayedDiffHash: "hash-1",
        lineageId: "lineage-1",
        path: "f.txt",
        projectId: project.id,
        reviewTargetId: reviewTarget.id
      })
    ).toEqual({ marked: true });
    expect(storage.listLineageReviewMarks("lineage-1")).toEqual([
      expect.objectContaining({ contentFingerprint: "fp-1", path: "f.txt" })
    ]);
    storage.close();
  });
});

function seedCarriedMarks(): DifftrayStorage {
  const storage = openSeeded();
  storage.markReviewed({
    contentFingerprint: "fp-1",
    lineageId: "lineage-1",
    path: "f.txt",
    projectId: project.id,
    reviewedDiffHash: "hash-1",
    reviewTargetId: reviewTarget.id
  });
  storage.markReviewed({
    contentFingerprint: "fp-2",
    lineageId: "lineage-1",
    path: "f.txt",
    projectId: project.id,
    reviewedDiffHash: "hash-2",
    reviewTargetId: rebasedTarget.id
  });
  return storage;
}

function unmarkRebased(storage: DifftrayStorage) {
  return storage.verifyAndUnmarkReviewed({
    contentFingerprint: "fp-1",
    currentDiffHash: "hash-unmarked",
    displayedDiffHash: "hash-unmarked",
    lineageId: "lineage-1",
    path: "f.txt",
    reviewTargetId: rebasedTarget.id
  });
}
