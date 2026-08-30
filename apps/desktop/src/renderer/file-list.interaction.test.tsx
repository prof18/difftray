/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FileList } from "./file-list.js";

describe("FileList context menu", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    globalThis.ResizeObserver = class ResizeObserver {
      disconnect = vi.fn();
      observe = vi.fn();
      unobserve = vi.fn();
    };
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

  it("selects the invoked row, clamps the menu, runs an action, and restores focus", () => {
    const onSelect = vi.fn();
    const onShowInFinder = vi.fn();

    renderFileList({ onSelect, onShowInFinder });
    const row = fileButton("second.ts");

    act(() => {
      row.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          clientX: window.innerWidth,
          clientY: window.innerHeight
        })
      );
    });

    expect(onSelect).toHaveBeenCalledWith("src/second.ts");
    const menu = menuElement();
    expect(menu.style.left).toBe(`${String(window.innerWidth - 204)}px`);
    expect(menu.style.top).toBe(`${String(window.innerHeight - 84)}px`);
    expect(document.activeElement?.textContent).toContain("Open in Editor");

    act(() => {
      menuButton("Show in Finder").click();
    });

    expect(onShowInFinder).toHaveBeenCalledWith("src/second.ts");
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(row);
  });

  it("supports arrow navigation and Escape dismissal", () => {
    renderFileList();
    const row = fileButton("first.ts");

    act(() => {
      row.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, clientX: 40, clientY: 60 })
      );
    });

    const menu = menuElement();
    act(() => {
      menu.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" })
      );
    });
    expect(document.activeElement?.textContent).toContain("Show in Finder");

    act(() => {
      menu.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    });
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(row);
  });

  it("anchors a keyboard-invoked menu to the focused file row", () => {
    renderFileList();
    const row = fileButton("first.ts");
    vi.spyOn(row, "getBoundingClientRect").mockReturnValue({
      bottom: 148,
      height: 40,
      left: 72,
      right: 300,
      top: 108,
      width: 228,
      x: 72,
      y: 108,
      toJSON: () => ({})
    });

    act(() => {
      row.focus();
      row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });

    expect(menuElement().style.left).toBe("84px");
    expect(menuElement().style.top).toBe("148px");
  });

  it("dismisses on an outside pointer and disables actions for deleted files", () => {
    const onOpenInEditor = vi.fn();
    const onShowInFinder = vi.fn();

    renderFileList({
      files: [reviewFile("src/deleted.ts", { status: "deleted" })],
      onOpenInEditor,
      onShowInFinder
    });
    const row = fileButton("deleted.ts");

    act(() => {
      row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });

    expect(menuButton("Open in Editor").disabled).toBe(true);
    expect(menuButton("Show in Finder").disabled).toBe(true);
    expect(document.activeElement).toBe(menuElement());

    act(() => {
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });

    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(row);
    expect(onOpenInEditor).not.toHaveBeenCalled();
    expect(onShowInFinder).not.toHaveBeenCalled();
  });

  it("restores row focus when scrolling dismisses the menu", () => {
    renderFileList();
    const row = fileButton("first.ts");

    act(() => {
      row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    expect(document.activeElement?.textContent).toContain("Open in Editor");

    const list = container.firstElementChild;
    if (!(list instanceof HTMLDivElement)) {
      throw new Error("Missing file list");
    }

    act(() => {
      list.dispatchEvent(new Event("scroll", { bubbles: true }));
    });

    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(row);
  });

  it("dismisses without stealing focus when focus moves outside the menu", () => {
    renderFileList();
    const row = fileButton("first.ts");
    const outsideButton = document.createElement("button");
    document.body.appendChild(outsideButton);

    act(() => {
      row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });

    expect(menuButton("Open in Editor").tabIndex).toBe(-1);
    expect(menuButton("Show in Finder").tabIndex).toBe(-1);

    act(() => {
      outsideButton.focus();
    });

    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(outsideButton);
    outsideButton.remove();
  });

  it("keeps the menu through file detail loading but dismisses it on project change", () => {
    renderFileList();
    const row = fileButton("first.ts");

    act(() => {
      row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    expect(menuElement()).toBeTruthy();

    renderFileList({
      files: [
        reviewFile("src/first.ts", { diffLoaded: true }),
        reviewFile("src/second.ts")
      ]
    });
    expect(menuElement()).toBeTruthy();

    renderFileList({
      files: [
        reviewFile("src/first.ts", { diffLoaded: true, status: "deleted" }),
        reviewFile("src/second.ts")
      ]
    });
    expect(menuButton("Open in Editor").disabled).toBe(true);
    expect(menuButton("Show in Finder").disabled).toBe(true);

    renderFileList({ projectId: "project-2" });

    expect(container.querySelector('[role="menu"]')).toBeNull();
  });

  it("dismisses the menu when its file disappears", () => {
    renderFileList();

    act(() => {
      fileButton("first.ts").dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true })
      );
    });

    renderFileList({
      files: [reviewFile("src/second.ts")],
      selectedPath: "src/second.ts"
    });

    expect(container.querySelector('[role="menu"]')).toBeNull();
  });

  it("does not auto-scroll a partially visible row selected by context menu", () => {
    const files = [reviewFile("src/first.ts"), reviewFile("src/second.ts")];
    const onSelect = (path: string): void => {
      renderFileList({ files, onSelect, selectedPath: path });
    };

    renderFileList({ files, onSelect, selectedPath: "src/first.ts" });
    const list = container.firstElementChild;
    if (!(list instanceof HTMLDivElement)) {
      throw new Error("Missing file list");
    }
    Object.defineProperty(list, "clientHeight", { configurable: true, value: 60 });
    list.scrollTop = 10;

    act(() => {
      fileButton("second.ts").dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, clientY: 55 })
      );
    });

    expect(list.scrollTop).toBe(10);
    expect(menuElement()).toBeTruthy();
  });

  function renderFileList(
    props: Partial<React.ComponentProps<typeof FileList>> = {}
  ): void {
    act(() => {
      root.render(
        <FileList
          commentCountByPath={new Map()}
          files={[reviewFile("src/first.ts"), reviewFile("src/second.ts")]}
          onOpenInEditor={vi.fn()}
          onSelect={vi.fn()}
          onShowInFinder={vi.fn()}
          projectId="project-1"
          selectedPath="src/first.ts"
          {...props}
        />
      );
    });
  }

  function fileButton(filename: string): HTMLButtonElement {
    const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (candidate) => candidate.textContent.includes(filename)
    );

    if (!button) {
      throw new Error(`Missing file button: ${filename}`);
    }

    return button;
  }

  function menuButton(label: string): HTMLButtonElement {
    const button = [...menuElement().querySelectorAll<HTMLButtonElement>("button")].find(
      (candidate) => candidate.textContent.includes(label)
    );

    if (!button) {
      throw new Error(`Missing menu button: ${label}`);
    }

    return button;
  }

  function menuElement(): HTMLDivElement {
    const menu = container.querySelector<HTMLDivElement>('[role="menu"]');

    if (!menu) {
      throw new Error("Missing file context menu");
    }

    return menu;
  }
});

function reviewFile(path: string, patch: Partial<ReviewFileView> = {}): ReviewFileView {
  return {
    additions: 1,
    deletions: 0,
    diffHash: `hash-${path}`,
    diffLoaded: false,
    generated: false,
    invalidated: false,
    path,
    reviewable: true,
    reviewed: false,
    status: "modified",
    visible: true,
    ...patch
  };
}
