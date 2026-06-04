import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ReviewCommentAnnotation } from "./review-comment-annotation.js";
import { reviewCommentAnnotations, type ReviewCommentDraft } from "./review-comments.js";

describe("ReviewCommentAnnotation", () => {
  it("renders saved comment content and edit controls", () => {
    const html = renderToStaticMarkup(
      <ReviewCommentAnnotation
        {...props()}
        annotation={commentAnnotation(
          reviewComment({
            body: "Extract this carefully",
            lineEnd: 12,
            lineStart: 10,
            side: "deletions"
          })
        )}
      />
    );

    expect(html).toContain("Old lines 10-12");
    expect(html).toContain("Extract this carefully");
    expect(html).toContain('aria-label="Edit review comment"');
    expect(html).toContain('aria-label="Delete review comment"');
  });

  it("renders draft editing controls with the draft body", () => {
    const html = renderToStaticMarkup(
      <ReviewCommentAnnotation
        {...props()}
        annotation={draftAnnotation(
          reviewDraft({
            body: "Need a narrower extraction",
            lineStart: 4,
            lineEnd: 4
          })
        )}
      />
    );

    expect(html).toContain('data-draft="true"');
    expect(html).toContain("New line 4");
    expect(html).toContain('aria-label="Review comment"');
    expect(html).toContain("Need a narrower extraction");
    expect(html).toContain("Cancel");
    expect(html).toContain("Save");
  });

  it("renders saving state for a pending draft", () => {
    const html = renderToStaticMarkup(
      <ReviewCommentAnnotation
        {...props({
          saving: true,
          showSaving: true
        })}
        annotation={draftAnnotation(reviewDraft())}
      />
    );

    expect(html).toContain("Saving");
    expect(html).toContain('disabled=""');
  });
});

function props(
  patch: Partial<React.ComponentProps<typeof ReviewCommentAnnotation>> = {}
): React.ComponentProps<typeof ReviewCommentAnnotation> {
  return {
    annotation: draftAnnotation(reviewDraft()),
    onCancelDraft: vi.fn(),
    onDeleteComment: vi.fn(),
    onDraftBodyChange: vi.fn(),
    onSaveDraft: vi.fn(() => Promise.resolve(true)),
    onUpdateComment: vi.fn(() => Promise.resolve(true)),
    saving: false,
    showSaving: false,
    ...patch
  };
}

function commentAnnotation(comment: ReviewCommentView) {
  const [annotation] = reviewCommentAnnotations({
    comments: [comment],
    draft: undefined
  });

  if (!annotation) {
    throw new Error("Expected a comment annotation.");
  }

  return annotation;
}

function draftAnnotation(draft: ReviewCommentDraft) {
  const [annotation] = reviewCommentAnnotations({
    comments: [],
    draft
  });

  if (!annotation) {
    throw new Error("Expected a draft annotation.");
  }

  return annotation;
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

function reviewComment(patch: Partial<ReviewCommentView> = {}): ReviewCommentView {
  const createdAt = "2026-01-01T00:00:00.000Z";

  return {
    body: "Looks wrong",
    createdAt,
    diffHash: "hash-1",
    id: "comment-1",
    lineEnd: 3,
    lineStart: 3,
    path: "src/App.tsx",
    side: "additions",
    updatedAt: createdAt,
    ...patch
  };
}
