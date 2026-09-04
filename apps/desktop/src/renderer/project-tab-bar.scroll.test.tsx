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

  it("scrolls the tab strip from a mouse wheel without requiring focus", () => {
    act(() => {
      root.render(
        <ProjectTabBar
          {...projectTabBarProps({
            projects: [
              project("repo-one", "Repo One"),
              project("repo-two", "Repo Two"),
              project("repo-three", "Repo Three")
            ]
          })}
        />
      );
    });

    const tabBar = container.querySelector<HTMLElement>("[data-project-tab-bar]");
    const tabScroller = container.querySelector<HTMLElement>(
      "[data-project-tab-scroller]"
    );

    expect(tabBar).not.toBeNull();
    expect(tabScroller).not.toBeNull();
    expect(document.activeElement).toBe(document.body);

    Object.defineProperties(tabScroller, {
      clientWidth: { configurable: true, value: 240 },
      scrollWidth: { configurable: true, value: 720 }
    });

    const wheelEvent = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 96
    });

    act(() => {
      tabBar?.dispatchEvent(wheelEvent);
    });

    expect(tabScroller?.scrollLeft).toBe(96);
    expect(wheelEvent.defaultPrevented).toBe(true);
  });

  it("scrolls the tab strip from a horizontal touchpad gesture", () => {
    act(() => {
      root.render(
        <ProjectTabBar
          {...projectTabBarProps({
            projects: [project("repo-one", "Repo One"), project("repo-two", "Repo Two")]
          })}
        />
      );
    });

    const tabBar = container.querySelector<HTMLElement>("[data-project-tab-bar]");
    const tabScroller = container.querySelector<HTMLElement>(
      "[data-project-tab-scroller]"
    );

    Object.defineProperties(tabScroller, {
      clientWidth: { configurable: true, value: 240 },
      scrollWidth: { configurable: true, value: 720 }
    });

    const wheelEvent = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaX: 48
    });

    act(() => {
      tabBar?.dispatchEvent(wheelEvent);
    });

    expect(tabScroller?.scrollLeft).toBe(48);
    expect(wheelEvent.defaultPrevented).toBe(true);
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
    projects: [project("repo-one", "Repo One")],
    summaryLoadingProjectIds: new Set(),
    ...props
  };
}
