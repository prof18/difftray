import {
  createContentFingerprint,
  createReviewLineageId,
  createReviewTargetId,
  type FileDiff,
  type ReviewTarget
} from "@difftray/core";
import { openStorage, type DifftrayStorage } from "@difftray/storage";
import { afterEach, describe, expect, it } from "vitest";

import {
  invalidatedAfterUnmark,
  listCarryOverMarks,
  reviewMarkLineageFields
} from "./review-mark-lineage.js";
import { reviewTargetRecord } from "./view-models.js";

const before = {
  baseRefName: "origin/main",
  baseSha: "2222222222222222222222222222222222222222",
  headRefName: "feature/review",
  headSha: "3333333333333333333333333333333333333333",
  kind: "branch",
  mergeBaseSha: "4444444444444444444444444444444444444444",
  projectId: "project-a"
} satisfies ReviewTarget;

const after = {
  ...before,
  baseSha: "7777777777777777777777777777777777777777",
  headSha: "8888888888888888888888888888888888888888",
  mergeBaseSha: "9999999999999999999999999999999999999999"
} satisfies ReviewTarget;

const commitTarget = {
  commitSha: "6666666666666666666666666666666666666666",
  commitShortSha: "6666666",
  headSha: "6666666666666666666666666666666666666666",
  kind: "commit",
  parentSha: "5555555555555555555555555555555555555555",
  projectId: "project-a"
} satisfies ReviewTarget;

const diff = {
  content: { kind: "text", patch: "@@ -1 +1 @@\n-old\n+new\n" },
  newPath: "f.txt",
  status: "modified"
} satisfies FileDiff;

const beforeId = createReviewTargetId(before);
const afterId = createReviewTargetId(after);
const stores: DifftrayStorage[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
});

function seededStorage(): DifftrayStorage {
  const storage = openStorage(":memory:");
  stores.push(storage);
  storage.upsertProject({ id: "project-a", name: "Project A", path: "/work/project-a" });
  storage.upsertReviewTarget(reviewTargetRecord(beforeId, before));
  storage.upsertReviewTarget(reviewTargetRecord(afterId, after));
  return storage;
}

describe("review mark lineage helpers", () => {
  it("has no lineage fields for a commit target", () => {
    expect(reviewMarkLineageFields(commitTarget, diff)).toEqual({});
  });

  it("returns lineage fields for a branch target", () => {
    expect(reviewMarkLineageFields(before, diff)).toEqual({
      contentFingerprint: createContentFingerprint(diff),
      lineageId: createReviewLineageId(before)
    });
  });

  it("lists carry-over marks of the same lineage", () => {
    const storage = seededStorage();
    storage.markReviewed({
      ...reviewMarkLineageFields(before, diff),
      path: "f.txt",
      projectId: "project-a",
      reviewedDiffHash: "hash-before",
      reviewTargetId: beforeId
    });

    expect(listCarryOverMarks(storage, after)).toEqual([
      {
        contentFingerprint: createContentFingerprint(diff),
        path: "f.txt",
        reviewedDiffHash: "hash-before",
        reviewTargetId: beforeId
      }
    ]);
    expect(listCarryOverMarks(storage, commitTarget)).toEqual([]);
  });

  it("reports invalidated after unmark when an earlier mark remains", () => {
    const storage = seededStorage();
    const otherDiff = {
      ...diff,
      content: { kind: "text", patch: "@@ -1 +1 @@\n-old\n+other\n" }
    } satisfies FileDiff;
    storage.markReviewed({
      ...reviewMarkLineageFields(before, otherDiff),
      path: "f.txt",
      projectId: "project-a",
      reviewedDiffHash: "hash-before",
      reviewTargetId: beforeId
    });

    expect(invalidatedAfterUnmark(storage, after, afterId, "f.txt", "hash-now")).toBe(
      true
    );
    expect(invalidatedAfterUnmark(storage, after, afterId, "g.txt", "hash-now")).toBe(
      false
    );
  });
});
