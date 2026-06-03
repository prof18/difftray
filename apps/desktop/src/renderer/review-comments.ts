import type { DiffLineAnnotation } from "@pierre/diffs";

export type ReviewCommentDraft = {
  readonly body: string;
  readonly diffHash: string;
  readonly lineEnd: number;
  readonly lineStart: number;
  readonly path: string;
  readonly side: ReviewCommentSide;
};

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
  comments: readonly ReviewCommentView[]
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();

  for (const comment of comments) {
    counts.set(comment.path, (counts.get(comment.path) ?? 0) + 1);
  }

  return counts;
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
