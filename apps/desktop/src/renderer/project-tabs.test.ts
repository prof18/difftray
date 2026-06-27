import { describe, expect, it, vi } from "vitest";

import {
  createProjectTabOrderSaveQueue,
  mergeProjectTabs,
  prepareProjectTabReorderUpdate,
  projectTabOrdersMatch,
  projectTabOrderIndexAfterInsert,
  reorderProjectTabs,
  resolveLiveProjectTabReorder,
  resolveProjectTabDropTarget,
  shouldCancelActiveTabDrag
} from "./project-tabs.js";

describe("mergeProjectTabs", () => {
  it("keeps the storage order for the initial tab list", () => {
    expect(mergeProjectTabs([], [project("newest"), project("older")])).toEqual([
      project("newest"),
      project("older")
    ]);
  });

  it("appends newly opened projects instead of moving them to the front", () => {
    expect(
      mergeProjectTabs(
        [project("reader-flow"), project("difftray")],
        [project("new-repo"), project("difftray"), project("reader-flow")]
      )
    ).toEqual([project("reader-flow"), project("difftray"), project("new-repo")]);
  });

  it("removes closed projects while preserving the remaining tab order", () => {
    expect(
      mergeProjectTabs(
        [project("reader-flow"), project("difftray"), project("new-repo")],
        [project("new-repo"), project("reader-flow")]
      )
    ).toEqual([project("reader-flow"), project("new-repo")]);
  });

  it("preserves locally loaded tab review summaries when storage returns metadata only", () => {
    type TestProject = {
      readonly id: string;
      readonly name?: string;
      readonly reviewSummary?: {
        readonly count: number;
      };
    };
    const summary = { count: 3 };
    const currentProjects: readonly TestProject[] = [
      { id: "reader-flow", name: "Reader Flow", reviewSummary: summary }
    ];
    const nextProjects: readonly TestProject[] = [
      { id: "reader-flow", name: "reader-flow" }
    ];

    expect(mergeProjectTabs(currentProjects, nextProjects)).toEqual([
      { id: "reader-flow", name: "reader-flow", reviewSummary: summary }
    ]);
  });
});

describe("shouldCancelActiveTabDrag", () => {
  it("returns false when the cancel key is unchanged or still zero", () => {
    expect(shouldCancelActiveTabDrag({ previousCancelKey: 0, nextCancelKey: 0 })).toBe(
      false
    );
    expect(shouldCancelActiveTabDrag({ previousCancelKey: 1, nextCancelKey: 1 })).toBe(
      false
    );
  });

  it("returns true when the cancel key increments from a prior value", () => {
    expect(shouldCancelActiveTabDrag({ previousCancelKey: 0, nextCancelKey: 1 })).toBe(
      true
    );
    expect(shouldCancelActiveTabDrag({ previousCancelKey: 1, nextCancelKey: 2 })).toBe(
      true
    );
  });
});

describe("prepareProjectTabReorderUpdate", () => {
  it("returns undefined when the proposed order matches the current order", () => {
    const projects = [project("reader-flow"), project("difftray")];

    expect(prepareProjectTabReorderUpdate(projects, projects)).toBeUndefined();
  });

  it("returns the next order and rollback snapshot when the order changes", () => {
    const currentProjects = [project("reader-flow"), project("difftray")];
    const nextProjects = [project("difftray"), project("reader-flow")];

    expect(prepareProjectTabReorderUpdate(currentProjects, nextProjects)).toEqual({
      nextProjects,
      rollbackProjects: currentProjects
    });
  });
});

describe("resolveLiveProjectTabReorder", () => {
  const layouts = [
    { projectId: "a", left: 0, width: 100 },
    { projectId: "b", left: 101, width: 100 },
    { projectId: "c", left: 202, width: 100 }
  ];
  const projects = [project("a"), project("b"), project("c")];

  it("reorders live from the latest dragProjects snapshot across multiple steps", () => {
    const firstStep = resolveLiveProjectTabReorder({
      dragProjects: projects,
      draggedProjectId: "c",
      lastAppliedOrderIndex: 2,
      layouts,
      pointerX: 30
    });

    expect(firstStep.shouldReorder).toBe(true);
    expect(firstStep.nextDragProjects.map((entry) => entry.id)).toEqual(["c", "a", "b"]);

    const staleSecondStep = resolveLiveProjectTabReorder({
      dragProjects: projects,
      draggedProjectId: "c",
      lastAppliedOrderIndex: firstStep.nextAppliedOrderIndex,
      layouts,
      pointerX: 250
    });
    const currentSecondStep = resolveLiveProjectTabReorder({
      dragProjects: firstStep.nextDragProjects,
      draggedProjectId: "c",
      lastAppliedOrderIndex: firstStep.nextAppliedOrderIndex,
      layouts,
      pointerX: 250
    });

    expect(staleSecondStep.shouldReorder).toBe(false);
    expect(staleSecondStep.nextDragProjects.map((entry) => entry.id)).toEqual([
      "a",
      "b",
      "c"
    ]);
    expect(currentSecondStep.shouldReorder).toBe(true);
    expect(currentSecondStep.nextDragProjects.map((entry) => entry.id)).toEqual([
      "a",
      "b",
      "c"
    ]);
  });

  it("keeps the drop indicator without re-applying the same live reorder", () => {
    const reorder = resolveLiveProjectTabReorder({
      dragProjects: projects,
      draggedProjectId: "c",
      lastAppliedOrderIndex: undefined,
      layouts,
      pointerX: 120
    });

    expect(reorder.shouldReorder).toBe(true);
    expect(reorder.nextAppliedOrderIndex).toBe(1);

    const repeat = resolveLiveProjectTabReorder({
      dragProjects: projects,
      draggedProjectId: "c",
      lastAppliedOrderIndex: reorder.nextAppliedOrderIndex,
      layouts,
      pointerX: 120
    });

    expect(repeat.shouldReorder).toBe(false);
    expect(repeat.dropTarget).toEqual(reorder.dropTarget);
    expect(repeat.nextDragProjects).toBe(projects);
  });
});

describe("projectTabOrdersMatch", () => {
  it("returns true when tab ids match in the same order", () => {
    expect(
      projectTabOrdersMatch(
        [project("reader-flow"), project("difftray")],
        [project("reader-flow"), project("difftray")]
      )
    ).toBe(true);
  });

  it("returns false when tab order differs", () => {
    expect(
      projectTabOrdersMatch(
        [project("reader-flow"), project("difftray")],
        [project("difftray"), project("reader-flow")]
      )
    ).toBe(false);
  });
});

describe("resolveProjectTabDropTarget", () => {
  const tabs = [
    { projectId: "a", left: 0, width: 100 },
    { projectId: "b", left: 101, width: 100 },
    { projectId: "c", left: 202, width: 100 }
  ];
  const projects = [project("a"), project("b"), project("c")];

  it("treats the gap between tabs as a valid drop zone", () => {
    expect(resolveProjectTabDropTarget(tabs, 100.5, "c")).toEqual({
      projectId: "b",
      position: "before"
    });
    expect(resolveProjectTabDropTarget(tabs, 100.5, "a")).toEqual({
      projectId: "b",
      position: "before"
    });
  });

  it("resolves insertion from pointer location across tab centers", () => {
    expect(resolveProjectTabDropTarget(tabs, 30, "c")).toEqual({
      projectId: "a",
      position: "before"
    });
    expect(resolveProjectTabDropTarget(tabs, 70, "c")).toEqual({
      projectId: "b",
      position: "before"
    });
    expect(resolveProjectTabDropTarget(tabs, 250, "a")).toEqual({
      projectId: "c",
      position: "before"
    });
  });

  it("supports edge drop zones", () => {
    expect(resolveProjectTabDropTarget(tabs, -5, "c")).toEqual({
      projectId: "a",
      position: "before"
    });
    expect(resolveProjectTabDropTarget(tabs, 305, "a")).toEqual({
      projectId: "c",
      position: "after"
    });
  });

  it("does not change order when the dragged tab is already at the target slot", () => {
    expect(
      projectTabOrderIndexAfterInsert(
        projects,
        "a",
        0,
        tabs.filter((tab) => tab.projectId !== "a")
      )
    ).toBe(0);
    expect(
      projectTabOrderIndexAfterInsert(
        projects,
        "b",
        1,
        tabs.filter((tab) => tab.projectId !== "b")
      )
    ).toBe(1);
  });
});

describe("reorderProjectTabs", () => {
  it("moves a dragged project before the target project", () => {
    expect(
      reorderProjectTabs(
        [project("reader-flow"), project("difftray"), project("new-repo")],
        "new-repo",
        "reader-flow",
        "before"
      )
    ).toEqual([project("new-repo"), project("reader-flow"), project("difftray")]);
  });

  it("moves a dragged project after the target project", () => {
    expect(
      reorderProjectTabs(
        [project("reader-flow"), project("difftray"), project("new-repo")],
        "reader-flow",
        "new-repo",
        "after"
      )
    ).toEqual([project("difftray"), project("new-repo"), project("reader-flow")]);
  });

  it("leaves the order unchanged for invalid drag targets", () => {
    const projects = [project("reader-flow"), project("difftray")];

    expect(reorderProjectTabs(projects, "missing", "difftray", "before")).toBe(projects);
    expect(reorderProjectTabs(projects, "reader-flow", "missing", "after")).toBe(
      projects
    );
  });
});

describe("createProjectTabOrderSaveQueue", () => {
  it("serializes tab order saves so later writes cannot be overwritten by earlier ones", async () => {
    const queue = createProjectTabOrderSaveQueue();
    const persistedOrders: string[][] = [];
    let releaseFirstSave: (() => void) | undefined;

    queue.enqueue({
      onFailure: () => {
        throw new Error("first save should not fail");
      },
      projectIds: ["a", "b"],
      save: async (projectIds) => {
        await new Promise<void>((resolve) => {
          releaseFirstSave = resolve;
        });
        persistedOrders.push([...projectIds]);
      }
    });
    queue.enqueue({
      onFailure: () => {
        throw new Error("second save should not fail");
      },
      projectIds: ["b", "a"],
      save: async (projectIds) => {
        persistedOrders.push([...projectIds]);
      }
    });

    await Promise.resolve();
    releaseFirstSave?.();
    await queue.whenIdle();

    expect(persistedOrders).toEqual([
      ["a", "b"],
      ["b", "a"]
    ]);
  });

  it("does not roll back when an older save fails after a newer reorder", async () => {
    const queue = createProjectTabOrderSaveQueue();
    const onFailure = vi.fn();
    let rejectFirstSave: ((error: Error) => void) | undefined;

    queue.enqueue({
      onFailure,
      projectIds: ["a", "b"],
      save: () =>
        new Promise<void>((_resolve, reject) => {
          rejectFirstSave = reject;
        })
    });
    queue.enqueue({
      onFailure,
      projectIds: ["b", "a"],
      save: async () => undefined
    });

    await Promise.resolve();
    expect(rejectFirstSave).toBeDefined();
    rejectFirstSave?.(new Error("stale save failed"));
    await queue.whenIdle();

    expect(onFailure).not.toHaveBeenCalled();
  });

  it("rolls back only the latest save when it fails", async () => {
    const queue = createProjectTabOrderSaveQueue();
    const onFailure = vi.fn();

    queue.enqueue({
      onFailure,
      projectIds: ["b", "a"],
      save: async () => {
        throw new Error("latest save failed");
      }
    });
    await queue.whenIdle();

    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onFailure.mock.calls[0]?.[0]).toEqual(new Error("latest save failed"));
  });
});

function project(id: string) {
  return { id };
}
