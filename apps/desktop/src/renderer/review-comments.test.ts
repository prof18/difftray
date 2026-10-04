import { describe, expect, it } from "vitest";

import {
  activeReviewNote,
  commentCountsByPath,
  copyReportExpectation,
  copyReportToast,
  reportItemCount,
  sortReviewFileComments,
  commentSavePendingMatchesAnnotation,
  formatReviewCommentLocation,
  reviewCommentAnnotations,
  sameCommentSavePending,
  sortReviewComments,
  updateCommentDraftSelection,
  type CommentSelection,
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

describe("updateCommentDraftSelection", () => {
  const identity = { path: "src/App.tsx", diffHash: "hash-1" };

  it("keeps the anchor and body across clicks, normalizing each range", () => {
    let draft = updateCommentDraftSelection(
      undefined,
      identity,
      selection("click", 10, 10)
    );
    draft = updateCommentDraftSelection(draft, identity, selection("click", 15, 15));
    expect(draft).toMatchObject({ lineStart: 10, lineEnd: 15, anchorLine: 10, body: "" });
    draft = { ...draft, body: "Keep me" };
    draft = updateCommentDraftSelection(draft, identity, selection("click", 8, 8));
    expect(draft).toMatchObject({
      lineStart: 8,
      lineEnd: 10,
      anchorLine: 10,
      body: "Keep me"
    });
  });

  it("uses the raw range start as the anchor for subsequent clicks", () => {
    let draft = updateCommentDraftSelection(
      undefined,
      identity,
      selection("range", 15, 10)
    );
    expect(draft).toMatchObject({ lineStart: 10, lineEnd: 15, anchorLine: 15 });
    draft = updateCommentDraftSelection(draft, identity, selection("click", 18, 18));
    expect(draft).toMatchObject({ lineStart: 15, lineEnd: 18, anchorLine: 15 });
  });

  it("ignores opposite sides and starts fresh for a new identity", () => {
    const draft = updateCommentDraftSelection(
      { ...reviewDraft(), body: "Keep me", anchorLine: 10 },
      identity,
      selection("click", 12, 12, "deletions")
    );
    expect(draft.body).toBe("Keep me");
    expect(draft.lineStart).toBe(3);
    const fresh = updateCommentDraftSelection(
      draft,
      { ...identity, path: "other.ts" },
      selection("click", 20, 20, "deletions")
    );
    expect(fresh).toMatchObject({
      body: "",
      path: "other.ts",
      lineStart: 20,
      lineEnd: 20,
      side: "deletions",
      anchorLine: 20
    });
  });
});

function selection(
  kind: CommentSelection["kind"],
  start: number,
  end: number,
  side: ReviewCommentSide = "additions"
): CommentSelection {
  return { kind, start, end, side };
}

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

describe("file comments and review notes", () => {
  const note = {
    body: "Overall.",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z"
  };
  const dismissedNote = { ...note, dismissedAt: "2026-01-03T00:00:00.000Z" };
  const workspace = {
    comments: [
      reviewComment("line-1", "a.ts", 1, 1),
      reviewComment("line-2", "b.ts", 2, 2)
    ],
    fileComments: [fileComment("file-1", "a.ts")],
    reviewNote: note
  };

  it("counts line and file comments per path", () => {
    expect(commentCountsByPath(workspace.comments, workspace.fileComments)).toEqual(
      new Map([
        ["a.ts", 2],
        ["b.ts", 1]
      ])
    );
    expect(commentCountsByPath(workspace.comments)).toEqual(
      new Map([
        ["a.ts", 1],
        ["b.ts", 1]
      ])
    );
  });

  it("counts report items including an active note only", () => {
    expect(reportItemCount(workspace)).toBe(4);
    expect(reportItemCount({ ...workspace, reviewNote: dismissedNote })).toBe(3);
    expect(reportItemCount({ ...workspace, reviewNote: null })).toBe(3);
    expect(reportItemCount({ comments: [] })).toBe(0);
  });

  it("returns the review note only while it is not dismissed", () => {
    expect(activeReviewNote(workspace)).toBe(note);
    expect(activeReviewNote({ ...workspace, reviewNote: dismissedNote })).toBeNull();
    expect(activeReviewNote({ comments: [] })).toBeNull();
  });

  it("sorts file comments by path, then creation time", () => {
    expect(
      sortReviewFileComments([
        fileComment("late", "b.ts", "2026-01-02T00:00:00.000Z"),
        fileComment("second", "a.ts", "2026-01-02T00:00:00.000Z"),
        fileComment("first", "a.ts", "2026-01-01T00:00:00.000Z")
      ]).map((comment) => comment.id)
    ).toEqual(["first", "second", "late"]);
  });

  it("builds the copy report expectation from all comments and the active note", () => {
    expect(copyReportExpectation(workspace)).toEqual({
      expectedCommentIds: ["line-1", "line-2", "file-1"],
      expectedReviewNoteUpdatedAt: "2026-01-02T00:00:00.000Z"
    });
    expect(
      copyReportExpectation({ ...workspace, reviewNote: dismissedNote })
        .expectedReviewNoteUpdatedAt
    ).toBeNull();
  });

  it("describes the copied report", () => {
    expect(copyReportToast({ commentCount: 0, hasReviewNote: true })).toBe(
      "Copied review notes"
    );
    expect(copyReportToast({ commentCount: 1, hasReviewNote: true })).toBe(
      "Copied 1 review comment"
    );
    expect(copyReportToast({ commentCount: 3, hasReviewNote: false })).toBe(
      "Copied 3 review comments"
    );
  });
});

function fileComment(
  id: string,
  path: string,
  createdAt = "2026-01-01T00:00:00.000Z"
): ReviewFileCommentView {
  return {
    body: "Split this file.",
    createdAt,
    diffHash: "hash-1",
    id,
    path,
    updatedAt: createdAt
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
