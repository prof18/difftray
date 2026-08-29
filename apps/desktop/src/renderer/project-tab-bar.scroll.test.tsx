/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectTabBar, type ProjectTabBarProps } from "./project-tab-bar.js";

describe("ProjectTabBar scrolling", () => {
  let container: HTMLDivElement;
  let root: Root;
  let scrollIntoView: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    globalThis.ResizeObserver = class ResizeObserver {
      disconnect = vi.fn();
      observe = vi.fn();
      unobserve = vi.fn();
    };
    scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

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

  it("reveals an active worktree tab after it is added to the tab strip", () => {
    const worktree = project("worktree", "Worktree");
    const initialProps = projectTabBarProps({
      activeProjectId: worktree.id,
      projects: [project("repo-one", "Repo One")]
    });

    act(() => {
      root.render(<ProjectTabBar {...initialProps} />);
    });

    expect(scrollIntoView).not.toHaveBeenCalled();

    act(() => {
      root.render(
        <ProjectTabBar
          {...initialProps}
          projects={[...initialProps.projects, worktree]}
        />
      );
    });

    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest"
    });
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
