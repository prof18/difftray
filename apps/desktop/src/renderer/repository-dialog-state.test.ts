/** @vitest-environment jsdom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DroppedRepositoryPreview } from "./dropped-repository-preview.js";
import { WorktreePicker } from "./worktree-picker.js";
import { isGlobalShortcutTarget } from "./App.js";

describe("repository dialog state", () => {
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
    act(() => root.unmount());
    container.remove();
  });

  it("clamps the selected worktree when a refresh removes rows", () => {
    const worktrees = [worktree("one"), worktree("two"), worktree("three")];
    const onSelect = vi.fn();
    const renderPicker = (items: readonly RepositoryWorktreeView[]) =>
      createElement(WorktreePicker, {
        onClose: vi.fn(),
        onRefresh: vi.fn(),
        onSelect,
        projectName: "Difftray",
        worktrees: items
      });

    act(() => root.render(renderPicker(worktrees)));
    const dialog = container.querySelector<HTMLElement>('[role="dialog"]');
    const rows = container.querySelectorAll<HTMLButtonElement>('[data-kind="project"]');
    act(() => {
      rows[1]?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(container.querySelector('[data-selected="true"]')?.textContent).toContain(
      "two"
    );
    act(() => {
      dialog?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" })
      );
    });
    act(() => root.render(renderPicker(worktrees.slice(0, 2))));

    expect(container.querySelector('[data-selected="true"]')?.textContent).toContain(
      "two"
    );
    act(() => {
      dialog?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Enter" })
      );
    });
    expect(onSelect).toHaveBeenCalledWith(worktrees[1]);
  });

  it("does not intercept Enter from worktree header actions", () => {
    const onRefresh = vi.fn();
    const onSelect = vi.fn();
    act(() => {
      root.render(
        createElement(WorktreePicker, {
          onClose: vi.fn(),
          onRefresh,
          onSelect,
          projectName: "Difftray",
          worktrees: [worktree("one")]
        })
      );
    });
    const refresh = container.querySelector<HTMLButtonElement>(
      '[aria-label="Refresh worktrees"]'
    );
    const enter = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Enter"
    });

    act(() => {
      refresh?.dispatchEvent(enter);
    });

    expect(enter.defaultPrevented).toBe(false);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("resets dropped-folder selection when a new preview replaces the candidates", () => {
    const onOpen = vi.fn();
    const first = [candidate("one"), candidate("two")];
    const second = [candidate("three"), candidate("four")];
    const renderPreview = (candidates: readonly DroppedRepositoryPreviewView[]) =>
      createElement(DroppedRepositoryPreview, {
        candidates,
        onCancel: vi.fn(),
        onOpen
      });

    act(() => root.render(renderPreview(first)));
    act(() => {
      [...container.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent?.includes("one"))
        ?.click();
    });
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toContain(
      "1 selected"
    );

    act(() => root.render(renderPreview(second)));
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toContain(
      "2 selected"
    );
    act(() => {
      [...container.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent?.includes("Open 2 repositories"))
        ?.click();
    });
    expect(onOpen).toHaveBeenCalledWith(["three", "four"], false);
  });

  it("does not treat focused controls as global shortcut targets", () => {
    const button = document.createElement("button");
    const icon = document.createElement("span");
    const menu = document.createElement("div");
    menu.setAttribute("role", "menuitem");
    button.append(icon);

    expect(isGlobalShortcutTarget(button)).toBe(true);
    expect(isGlobalShortcutTarget(icon)).toBe(true);
    expect(isGlobalShortcutTarget(menu)).toBe(true);
    const listbox = document.createElement("div");
    listbox.setAttribute("role", "listbox");
    expect(isGlobalShortcutTarget(listbox)).toBe(true);
    const focusable = document.createElement("div");
    focusable.tabIndex = 0;
    expect(isGlobalShortcutTarget(focusable)).toBe(true);
    const unfocusable = document.createElement("div");
    unfocusable.tabIndex = -1;
    expect(isGlobalShortcutTarget(unfocusable)).toBe(false);
    expect(isGlobalShortcutTarget(document.createElement("div"))).toBe(false);
  });
});

function worktree(id: string): RepositoryWorktreeView {
  return {
    displayName: id,
    displayPath: `/workspace/${id}`,
    id,
    locked: false,
    state: "available"
  };
}

function candidate(id: string): DroppedRepositoryPreviewView {
  return {
    displayPath: `/workspace/${id}`,
    id,
    name: id,
    rememberEligible: false
  };
}
