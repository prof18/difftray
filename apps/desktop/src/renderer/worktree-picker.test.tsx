/** @vitest-environment jsdom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorktreePicker, middleTruncatePath } from "./worktree-picker.js";

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
          onCopyPath: vi.fn(),
          onEditLabel: vi.fn(),
          onResetLabel: vi.fn(),
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

  it("shows a custom label with the real branch and path", () => {
    act(() => {
      root.render(
        createElement(WorktreePicker, {
          onClose: vi.fn(),
          onCopyPath: vi.fn(),
          onEditLabel: vi.fn(),
          onResetLabel: vi.fn(),
          onRefresh: vi.fn(),
          onSelect: vi.fn(),
          projectName: "Repository",
          worktrees: [
            {
              ...worktree("one", "Checkout rework"),
              branchName: "codex/checkout",
              customLabel: "Checkout rework"
            },
            {
              ...worktree("two", "Detached work"),
              customLabel: "Detached work",
              shortHeadSha: "2222222"
            }
          ]
        })
      );
    });

    const rows = container.querySelectorAll<HTMLButtonElement>('[role="option"]');
    expect(rows[0]?.querySelector("strong")?.textContent).toBe("Checkout rework");
    expect(rows[0]?.textContent).toContain("codex/checkout");
    expect(rows[0]?.textContent).toContain("/workspace/one");
    expect(rows[1]?.textContent).toContain("Detached @ 2222222");
    expect(container.textContent).not.toContain("Git-recorded siblings");
  });

  it("keeps the leaf folder of long worktree paths visible", () => {
    const truncated = middleTruncatePath(
      "/private/var/folders/zw/zhy_56gn2155g5d156yh9ry40000gn/T/difftray-visual-sibling"
    );

    expect(truncated.length).toBeLessThanOrEqual(48);
    expect(truncated.endsWith("difftray-visual-sibling")).toBe(true);
    expect(truncated.startsWith("/private/")).toBe(true);
  });

  it("offers set, edit and reset display name actions", () => {
    const onEditLabel = vi.fn();
    const onResetLabel = vi.fn();
    const onSelect = vi.fn();
    const labeled = { ...worktree("two", "Label"), customLabel: "Label" };
    const worktrees = [worktree("one", "main"), labeled];

    act(() => {
      root.render(
        createElement(WorktreePicker, {
          onClose: vi.fn(),
          onCopyPath: vi.fn(),
          onEditLabel,
          onResetLabel,
          onRefresh: vi.fn(),
          onSelect,
          projectName: "Repository",
          worktrees
        })
      );
    });

    const openMenu = (index: number) => {
      const rows = container.querySelectorAll<HTMLButtonElement>('[role="option"]');
      act(() => {
        rows[index]?.dispatchEvent(
          new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
            clientX: 40,
            clientY: 60
          })
        );
      });
    };
    const menuItem = (label: string) =>
      [...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
        (button) => button.textContent === label
      );

    openMenu(0);
    expect(menuItem("Reset display name")).toBeUndefined();
    act(() => {
      menuItem("Set display name…")?.click();
    });
    expect(onEditLabel).toHaveBeenCalledWith(worktrees[0]);

    openMenu(1);
    expect(menuItem("Set display name…")).toBeUndefined();
    act(() => {
      menuItem("Edit display name…")?.click();
    });
    expect(onEditLabel).toHaveBeenLastCalledWith(labeled);

    openMenu(1);
    act(() => {
      menuItem("Reset display name")?.click();
    });
    expect(onResetLabel).toHaveBeenCalledWith(labeled);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("copies a worktree path from the row context menu", () => {
    const onCopyPath = vi.fn();
    const onSelect = vi.fn();
    const worktrees = [worktree("one", "One"), worktree("two", "Two")];

    act(() => {
      root.render(
        createElement(WorktreePicker, {
          onClose: vi.fn(),
          onCopyPath,
          onEditLabel: vi.fn(),
          onResetLabel: vi.fn(),
          onRefresh: vi.fn(),
          onSelect,
          projectName: "Repository",
          worktrees
        })
      );
    });

    const rows = container.querySelectorAll<HTMLButtonElement>('[role="option"]');
    act(() => {
      rows[1]?.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 40,
          clientY: 60
        })
      );
    });

    expect(container.querySelector('[role="menu"]')?.getAttribute("aria-label")).toBe(
      "Worktree actions for Two"
    );
    const copyPath = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent.includes("Copy path")
    );
    if (!copyPath) {
      throw new Error("Missing Copy path menu item");
    }
    act(() => {
      copyPath.click();
    });

    expect(onCopyPath).toHaveBeenCalledWith(worktrees[1]);
    expect(onSelect).not.toHaveBeenCalled();
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });

  it("consumes outside presses while dismissing the context menu", () => {
    const onSelect = vi.fn();
    const worktrees = [worktree("one", "One"), worktree("two", "Two")];

    act(() => {
      root.render(
        createElement(WorktreePicker, {
          onClose: vi.fn(),
          onCopyPath: vi.fn(),
          onEditLabel: vi.fn(),
          onResetLabel: vi.fn(),
          onRefresh: vi.fn(),
          onSelect,
          projectName: "Repository",
          worktrees
        })
      );
    });

    const rows = container.querySelectorAll<HTMLButtonElement>('[role="option"]');
    act(() => {
      rows[1]?.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 40,
          clientY: 60
        })
      );
    });

    const backdrop = container.querySelector<HTMLElement>("[data-context-menu-backdrop]");
    expect(backdrop).not.toBeNull();

    const pointerDown = new Event("pointerdown", {
      bubbles: true,
      cancelable: true
    });
    act(() => {
      backdrop?.dispatchEvent(pointerDown);
    });

    expect(pointerDown.defaultPrevented).toBe(true);
    expect(container.querySelector('[role="menu"]')).not.toBeNull();

    const click = new MouseEvent("click", {
      bubbles: true,
      cancelable: true
    });
    act(() => {
      backdrop?.dispatchEvent(click);
    });

    expect(click.defaultPrevented).toBe(true);
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
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
