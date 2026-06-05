import type { ReviewProgress, ReviewTarget } from "@difftray/core";
import type { ReviewCommentRecord, StoredProjectRecord } from "@difftray/storage";

import {
  projectReviewSummaryView,
  projectView,
  reviewCommentView,
  reviewFileView,
  type FileReviewStateWithSummary,
  type ReviewCommentView,
  type ReviewWorkspaceView
} from "./view-models.js";

export type ReviewWorkspaceViewInput = {
  readonly comments: readonly ReviewCommentRecord[];
  readonly files: readonly FileReviewStateWithSummary[];
  readonly progress: ReviewProgress;
  readonly project: StoredProjectRecord;
  readonly reviewTarget: ReviewTarget;
  readonly reviewTargetId: string;
};

export function reviewWorkspaceView({
  comments,
  files,
  progress,
  project,
  reviewTarget,
  reviewTargetId
}: ReviewWorkspaceViewInput): ReviewWorkspaceView {
  const reviewSummary = projectReviewSummaryView(files, progress);

  return {
    comments: activeReviewCommentViews(reviewTargetId, files, comments),
    files: files.map((file) => reviewFileView(file)),
    progress,
    project: projectView(project, reviewSummary),
    reviewTarget: {
      ...(reviewTarget.kind === "branch"
        ? { baseRefName: reviewTarget.baseRefName }
        : {}),
      ...(reviewTarget.kind === "commit"
        ? {
            commitSha: reviewTarget.commitSha,
            commitShortSha: reviewTarget.commitShortSha,
            ...(reviewTarget.commitSubject
              ? { commitSubject: reviewTarget.commitSubject }
              : {})
          }
        : {}),
      ...(reviewTarget.kind !== "commit" && reviewTarget.headRefName
        ? { headRefName: reviewTarget.headRefName }
        : {}),
      headSha: reviewTarget.headSha,
      id: reviewTargetId,
      kind: reviewTarget.kind
    }
  };
}

export function activeReviewCommentViews(
  reviewTargetId: string,
  files: readonly FileReviewStateWithSummary[],
  comments: readonly ReviewCommentRecord[]
): readonly ReviewCommentView[] {
  const activeDiffHashByPath = new Map(
    files.map((file) => [file.state.path, file.state.diffHash])
  );

  return comments
    .filter(
      (comment) =>
        comment.reviewTargetId === reviewTargetId &&
        activeDiffHashByPath.get(comment.path) === comment.diffHash
    )
    .map(reviewCommentView);
}
