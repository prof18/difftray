/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReviewCommentAnnotation } from "./review-comment-annotation.js";
import { reviewCommentAnnotations, type ReviewCommentDraft } from "./review-comments.js";

describe("ReviewCommentAnnotation keyboard shortcuts", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it.each([
    ["Command", { metaKey: true }],
    ["Control", { ctrlKey: true }]
  ])("saves a draft with %s+Enter", async (_modifier, modifier) => {
    const onSaveDraft = vi.fn(() => Promise.resolve(true));
    renderAnnotation({ onSaveDraft });

    const keydown = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Enter",
      ...modifier
    });

    await act(async () => {
      textarea().dispatchEvent(keydown);
      await Promise.resolve();
    });

    expect(keydown.defaultPrevented).toBe(true);
    expect(onSaveDraft).toHaveBeenCalledOnce();
  });

  it("keeps plain Enter available for multiline comments", () => {
    const onSaveDraft = vi.fn(() => Promise.resolve(true));
    renderAnnotation({ onSaveDraft });

    const keydown = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Enter"
    });

    act(() => {
      textarea().dispatchEvent(keydown);
    });

    expect(keydown.defaultPrevented).toBe(false);
    expect(onSaveDraft).not.toHaveBeenCalled();
  });

  it("does not save while an input method is composing text", () => {
    const onSaveDraft = vi.fn(() => Promise.resolve(true));
    renderAnnotation({ onSaveDraft });

    const keydown = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      isComposing: true,
      key: "Enter"
    });

    act(() => {
      textarea().dispatchEvent(keydown);
    });

    expect(keydown.defaultPrevented).toBe(false);
    expect(onSaveDraft).not.toHaveBeenCalled();
  });

  it("saves an edited comment with Control+Enter", async () => {
    const onUpdateComment = vi.fn(() => Promise.resolve(true));
    renderAnnotation({
      annotation: commentAnnotation(reviewComment()),
      onUpdateComment
    });

    act(() => {
      editButton().click();
    });
    changeTextareaBody("Updated comment body");

    await act(async () => {
      textarea().dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          ctrlKey: true,
          key: "Enter"
        })
      );
      await Promise.resolve();
    });

    expect(onUpdateComment).toHaveBeenCalledWith("comment-1", "Updated comment body");
    expect(container.querySelector("textarea")).toBeNull();
  });

  function renderAnnotation(
    patch: Partial<React.ComponentProps<typeof ReviewCommentAnnotation>> = {}
  ): void {
    act(() => {
      root.render(
        <ReviewCommentAnnotation
          annotation={draftAnnotation(reviewDraft())}
          onCancelDraft={vi.fn()}
          onDeleteComment={vi.fn()}
          onDraftBodyChange={vi.fn()}
          onSaveDraft={vi.fn(() => Promise.resolve(true))}
          onUpdateComment={vi.fn(() => Promise.resolve(true))}
          saving={false}
          showSaving={false}
          {...patch}
        />
      );
    });
  }

  function textarea(): HTMLTextAreaElement {
    const element = container.querySelector("textarea");
    if (!(element instanceof HTMLTextAreaElement)) {
      throw new Error("Missing review comment textarea");
    }
    return element;
  }

  function changeTextareaBody(body: string): void {
    const element = textarea();
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    )?.set?.bind(element);

    if (!valueSetter) {
      throw new Error("Missing textarea value setter");
    }

    act(() => {
      valueSetter(body);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  function editButton(): HTMLButtonElement {
    const element = container.querySelector('[aria-label="Edit review comment"]');
    if (!(element instanceof HTMLButtonElement)) {
      throw new Error("Missing edit review comment button");
    }
    return element;
  }
});

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
