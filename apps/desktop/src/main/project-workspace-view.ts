import {
  createReviewNoteScopeId,
  type ReviewProgress,
  type ReviewTarget
} from "@difftray/core";
import type {
  ReviewCommentRecord,
  ReviewFileCommentRecord,
  ReviewNoteRecord,
  StoredProjectRecord
} from "@difftray/storage";

import {
  projectReviewSummaryView,
  projectView,
  reviewCommentView,
  reviewFileCommentView,
  reviewFileView,
  reviewNoteView,
  type FileReviewStateWithSummary,
  type ReviewCommentView,
  type ReviewFileCommentView,
  type ReviewWorkspaceView
} from "./view-models.js";

export type ReviewWorkspaceViewInput = {
  readonly comments: readonly ReviewCommentRecord[];
  readonly fileComments: readonly ReviewFileCommentRecord[];
  readonly files: readonly FileReviewStateWithSummary[];
  readonly progress: ReviewProgress;
  readonly project: StoredProjectRecord;
  readonly reviewNote: ReviewNoteRecord | null;
  readonly reviewTarget: ReviewTarget;
  readonly reviewTargetId: string;
};

export function reviewWorkspaceView({
  comments,
  fileComments,
  files,
  progress,
  project,
  reviewNote,
  reviewTarget,
  reviewTargetId
}: ReviewWorkspaceViewInput): ReviewWorkspaceView {
  const reviewSummary = projectReviewSummaryView(files, progress);

  return {
    comments: activeReviewCommentViews(reviewTargetId, files, comments),
    fileComments: activeReviewFileCommentViews(reviewTargetId, files, fileComments),
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
    },
    reviewNote:
      reviewNote?.scopeId === createReviewNoteScopeId(reviewTarget)
        ? reviewNoteView(reviewNote)
        : null
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

export function activeReviewFileCommentViews(
  reviewTargetId: string,
  files: readonly FileReviewStateWithSummary[],
  fileComments: readonly ReviewFileCommentRecord[]
): readonly ReviewFileCommentView[] {
  const activeDiffHashByPath = new Map(
    files.map((file) => [file.state.path, file.state.diffHash])
  );

  return fileComments
    .filter(
      (comment) =>
        comment.reviewTargetId === reviewTargetId &&
        activeDiffHashByPath.get(comment.path) === comment.diffHash
    )
    .map(reviewFileCommentView);
}
