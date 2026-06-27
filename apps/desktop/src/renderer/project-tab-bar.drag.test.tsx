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
    onOpenProject: vi.fn(),
    onOpenSettings: vi.fn(),
    onReorderProjects: vi.fn(),
    onCommitProjectOrder: vi.fn(),
    onSelectProject: vi.fn(),
    projects: [project("repo-one", "Repo One")],
    summaryLoadingProjectIds: new Set(),
    ...props
  };
}
