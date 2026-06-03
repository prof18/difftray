import { describe, expect, it } from "vitest";

import {
  commentCountsByPath,
  commentSavePendingMatchesAnnotation,
  formatReviewCommentLocation,
  reviewCommentAnnotations,
  sameCommentSavePending,
  sortReviewComments,
  type CommentSavePending,
  type ReviewCommentDraft
} from "./review-comments.js";

describe("reviewCommentAnnotations", () => {
  it("maps saved comments and a draft to diff line annotations", () => {
    const draft = reviewDraft({ lineEnd: 12, side: "deletions" });
    const annotations = reviewCommentAnnotations({
      comments: [reviewComment("comment-1", "src/App.tsx", 7, 8)],
      draft
    });

    expect(annotations).toHaveLength(2);
    expect(annotations[0]).toMatchObject({
      lineNumber: 8,
      metadata: { kind: "comment" },
      side: "additions"
    });
    expect(annotations[1]).toMatchObject({
      lineNumber: 12,
      metadata: { kind: "draft" },
      side: "deletions"
    });
  });
});

describe("comment save pending helpers", () => {
  it("matches update and draft pending states by identity", () => {
    const draftPending = draftSavePending({ path: "src/App.tsx" });

    expect(
      sameCommentSavePending(
        { commentId: "comment-1", kind: "update" },
        { commentId: "comment-1", kind: "update" }
      )
    ).toBe(true);
    expect(
      sameCommentSavePending(draftPending, draftSavePending({ path: "src/App.tsx" }))
    ).toBe(true);
    expect(
      sameCommentSavePending(draftPending, draftSavePending({ path: "src/Other.tsx" }))
    ).toBe(false);
    expect(sameCommentSavePending(undefined, undefined)).toBe(false);
  });

  it("matches pending states against annotations", () => {
    const annotations = reviewCommentAnnotations({
      comments: [reviewComment("comment-1", "src/App.tsx", 4, 4)],
      draft: reviewDraft({ path: "src/App.tsx" })
    });
    const commentAnnotation = annotations[0];
    const draftAnnotation = annotations[1];

    if (!commentAnnotation || !draftAnnotation) {
      throw new Error("Expected comment and draft annotations.");
    }

    expect(
      commentSavePendingMatchesAnnotation(
        { commentId: "comment-1", kind: "update" },
        commentAnnotation
      )
    ).toBe(true);
    expect(
      commentSavePendingMatchesAnnotation(
        draftSavePending({ path: "src/App.tsx" }),
        draftAnnotation
      )
    ).toBe(true);
    expect(commentSavePendingMatchesAnnotation(undefined, commentAnnotation)).toBe(false);
  });
});

describe("review comment formatting and ordering", () => {
  it("formats comment line locations", () => {
    const annotations = reviewCommentAnnotations({
      comments: [
        reviewComment("comment-1", "src/App.tsx", 4, 4),
        reviewComment("comment-2", "src/App.tsx", 7, 9, "deletions")
      ],
      draft: undefined
    });
    const singleLine = annotations[0];
    const range = annotations[1];

    if (!singleLine || !range) {
      throw new Error("Expected single-line and range annotations.");
    }

    expect(formatReviewCommentLocation(singleLine)).toBe("New line 4");
    expect(formatReviewCommentLocation(range)).toBe("Old lines 7-9");
  });

  it("counts and sorts comments by path, line range, and creation time", () => {
    const comments = [
      reviewComment("late", "b.ts", 5, 5, "additions", "2026-01-02T00:00:00.000Z"),
      reviewComment("early", "b.ts", 5, 5, "additions", "2026-01-01T00:00:00.000Z"),
      reviewComment("first", "a.ts", 10, 10)
    ];

    expect([...commentCountsByPath(comments).entries()]).toEqual([
      ["b.ts", 2],
      ["a.ts", 1]
    ]);
    expect(sortReviewComments(comments).map((comment) => comment.id)).toEqual([
      "first",
      "early",
      "late"
    ]);
  });
});

function reviewDraft(patch: Partial<ReviewCommentDraft> = {}): ReviewCommentDraft {
  return {
    body: "Check this line",
    diffHash: "hash-1",
    lineEnd: 3,
    lineStart: 3,
    path: "src/App.tsx",
    side: "additions",
    ...patch
  };
}

function draftSavePending(
  patch: Partial<Extract<CommentSavePending, { readonly kind: "draft" }>> = {}
): CommentSavePending {
  return {
    diffHash: "hash-1",
    kind: "draft",
    lineEnd: 3,
    lineStart: 3,
    path: "src/App.tsx",
    side: "additions",
    ...patch
  };
}

function reviewComment(
  id: string,
  path: string,
  lineStart: number,
  lineEnd: number,
  side: ReviewCommentSide = "additions",
  createdAt = "2026-01-01T00:00:00.000Z"
): ReviewCommentView {
  return {
    body: "Looks wrong",
    createdAt,
    diffHash: "hash-1",
    id,
    lineEnd,
    lineStart,
    path,
    side,
    updatedAt: createdAt
  };
}
