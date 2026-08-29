/** @vitest-environment jsdom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorktreePicker } from "./worktree-picker.js";

describe("WorktreePicker", () => {
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

  it("scrolls the active row into view during keyboard navigation", () => {
    const worktrees = [
      worktree("one", "One"),
      worktree("two", "Two"),
      worktree("three", "Three")
    ];
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    act(() => {
      root.render(
        createElement(WorktreePicker, {
          onClose: vi.fn(),
          onRefresh: vi.fn(),
          onSelect: vi.fn(),
          projectName: "Repository",
          worktrees
        })
      );
    });
    scrollIntoView.mockClear();

    const results = container.querySelector<HTMLElement>('[role="listbox"]');
    act(() => {
      results?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" })
      );
    });

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
    expect(container.querySelector('[data-selected="true"]')?.textContent).toContain(
      "Two"
    );
  });
});

function worktree(id: string, displayName: string): RepositoryWorktreeView {
  return {
    displayName,
    displayPath: `/workspace/${id}`,
    id,
    locked: false,
    state: "available"
  };
}
