import {
  createContentFingerprint,
  createReviewLineageId,
  type FileDiff,
  type ReviewMark,
  type ReviewTarget
} from "@difftray/core";
import type { DifftrayStorage } from "@difftray/storage";

export type ReviewMarkLineageFields = {
  readonly contentFingerprint?: string;
  readonly lineageId?: string;
};

type MarkReader = Pick<DifftrayStorage, "listLineageReviewMarks" | "listReviewMarks">;
type MarkPruner = MarkReader & Pick<DifftrayStorage, "deleteLineageReviewMarks">;

/**
 * Lists the earlier marks of the target's lineage that can still carry over,
 * and deletes the ones whose file has left the current diff. A review carries
 * over only while its file stays in the diff: once a reviewed change is
 * committed or reverted, a later edit to that file is new work, not a change
 * to the reviewed one. Only marks written before `loadStartedAt` are deleted,
 * so a mark stored while this load read Git survives.
 */
export function pruneCarryOverMarks(
  storage: MarkPruner,
  target: ReviewTarget,
  reviewTargetId: string,
  diffPaths: ReadonlySet<string>,
  loadStartedAt: string
): readonly ReviewMark[] {
  const lineageId = createReviewLineageId(target);
  if (!lineageId) return [];

  const marks = storage.listLineageReviewMarks(lineageId);
  const gone = new Set<string>();
  for (const mark of marks) {
    if (mark.reviewTargetId !== reviewTargetId && !diffPaths.has(mark.path)) {
      gone.add(mark.path);
    }
  }
  if (gone.size === 0) return marks;

  storage.deleteLineageReviewMarks(lineageId, [...gone], reviewTargetId, loadStartedAt);
  return marks.filter(
    (mark) => mark.reviewTargetId === reviewTargetId || !gone.has(mark.path)
  );
}

export function reviewMarkLineageFields(
  target: ReviewTarget,
  diff: FileDiff
): ReviewMarkLineageFields {
  const lineageId = createReviewLineageId(target);
  return lineageId
    ? { contentFingerprint: createContentFingerprint(diff), lineageId }
    : {};
}

export function listCarryOverMarks(
  storage: MarkReader,
  target: ReviewTarget
): readonly ReviewMark[] {
  const lineageId = createReviewLineageId(target);
  return lineageId ? storage.listLineageReviewMarks(lineageId) : [];
}

export function invalidatedAfterUnmark(
  storage: MarkReader,
  target: ReviewTarget,
  reviewTargetId: string,
  path: string,
  diffHash: string
): boolean {
  return (
    storage
      .listReviewMarks(reviewTargetId)
      .some((mark) => mark.path === path && mark.reviewedDiffHash !== diffHash) ||
    listCarryOverMarks(storage, target).some((mark) => mark.path === path)
  );
}
