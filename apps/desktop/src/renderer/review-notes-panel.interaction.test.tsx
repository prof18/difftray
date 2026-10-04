/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReviewNotesPanel, type ReviewNotesPanelProps } from "./review-notes-panel.js";

const note = {
  body: "Keep the public API stable.",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z"
};

describe("ReviewNotesPanel interactions", () => {
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
    vi.restoreAllMocks();
  });

  it("saves the typed body with Command+Enter", () => {
    const onSave = vi.fn();
    renderPanel({ editing: true, onSave });

    changeTextareaBody("Prefer small commits.\nKeep tests green.");
    pressKey("Enter", { metaKey: true });

    expect(onSave).toHaveBeenCalledWith("Prefer small commits.\nKeep tests green.");
  });

  it("starts editing from the existing note body", () => {
    renderPanel({ editing: true, note });

    expect(textarea().value).toBe("Keep the public API stable.");
  });

  it("cancels editing with Escape", () => {
    const onCancelEdit = vi.fn();
    renderPanel({ editing: true, onCancelEdit });

    pressKey("Escape");

    expect(onCancelEdit).toHaveBeenCalledOnce();
  });

  it("ignores saves with an empty body", () => {
    const onSave = vi.fn();
    renderPanel({ editing: true, onSave });

    changeTextareaBody("   ");
    pressKey("Enter", { ctrlKey: true });

    expect(onSave).not.toHaveBeenCalled();
  });

  it("dismisses and restores the note", () => {
    const onSetDismissed = vi.fn();
    renderPanel({ note, onSetDismissed });

    act(() => {
      button('[aria-label="Dismiss review notes"]').click();
    });
    expect(onSetDismissed).toHaveBeenLastCalledWith(true);

    renderPanel({
      note: { ...note, dismissedAt: "2026-01-03T00:00:00.000Z" },
      onSetDismissed
    });
    act(() => {
      buttonWithText("Restore").click();
    });
    expect(onSetDismissed).toHaveBeenLastCalledWith(false);
  });

  it("deletes only after the prompt is confirmed", () => {
    const onDelete = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    renderPanel({ note, onDelete });

    act(() => {
      button('[aria-label="Delete review notes"]').click();
    });
    expect(onDelete).not.toHaveBeenCalled();

    confirm.mockReturnValueOnce(true);
    act(() => {
      button('[aria-label="Delete review notes"]').click();
    });
    expect(confirm).toHaveBeenCalledWith("Delete review notes? This can't be undone.");
    expect(onDelete).toHaveBeenCalledOnce();
  });

  function renderPanel(patch: Partial<ReviewNotesPanelProps> = {}): void {
    act(() => {
      root.render(
        <ReviewNotesPanel
          editing={false}
          note={null}
          onCancelEdit={vi.fn()}
          onDelete={vi.fn()}
          onSave={vi.fn()}
          onSetDismissed={vi.fn()}
          onStartEdit={vi.fn()}
          pending={false}
          {...patch}
        />
      );
    });
  }

  function textarea(): HTMLTextAreaElement {
    const element = container.querySelector("textarea");
    if (!(element instanceof HTMLTextAreaElement)) {
      throw new Error("Missing review notes textarea");
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

  function buttonWithText(text: string): HTMLButtonElement {
    const element = [...container.querySelectorAll("button")].find((candidate) =>
      candidate.textContent.includes(text)
    );
    if (!element) {
      throw new Error(`Missing button ${text}`);
    }
    return element;
  }
});
