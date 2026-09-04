/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectTabBar, type ProjectTabBarProps } from "./project-tab-bar.js";

describe("ProjectTabBar context menu", () => {
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

  it("copies the path of the right-clicked worktree without selecting it", () => {
    const onCopyProjectPath = vi.fn();
    const onSelectProject = vi.fn();

    renderTabBar({ onCopyProjectPath, onSelectProject });
    openContextMenu("agent-cli");

    const menu = container.querySelector<HTMLElement>(
      '[role="menu"][aria-label="Repository tab actions for feed-flow / agent-cli"]'
    );

    expect(menu).not.toBeNull();
    expect(menu?.textContent).toContain("Copy path");
    expect(menu?.textContent).toContain("Close Repository");

    act(() => {
      menuItem("Copy path")?.click();
    });

    expect(onCopyProjectPath).toHaveBeenCalledOnce();
    expect(onCopyProjectPath).toHaveBeenCalledWith("agent-cli");
    expect(onSelectProject).not.toHaveBeenCalled();
    expect(
      container.querySelector(
        '[role="menu"][aria-label="Repository tab actions for feed-flow / agent-cli"]'
      )
    ).toBeNull();
  });

  it("closes the right-clicked inactive linked worktree without selecting it", () => {
    const onCloseProject = vi.fn();
    const onSelectProject = vi.fn();

    renderTabBar({ onCloseProject, onSelectProject });
    openContextMenu("agent-cli");

    act(() => {
      menuItem("Close Repository")?.click();
    });

    expect(onCloseProject).toHaveBeenCalledOnce();
    expect(onCloseProject).toHaveBeenCalledWith("agent-cli");
    expect(onSelectProject).not.toHaveBeenCalled();
  });

  function renderTabBar(props: Partial<ProjectTabBarProps>): void {
    act(() => {
      root.render(<ProjectTabBar {...projectTabBarProps(props)} />);
    });
  }

  function openContextMenu(projectId: string): void {
    const tab = container.querySelector(`[data-project-id="${projectId}"]`);

    expect(tab).not.toBeNull();
    act(() => {
      tab?.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 120,
          clientY: 32
        })
      );
    });
  }

  function menuItem(label: string): HTMLButtonElement | undefined {
    const openMenu = [...container.querySelectorAll<HTMLElement>('[role="menu"]')].find(
      (menu) => !menu.hasAttribute("hidden")
    );

    return [
      ...(openMenu?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
    ].find((button) => button.textContent === label);
  }
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
    onCloseProject: vi.fn(),
    onCopyProjectPath: vi.fn(),
    onForgetActiveProject: vi.fn(),
    onOpenActiveProjectInFinder: vi.fn(),
    onOpenActiveProjectWorktrees: vi.fn(),
    onOpenProject: vi.fn(),
    onRefreshActiveProject: vi.fn(),
    onReorderProjects: vi.fn(),
    onCommitProjectOrder: vi.fn(),
    onSelectProject: vi.fn(),
    projects: [
      project("repo-one", "Repo One"),
      project("repo-two", "Repo Two"),
      {
        ...project("agent-cli", "agent-cli"),
        repositoryName: "feed-flow",
        worktreeName: "agent-cli"
      }
    ],
    summaryLoadingProjectIds: new Set(),
    ...props
  };
}
