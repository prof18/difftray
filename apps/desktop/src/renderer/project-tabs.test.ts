import { describe, expect, it, vi } from "vitest";

import {
  createProjectTabOrderSaveQueue,
  mergeProjectTabs,
  reorderProjectTabs
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
