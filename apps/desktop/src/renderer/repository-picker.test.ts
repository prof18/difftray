/** @vitest-environment jsdom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  projectToShowWhileLoading,
  RepositoryPicker,
  repositoryPickerItems
} from "./repository-picker.js";

describe("RepositoryPicker", () => {
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

  it("clamps the active row when items are removed and Enter opens that live row", () => {
    const projects = [
      project("one", "/workspace/one"),
      project("two", "/workspace/two"),
      project("three", "/workspace/three")
    ];
    const onSelect = vi.fn();

    act(() => {
      root.render(
        createElement(
          RepositoryPicker,
          pickerProps({ knownProjects: projects, onSelect })
        )
      );
    });

    const input = container.querySelector<HTMLInputElement>("input");
    expect(input).not.toBeNull();
    expect(input?.getAttribute("role")).toBe("combobox");
    expect(input?.getAttribute("aria-autocomplete")).toBe("list");
    expect(input?.getAttribute("aria-expanded")).toBe("true");
    expect(input?.getAttribute("aria-haspopup")).toBe("listbox");
    act(() => {
      input?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" })
      );
      input?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" })
      );
    });

    act(() => {
      root.render(
        createElement(
          RepositoryPicker,
          pickerProps({ knownProjects: projects.slice(0, 2), onSelect })
        )
      );
    });

    const activeDescendant = input?.getAttribute("aria-activedescendant");
    expect(activeDescendant).toBeTruthy();
    expect(document.getElementById(activeDescendant ?? "")?.textContent).toContain("two");
    expect(container.querySelector('[data-selected="true"]')?.textContent).toContain(
      "two"
    );
    expect(document.activeElement).toBe(input);

    act(() => {
      input?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
    });

    expect(onSelect).toHaveBeenCalledWith({ project: projects[1], state: "known" });
  });

  it("scrolls the active row into view during keyboard navigation", () => {
    const projects = [
      project("one", "/workspace/one"),
      project("two", "/workspace/two"),
      project("three", "/workspace/three")
    ];
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    act(() => {
      root.render(
        createElement(RepositoryPicker, pickerProps({ knownProjects: projects }))
      );
    });
    scrollIntoView.mockClear();

    const input = container.querySelector<HTMLInputElement>("input");
    act(() => {
      input?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" })
      );
    });

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
    expect(container.querySelector('[data-selected="true"]')?.textContent).toContain(
      "two"
    );
  });

  it("opens a discovered catalog repository individually on click", () => {
    const catalogProject = {
      ...project("catalog", "/workspace/catalog"),
      available: true,
      lastSeenAt: "2026-08-27T00:00:00.000Z",
      rootId: "/workspace"
    };
    const onSelect = vi.fn();

    act(() => {
      root.render(
        createElement(
          RepositoryPicker,
          pickerProps({ catalog: [catalogProject], onSelect })
        )
      );
    });

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-kind="project"]')?.click();
    });
    expect(onSelect).toHaveBeenCalledWith({ project: catalogProject, state: "catalog" });
    expect(container.textContent).not.toContain("Select multiple");
    expect(container.textContent).not.toContain("Cancel selection");
    expect(container.querySelector('[aria-multiselectable="true"]')).toBeNull();
  });

  it("does not intercept Enter from footer action buttons", () => {
    const onBrowse = vi.fn();
    const onSelect = vi.fn();
    act(() => {
      root.render(
        createElement(
          RepositoryPicker,
          pickerProps({
            knownProjects: [project("one", "/workspace/one")],
            onBrowse,
            onSelect
          })
        )
      );
    });
    const browse = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.includes("Open Repositories")
    );
    const enter = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Enter"
    });

    act(() => {
      browse?.dispatchEvent(enter);
    });

    expect(enter.defaultPrevented).toBe(false);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("does not use opaque catalog IDs as temporary loading projects", () => {
    const catalog = {
      project: project("catalog-id", "/workspace/catalog"),
      state: "catalog" as const
    };
    const known = {
      project: project("/workspace/known", "/workspace/known"),
      state: "known" as const
    };

    expect(projectToShowWhileLoading(catalog)).toBeUndefined();
    expect(projectToShowWhileLoading(known)).toBe(known.project);
  });

  function pickerProps(
    overrides: Partial<React.ComponentProps<typeof RepositoryPicker>> = {}
  ): React.ComponentProps<typeof RepositoryPicker> {
    return {
      catalog: [],
      knownProjects: [],
      onBrowse: vi.fn(),
      onClose: vi.fn(),
      onRefresh: vi.fn(),
      onScan: vi.fn(),
      onSelect: vi.fn(),
      openProjects: [],
      ...overrides
    };
  }
});

describe("repositoryPickerItems", () => {
  it("groups open tabs before closed known repositories without duplicates", () => {
    const open = [project("difftray", "/workspace/difftray")];
    const known = [...open, project("feed-flow", "/workspace/feed-flow")];

    expect(repositoryPickerItems(open, known, [], "")).toEqual([
      { project: open[0], state: "open" },
      { project: known[1], state: "known" }
    ]);
  });

  it("searches repository names and paths case-insensitively", () => {
    const known = [
      project("Difftray", "/workspace/difftray"),
      project("FeedFlow", "/workspace/feed-flow")
    ];

    expect(
      repositoryPickerItems([], known, [], "FEED").map(({ project }) => project.id)
    ).toEqual(["/workspace/feed-flow"]);
    expect(
      repositoryPickerItems([], known, [], "/WORKSPACE/DIFF").map(
        ({ project }) => project.id
      )
    ).toEqual(["/workspace/difftray"]);
  });

  it("matches ordered fuzzy initials", () => {
    const known = [project("Difftray", "/workspace/difftray")];
    expect(repositoryPickerItems([], known, [], "dtr")).toHaveLength(1);
    expect(repositoryPickerItems([], known, [], "xyz")).toHaveLength(0);
  });
});

function project(name: string, projectPath: string): RecentProjectView {
  return { id: projectPath, name, path: projectPath };
}
