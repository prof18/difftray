/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectTabBar, type ProjectTabBarProps } from "./project-tab-bar.js";

class MockDataTransfer {
  dropEffect = "none";
  effectAllowed = "none";
  private readonly data = new Map<string, string>();

  clearData(): void {
    this.data.clear();
  }

  getData(type: string): string {
    return this.data.get(type) ?? "";
  }

  setData(type: string, value: string): void {
    this.data.set(type, value);
  }
}

class MockDragEvent extends Event {
  readonly dataTransfer: MockDataTransfer;

  constructor(
    type: string,
    init?: { bubbles?: boolean; dataTransfer?: MockDataTransfer }
  ) {
    super(type, { bubbles: init?.bubbles ?? false });
    this.dataTransfer = init?.dataTransfer ?? new MockDataTransfer();
  }
}

describe("ProjectTabBar drag", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    globalThis.DataTransfer = MockDataTransfer as unknown as typeof DataTransfer;
    globalThis.DragEvent = MockDragEvent as unknown as typeof DragEvent;
    globalThis.ResizeObserver = class ResizeObserver {
      disconnect = vi.fn();
      observe = vi.fn();
      unobserve = vi.fn();
    };
    HTMLElement.prototype.scrollIntoView = vi.fn();

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

  it("opens the active project in Finder from the repository menu", () => {
    const onOpenActiveProjectInFinder = vi.fn();

    act(() => {
      root.render(
        <ProjectTabBar {...projectTabBarProps({ onOpenActiveProjectInFinder })} />
      );
    });

    const repositoryActionsButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Repository actions for Repo One"][aria-haspopup="menu"]'
    );

    expect(repositoryActionsButton).not.toBeNull();

    act(() => {
      repositoryActionsButton?.click();
    });

    const openInFinderButton = [
      ...container.querySelectorAll<HTMLButtonElement>('[role="menu"] button')
    ].find((button) => button.textContent === "Show in Finder");

    expect(openInFinderButton).not.toBeUndefined();

    act(() => {
      openInFinderButton?.click();
    });

    expect(onOpenActiveProjectInFinder).toHaveBeenCalledOnce();
  });

  it("closes the repository menu when the active tab changes", () => {
    const props = projectTabBarProps({
      projects: [project("repo-one", "Repo One"), project("repo-two", "Repo Two")]
    });

    act(() => {
      root.render(<ProjectTabBar {...props} />);
    });

    const repositoryActionsButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Repository actions for Repo One"][aria-haspopup="menu"]'
    );
    act(() => {
      repositoryActionsButton?.click();
    });
    expect(container.querySelector('[role="menu"]')?.getAttribute("hidden")).toBeNull();

    act(() => {
      root.render(<ProjectTabBar {...props} activeProjectId="repo-two" />);
    });

    expect(container.querySelector('[role="menu"]')?.getAttribute("hidden")).toBe("");
  });

  it("consumes Escape in the repository menu before App shortcuts see it", () => {
    const onWindowKeyDown = vi.fn();
    window.addEventListener("keydown", onWindowKeyDown);

    try {
      act(() => {
        root.render(<ProjectTabBar {...projectTabBarProps()} />);
      });

      const repositoryActionsButton = container.querySelector<HTMLButtonElement>(
        '[aria-label="Repository actions for Repo One"][aria-haspopup="menu"]'
      );

      act(() => {
        repositoryActionsButton?.click();
      });

      expect(container.querySelector('[role="menu"]')).not.toBeNull();

      const event = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Escape"
      });

      act(() => {
        document.dispatchEvent(event);
      });

      expect(event.defaultPrevented).toBe(true);
      expect(onWindowKeyDown).not.toHaveBeenCalled();
      expect(container.querySelector('[role="menu"]')?.getAttribute("hidden")).toBe("");
    } finally {
      window.removeEventListener("keydown", onWindowKeyDown);
    }
  });

  it("closes the repository menu when Tab leaves without trapping focus", () => {
    act(() => {
      root.render(<ProjectTabBar {...projectTabBarProps()} />);
    });

    const repositoryActionsButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Repository actions for Repo One"][aria-haspopup="menu"]'
    );

    act(() => {
      repositoryActionsButton?.click();
    });

    const firstMenuItem = container.querySelector<HTMLButtonElement>('[role="menuitem"]');
    expect(firstMenuItem).not.toBeNull();

    const tab = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Tab"
    });

    act(() => {
      firstMenuItem?.dispatchEvent(tab);
    });

    expect(tab.defaultPrevented).toBe(false);
    expect(container.querySelector('[role="menu"]')?.getAttribute("hidden")).toBe("");
  });

  it("returns focus to the trigger after keyboard menu activation", () => {
    const onRefreshActiveProject = vi.fn();

    act(() => {
      root.render(<ProjectTabBar {...projectTabBarProps({ onRefreshActiveProject })} />);
    });

    const repositoryActionsButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Repository actions for Repo One"][aria-haspopup="menu"]'
    );

    act(() => {
      repositoryActionsButton?.click();
    });

    const refreshButton = [
      ...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
    ].find((button) => button.textContent === "Refresh");
    expect(refreshButton).not.toBeUndefined();
    expect(document.activeElement).toBe(refreshButton);

    act(() => {
      refreshButton?.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
    });

    expect(onRefreshActiveProject).toHaveBeenCalledOnce();
    expect(container.querySelector('[role="menu"]')?.getAttribute("hidden")).toBe("");
    expect(document.activeElement).toBe(repositoryActionsButton);
  });

  it("does not move mouse focus to the trigger when a menu item is clicked", () => {
    act(() => {
      root.render(<ProjectTabBar {...projectTabBarProps()} />);
    });

    const repositoryActionsButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Repository actions for Repo One"][aria-haspopup="menu"]'
    );

    act(() => {
      repositoryActionsButton?.click();
    });

    const refreshButton = container.querySelector<HTMLButtonElement>('[role="menuitem"]');
    expect(refreshButton).not.toBeNull();

    act(() => {
      refreshButton?.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    });

    expect(document.activeElement).toBe(refreshButton);
    expect(document.activeElement).not.toBe(repositoryActionsButton);
  });

  it("cancels an active drag when tabDragCancelKey changes", () => {
    const onReorderProjects = vi.fn();
    const props = projectTabBarProps({
      onReorderProjects,
      projects: [project("repo-one", "Repo One"), project("repo-two", "Repo Two")]
    });

    act(() => {
      root.render(<ProjectTabBar {...props} tabDragCancelKey={0} />);
    });

    const draggedTab = container.querySelector('[data-project-tab-name="Repo Two"]');

    expect(draggedTab).not.toBeNull();

    act(() => {
      draggedTab?.dispatchEvent(
        new MockDragEvent("dragstart", {
          bubbles: true
        })
      );
    });

    expect(container.querySelector('[data-dragging="true"]')).not.toBeNull();

    act(() => {
      root.render(
        <ProjectTabBar
          {...props}
          projects={[project("repo-two", "Repo Two"), project("repo-one", "Repo One")]}
          tabDragCancelKey={1}
        />
      );
    });

    expect(container.querySelector('[data-dragging="true"]')).toBeNull();
    expect(onReorderProjects).not.toHaveBeenCalled();
  });

  it("drops from the reconciled tab list after a project removal cancels a drag", () => {
    const onCommitProjectOrder = vi.fn();
    const projects = [
      project("repo-one", "Repo One"),
      project("repo-two", "Repo Two"),
      project("repo-three", "Repo Three")
    ];
    const props = projectTabBarProps({ onCommitProjectOrder, projects });
    const dataTransfer = new MockDataTransfer();

    act(() => {
      root.render(<ProjectTabBar {...props} tabDragCancelKey={0} />);
    });

    const draggedTab = container.querySelector('[data-project-tab-name="Repo Two"]');

    act(() => {
      draggedTab?.dispatchEvent(
        new MockDragEvent("dragstart", { bubbles: true, dataTransfer })
      );
    });

    act(() => {
      root.render(
        <ProjectTabBar {...props} projects={projects.slice(0, 2)} tabDragCancelKey={1} />
      );
    });

    const tabScroller = container.querySelector('[data-project-tab-strip="true"] > div');

    act(() => {
      tabScroller?.dispatchEvent(
        new MockDragEvent("drop", { bubbles: true, dataTransfer })
      );
    });

    expect(onCommitProjectOrder).toHaveBeenCalledOnce();
    expect(onCommitProjectOrder).toHaveBeenCalledWith(
      expect.objectContaining({ nextProjects: projects.slice(0, 2) })
    );
  });
});

function project(id: string, name: string): RecentProjectView {
  return {
    id,
    name,
    path: `/workspace/${id}`
  };
}

function projectTabBarProps(props: Partial<ProjectTabBarProps> = {}): ProjectTabBarProps {
  return {
    activeProjectId: "repo-one",
    disabled: false,
    onCloseActiveProject: vi.fn(),
    onForgetActiveProject: vi.fn(),
    onOpenActiveProjectInFinder: vi.fn(),
    onOpenActiveProjectWorktrees: vi.fn(),
    onOpenProject: vi.fn(),
    onRefreshActiveProject: vi.fn(),
    onReorderProjects: vi.fn(),
    onCommitProjectOrder: vi.fn(),
    onSelectProject: vi.fn(),
    projects: [project("repo-one", "Repo One")],
    summaryLoadingProjectIds: new Set(),
    ...props
  };
}
