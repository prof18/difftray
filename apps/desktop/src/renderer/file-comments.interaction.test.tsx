/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FileCommentStack, type FileCommentStackProps } from "./file-comments.js";

describe("FileCommentStack interactions", () => {
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

  it("focuses the draft and saves it with Command+Enter", async () => {
    const onSaveDraft = vi.fn();
    renderStack({ draft: { body: "Split this file." }, onSaveDraft });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(document.activeElement).toBe(textarea());
    pressKey("Enter", { metaKey: true });

    expect(onSaveDraft).toHaveBeenCalledOnce();
  });

  it("cancels the draft with Escape", () => {
    const onCancelDraft = vi.fn();
    renderStack({ draft: { body: "" }, onCancelDraft });

    pressKey("Escape");

    expect(onCancelDraft).toHaveBeenCalledOnce();
  });

  it("does not save an empty draft", () => {
    const onSaveDraft = vi.fn();
    renderStack({ draft: { body: "  " }, onSaveDraft });

    pressKey("Enter", { ctrlKey: true });

    expect(onSaveDraft).not.toHaveBeenCalled();
  });

  it("updates an edited card with Control+Enter", async () => {
    const onUpdate = vi.fn(() => Promise.resolve(true));
    renderStack({ comments: [fileComment()], onUpdate });

    act(() => {
      button('[aria-label="Edit file comment"]').click();
    });
    changeTextareaBody("Rewrite this module.");
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

    expect(onUpdate).toHaveBeenCalledWith("file-comment-1", "Rewrite this module.");
    expect(container.querySelector("textarea")).toBeNull();
  });

  it("keeps the inline editor open when the update fails", async () => {
    const onUpdate = vi.fn(() => Promise.resolve(false));
    renderStack({ comments: [fileComment()], onUpdate });

    act(() => {
      button('[aria-label="Edit file comment"]').click();
    });
    changeTextareaBody("Keep this text.");
    await act(async () => {
      textarea().dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Enter",
          metaKey: true
        })
      );
      await Promise.resolve();
    });

    expect(onUpdate).toHaveBeenCalledOnce();
    expect(textarea().value).toBe("Keep this text.");
  });

  it("deletes a card", () => {
    const onDelete = vi.fn();
    renderStack({ comments: [fileComment()], onDelete });

    act(() => {
      button('[aria-label="Delete file comment"]').click();
    });

    expect(onDelete).toHaveBeenCalledWith("file-comment-1");
  });

  function renderStack(patch: Partial<FileCommentStackProps> = {}): void {
    act(() => {
      root.render(
        <FileCommentStack
          comments={[]}
          draft={undefined}
          onCancelDraft={vi.fn()}
          onDelete={vi.fn()}
          onDraftBodyChange={vi.fn()}
          onSaveDraft={vi.fn()}
          onUpdate={vi.fn()}
          pending={false}
          {...patch}
        />
      );
    });
  }

  function textarea(): HTMLTextAreaElement {
    const element = container.querySelector("textarea");
    if (!(element instanceof HTMLTextAreaElement)) {
      throw new Error("Missing file comment textarea");
    }
    return element;
  }

  function pressKey(key: string, modifier: KeyboardEventInit = {}): void {
    act(() => {
      textarea().dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key,
          ...modifier
        })
      );
    });
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

  function button(selector: string): HTMLButtonElement {
    const element = container.querySelector(selector);
    if (!(element instanceof HTMLButtonElement)) {
      throw new Error(`Missing button ${selector}`);
    }
    return element;
  }
});

function fileComment(): ReviewFileCommentView {
  return {
    body: "Split this file.",
    createdAt: "2026-01-01T00:00:00.000Z",
    diffHash: "hash-1",
    id: "file-comment-1",
    path: "src/App.tsx",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}
