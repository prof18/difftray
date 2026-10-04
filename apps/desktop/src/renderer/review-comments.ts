import type { DiffLineAnnotation } from "@pierre/diffs";

export type ReviewCommentDraft = {
  readonly anchorLine?: number;
  readonly body: string;
  readonly diffHash: string;
  readonly lineEnd: number;
  readonly lineStart: number;
  readonly path: string;
  readonly side: ReviewCommentSide;
};

export type CommentSelection = {
  readonly side: ReviewCommentSide;
  readonly start: number;
  readonly end: number;
  readonly kind: "click" | "range";
};

export function updateCommentDraftSelection(
  draft: ReviewCommentDraft | undefined,
  identity: { readonly path: string; readonly diffHash: string },
  selection: CommentSelection
): ReviewCommentDraft {
  const sameIdentity =
    draft?.path === identity.path && draft.diffHash === identity.diffHash;

  if (sameIdentity && draft.side !== selection.side) {
    return draft;
  }

  const anchorLine =
    selection.kind === "range"
      ? selection.start
      : sameIdentity
        ? (draft.anchorLine ?? draft.lineStart)
        : selection.start;
  const lineStart = Math.min(anchorLine, selection.end);
  const lineEnd = Math.max(anchorLine, selection.end);

  return {
    anchorLine,
    body: sameIdentity ? draft.body : "",
    diffHash: identity.diffHash,
    lineEnd,
    lineStart,
    path: identity.path,
    side: selection.side
  };
}

export type CommentSavePending =
  | {
      readonly diffHash: string;
      readonly kind: "draft";
      readonly lineEnd: number;
      readonly lineStart: number;
      readonly path: string;
      readonly side: ReviewCommentSide;
    }
  | {
      readonly commentId: string;
      readonly kind: "update";
    };

export type ReviewCommentAnnotationMetadata =
  | {
      readonly comment: ReviewCommentView;
      readonly kind: "comment";
    }
  | {
      readonly draft: ReviewCommentDraft;
      readonly kind: "draft";
    };

export function reviewCommentAnnotations({
  comments,
  draft
}: {
  readonly comments: readonly ReviewCommentView[];
  readonly draft: ReviewCommentDraft | undefined;
}): DiffLineAnnotation<ReviewCommentAnnotationMetadata>[] {
  return [
    ...comments.map((comment) => ({
      lineNumber: comment.lineEnd,
      metadata: {
        comment,
        kind: "comment" as const
      },
      side: comment.side
    })),
    ...(draft
      ? [
          {
            lineNumber: draft.lineEnd,
            metadata: {
              draft,
              kind: "draft" as const
            },
            side: draft.side
          }
        ]
      : [])
  ];
}

export function sameCommentSavePending(
  left: CommentSavePending | undefined,
  right: CommentSavePending | undefined
): boolean {
  if (left?.kind !== right?.kind || !left || !right) {
    return false;
  }

  if (left.kind === "update" && right.kind === "update") {
    return left.commentId === right.commentId;
  }

  if (left.kind !== "draft" || right.kind !== "draft") {
    return false;
  }

  return (
    left.diffHash === right.diffHash &&
    left.lineEnd === right.lineEnd &&
    left.lineStart === right.lineStart &&
    left.path === right.path &&
    left.side === right.side
  );
}

export function commentSavePendingMatchesAnnotation(
  pending: CommentSavePending | undefined,
  annotation: DiffLineAnnotation<ReviewCommentAnnotationMetadata>
): boolean {
  if (!pending) {
    return false;
  }

  const { metadata } = annotation;

  if (metadata.kind === "comment") {
    return pending.kind === "update" && pending.commentId === metadata.comment.id;
  }

  return (
    pending.kind === "draft" &&
    pending.diffHash === metadata.draft.diffHash &&
    pending.lineEnd === metadata.draft.lineEnd &&
    pending.lineStart === metadata.draft.lineStart &&
    pending.path === metadata.draft.path &&
    pending.side === metadata.draft.side
  );
}

export function formatReviewCommentLocation(
  annotation: DiffLineAnnotation<ReviewCommentAnnotationMetadata>
): string {
  const lineStart =
    annotation.metadata.kind === "draft"
      ? annotation.metadata.draft.lineStart
      : annotation.metadata.comment.lineStart;
  const lineEnd =
    annotation.metadata.kind === "draft"
      ? annotation.metadata.draft.lineEnd
      : annotation.metadata.comment.lineEnd;
  const side = annotation.side === "additions" ? "New" : "Old";
  const lineLabel = lineStart === lineEnd ? "line" : "lines";
  const lineRange =
    lineStart === lineEnd ? String(lineStart) : `${String(lineStart)}-${String(lineEnd)}`;

  return `${side} ${lineLabel} ${lineRange}`;
}

export function commentCountsByPath(
  comments: readonly ReviewCommentView[],
  fileComments: readonly ReviewFileCommentView[] = []
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();

  for (const comment of [...comments, ...fileComments]) {
    counts.set(comment.path, (counts.get(comment.path) ?? 0) + 1);
  }

  return counts;
}

export type ReviewFeedbackWorkspace = Pick<ReviewWorkspaceView, "comments"> &
  Partial<Pick<ReviewWorkspaceView, "fileComments" | "reviewNote">>;

export function activeReviewNote(
  workspace: ReviewFeedbackWorkspace
): ReviewNoteView | null {
  const note = workspace.reviewNote ?? null;

  return note && !note.dismissedAt ? note : null;
}

export function reportItemCount(workspace: ReviewFeedbackWorkspace): number {
  return (
    workspace.comments.length +
    (workspace.fileComments?.length ?? 0) +
    (activeReviewNote(workspace) ? 1 : 0)
  );
}

export function copyReportExpectation(workspace: ReviewFeedbackWorkspace): {
  readonly expectedCommentIds: readonly string[];
  readonly expectedReviewNoteUpdatedAt: string | null;
} {
  return {
    expectedCommentIds: [
      ...workspace.comments.map((comment) => comment.id),
      ...(workspace.fileComments ?? []).map((comment) => comment.id)
    ],
    expectedReviewNoteUpdatedAt: activeReviewNote(workspace)?.updatedAt ?? null
  };
}

export function copyReportToast(result: {
  readonly commentCount: number;
  readonly hasReviewNote: boolean;
}): string {
  if (result.commentCount === 0 && result.hasReviewNote) {
    return "Copied review notes";
  }

  return result.commentCount === 1
    ? "Copied 1 review comment"
    : `Copied ${String(result.commentCount)} review comments`;
}

export function sortReviewFileComments(
  comments: readonly ReviewFileCommentView[]
): readonly ReviewFileCommentView[] {
  return [...comments].sort(
    (left, right) =>
      left.path.localeCompare(right.path) || left.createdAt.localeCompare(right.createdAt)
  );
}

export function sortReviewComments(
  comments: readonly ReviewCommentView[]
): readonly ReviewCommentView[] {
  return [...comments].sort((left, right) => {
    const pathCompare = left.path.localeCompare(right.path);

    if (pathCompare !== 0) {
      return pathCompare;
    }

    if (left.lineStart !== right.lineStart) {
      return left.lineStart - right.lineStart;
    }

    if (left.lineEnd !== right.lineEnd) {
      return left.lineEnd - right.lineEnd;
    }

    return left.createdAt.localeCompare(right.createdAt);
  });
}

export function commentEditorShortcut(event: {
  readonly ctrlKey: boolean;
  readonly key: string;
  readonly metaKey: boolean;
  readonly nativeEvent: { readonly isComposing: boolean };
}): "cancel" | "save" | null {
  if (event.nativeEvent.isComposing) {
    return null;
  }

  if (event.key === "Escape") {
    return "cancel";
  }

  return event.key === "Enter" && (event.metaKey || event.ctrlKey) ? "save" : null;
}

export function growingTextareaRows(
  body: string,
  minRows: number,
  maxRows: number
): number {
  return Math.min(maxRows, Math.max(minRows, body.split("\n").length));
}

/** Mirrors core's note scope: commit SHAs are ignored unless HEAD is detached. */
export function reviewNoteScopeKey(
  projectId: string,
  target: ReviewWorkspaceView["reviewTarget"]
): string {
  const head = target.headRefName ?? `detached:${target.headSha}`;

  switch (target.kind) {
    case "branch":
      return JSON.stringify([projectId, target.kind, target.baseRefName ?? null, head]);
    case "commit":
      return JSON.stringify([projectId, target.kind, target.commitSha ?? target.headSha]);
    case "working_tree":
      return JSON.stringify([projectId, target.kind, head]);
  }
}

/** True when focus fell back to the page, e.g. because the focused editor unmounted. */
export function isFocusLost(): boolean {
  return document.activeElement === null || document.activeElement === document.body;
}
