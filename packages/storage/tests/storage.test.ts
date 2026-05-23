import { describe, expect, it } from "vitest";

import {
  openStorage,
  type ProjectRecord,
  type ReviewTargetRecord
} from "../src/index.js";

const project = {
  id: "project-1",
  name: "Difftray",
  path: "/tmp/difftray"
} satisfies ProjectRecord;

const reviewTarget = {
  headKind: "working_tree",
  headRefName: "main",
  headRefSha: "1111111111111111111111111111111111111111",
  id: "target-1",
  mode: "working_tree",
  projectId: project.id
} satisfies ReviewTargetRecord;

describe("storage", () => {
  it("creates and retrieves projects", () => {
    const storage = openStorage(":memory:");

    storage.upsertProject(project);

    expect(storage.getProject(project.id)).toEqual(
      expect.objectContaining({
        id: project.id,
        name: project.name,
        path: project.path
      })
    );
    expect(storage.getProjectByPath(project.path)).toEqual(
      expect.objectContaining({ id: project.id })
    );
    storage.close();
  });

  it("lists recent projects by last open time", () => {
    const storage = openStorage(":memory:");

    storage.upsertProject({
      id: "older-project",
      lastOpenedAt: "2026-01-01T00:00:00.000Z",
      name: "Older",
      path: "/tmp/older"
    });
    storage.upsertProject({
      id: "newer-project",
      lastOpenedAt: "2026-01-02T00:00:00.000Z",
      name: "Newer",
      path: "/tmp/newer"
    });

    expect(storage.listRecentProjects()).toEqual([
      expect.objectContaining({ id: "newer-project" }),
      expect.objectContaining({ id: "older-project" })
    ]);
    storage.close();
  });

  it("upserts review targets", () => {
    const storage = openStorage(":memory:");
    storage.upsertProject(project);

    storage.upsertReviewTarget(reviewTarget);
    storage.upsertReviewTarget({
      ...reviewTarget,
      headRefSha: "2222222222222222222222222222222222222222"
    });

    expect(storage.getReviewTarget(reviewTarget.id)).toEqual(
      expect.objectContaining({
        headRefSha: "2222222222222222222222222222222222222222",
        id: reviewTarget.id
      })
    );
    storage.close();
  });

  it("marks and resolves reviewed diff hashes", () => {
    const storage = openStorage(":memory:");
    storage.upsertProject(project);
    storage.upsertReviewTarget(reviewTarget);

    storage.markReviewed({
      path: "src/app.ts",
      projectId: project.id,
      reviewedDiffHash: "hash-a",
      reviewTargetId: reviewTarget.id
    });

    expect(storage.isReviewed(reviewTarget.id, "src/app.ts", "hash-a")).toBe(true);
    expect(storage.isReviewed(reviewTarget.id, "src/app.ts", "hash-b")).toBe(false);
    expect(storage.listReviewMarks(reviewTarget.id)).toEqual([
      {
        path: "src/app.ts",
        reviewedDiffHash: "hash-a",
        reviewTargetId: reviewTarget.id
      }
    ]);
    storage.close();
  });

  it("allows an old reviewed hash to become reviewed again", () => {
    const storage = openStorage(":memory:");
    storage.upsertProject(project);
    storage.upsertReviewTarget(reviewTarget);

    storage.markReviewed({
      path: "src/app.ts",
      projectId: project.id,
      reviewedDiffHash: "hash-a",
      reviewTargetId: reviewTarget.id
    });
    storage.markReviewed({
      path: "src/app.ts",
      projectId: project.id,
      reviewedDiffHash: "hash-b",
      reviewTargetId: reviewTarget.id
    });

    expect(storage.isReviewed(reviewTarget.id, "src/app.ts", "hash-a")).toBe(true);
    expect(storage.isReviewed(reviewTarget.id, "src/app.ts", "hash-b")).toBe(true);
    storage.close();
  });

  it("unmarks a reviewed diff hash", () => {
    const storage = openStorage(":memory:");
    storage.upsertProject(project);
    storage.upsertReviewTarget(reviewTarget);

    storage.markReviewed({
      path: "src/app.ts",
      projectId: project.id,
      reviewedDiffHash: "hash-a",
      reviewTargetId: reviewTarget.id
    });
    storage.unmarkReviewed(reviewTarget.id, "src/app.ts", "hash-a");

    expect(storage.isReviewed(reviewTarget.id, "src/app.ts", "hash-a")).toBe(false);
    expect(storage.listReviewMarks(reviewTarget.id)).toEqual([]);
    storage.close();
  });

  it("rejects stale displayed hashes when unmarking reviewed", () => {
    const storage = openStorage(":memory:");
    storage.upsertProject(project);
    storage.upsertReviewTarget(reviewTarget);
    storage.markReviewed({
      path: "src/app.ts",
      projectId: project.id,
      reviewedDiffHash: "new-hash",
      reviewTargetId: reviewTarget.id
    });

    const result = storage.verifyAndUnmarkReviewed({
      currentDiffHash: "new-hash",
      displayedDiffHash: "old-hash",
      path: "src/app.ts",
      reviewTargetId: reviewTarget.id
    });

    expect(result).toEqual({ unmarked: false, reason: "stale_diff" });
    expect(storage.isReviewed(reviewTarget.id, "src/app.ts", "new-hash")).toBe(true);
    storage.close();
  });

  it("unmarks reviewed when displayed and current hashes match", () => {
    const storage = openStorage(":memory:");
    storage.upsertProject(project);
    storage.upsertReviewTarget(reviewTarget);
    storage.markReviewed({
      path: "src/app.ts",
      projectId: project.id,
      reviewedDiffHash: "hash-a",
      reviewTargetId: reviewTarget.id
    });

    const result = storage.verifyAndUnmarkReviewed({
      currentDiffHash: "hash-a",
      displayedDiffHash: "hash-a",
      path: "src/app.ts",
      reviewTargetId: reviewTarget.id
    });

    expect(result).toEqual({ unmarked: true });
    expect(storage.isReviewed(reviewTarget.id, "src/app.ts", "hash-a")).toBe(false);
    storage.close();
  });

  it("rejects stale displayed hashes when marking reviewed", () => {
    const storage = openStorage(":memory:");
    storage.upsertProject(project);
    storage.upsertReviewTarget(reviewTarget);

    const result = storage.verifyAndMarkReviewed({
      currentDiffHash: "new-hash",
      displayedDiffHash: "old-hash",
      path: "src/app.ts",
      projectId: project.id,
      reviewTargetId: reviewTarget.id
    });

    expect(result).toEqual({ marked: false, reason: "stale_diff" });
    expect(storage.isReviewed(reviewTarget.id, "src/app.ts", "old-hash")).toBe(false);
    expect(storage.isReviewed(reviewTarget.id, "src/app.ts", "new-hash")).toBe(false);
    storage.close();
  });

  it("stores the current hash when displayed and current hashes match", () => {
    const storage = openStorage(":memory:");
    storage.upsertProject(project);
    storage.upsertReviewTarget(reviewTarget);

    const result = storage.verifyAndMarkReviewed({
      currentDiffHash: "hash-a",
      displayedDiffHash: "hash-a",
      path: "src/app.ts",
      projectId: project.id,
      reviewTargetId: reviewTarget.id
    });

    expect(result).toEqual({ marked: true });
    expect(storage.isReviewed(reviewTarget.id, "src/app.ts", "hash-a")).toBe(true);
    storage.close();
  });

  it("returns default project settings when no settings are stored", () => {
    const storage = openStorage(":memory:");
    storage.upsertProject(project);

    expect(storage.getProjectSettings(project.id)).toEqual({
      projectId: project.id,
      showGeneratedFiles: false
    });
    storage.close();
  });

  it("persists project settings", () => {
    const storage = openStorage(":memory:");
    storage.upsertProject(project);

    storage.upsertProjectSettings({
      editorLaunchConfig: {
        args: ["--goto", "{path}:{line}"],
        command: "code"
      },
      projectId: project.id,
      showGeneratedFiles: true
    });

    expect(storage.getProjectSettings(project.id)).toEqual({
      editorLaunchConfig: {
        args: ["--goto", "{path}:{line}"],
        command: "code"
      },
      projectId: project.id,
      showGeneratedFiles: true
    });
    storage.close();
  });
});
