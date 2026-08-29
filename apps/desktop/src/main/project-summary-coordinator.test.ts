import { describe, expect, it, vi } from "vitest";

import { ProjectSummaryCoordinator } from "./project-summary-coordinator.js";

describe("ProjectSummaryCoordinator", () => {
  it("bounds concurrency and deduplicates queued project ids", async () => {
    let active = 0;
    let maximumActive = 0;
    const releases: (() => void)[] = [];
    const load = vi.fn(async (projectId: string) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active -= 1;
      return summary(projectId.length);
    });
    const coordinator = new ProjectSummaryCoordinator({ concurrency: 2, load });

    coordinator.queue("one");
    coordinator.queue("two");
    coordinator.queue("three");
    coordinator.queue("one");
    expect(coordinator.isPending("one")).toBe(true);
    expect(coordinator.isPending("three")).toBe(true);
    await tick();

    expect(load).toHaveBeenCalledTimes(2);
    expect(maximumActive).toBe(2);
    releases.splice(0).forEach((release) => release());
    await tick();
    releases.splice(0).forEach((release) => release());
    await coordinator.whenIdle();
    expect(load).toHaveBeenCalledTimes(3);
    expect(coordinator.isPending("one")).toBe(false);
    expect(coordinator.isPending("three")).toBe(false);
  });

  it("queues a bounded batch of missing summaries while skipping cached and pending ids", async () => {
    const releases: (() => void)[] = [];
    const load = vi.fn(async (projectId: string) => {
      if (projectId === "pending") {
        await new Promise<void>((resolve) => releases.push(resolve));
      }
      return projectId === "cached-null" ? null : summary(1);
    });
    const coordinator = new ProjectSummaryCoordinator({
      concurrency: 20,
      load
    });

    coordinator.queue("cached-null");
    await coordinator.whenIdle();
    coordinator.queue("pending");
    await tick();

    const projectIds = [
      "cached-null",
      "pending",
      ...Array.from({ length: 21 }, (_, index) => `project-${String(index + 1)}`)
    ];

    expect(coordinator.queueMissing(projectIds)).toBe(20);
    await tick();
    expect(load).toHaveBeenCalledTimes(22);
    expect(load.mock.calls.slice(2).map(([projectId]) => projectId)).toEqual(
      Array.from({ length: 20 }, (_, index) => `project-${String(index + 1)}`)
    );

    releases.splice(0).forEach((release) => release());
    await coordinator.whenIdle();
    expect(coordinator.queueMissing(projectIds)).toBe(1);
    await coordinator.whenIdle();
    expect(load).toHaveBeenCalledTimes(23);
    expect(load).toHaveBeenLastCalledWith("project-21");
  });

  it("loads a complete batch without exceeding its concurrency bound", async () => {
    let active = 0;
    let maximumActive = 0;
    const coordinator = new ProjectSummaryCoordinator({
      concurrency: 2,
      load: async (projectId) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await tick();
        active -= 1;
        return summary(projectId.length);
      }
    });
    const projectIds = Array.from({ length: 25 }, (_, index) => `project-${index}`);

    const summaries = await coordinator.loadAll(projectIds);

    expect(maximumActive).toBe(2);
    expect(summaries).toEqual(projectIds.map((projectId) => summary(projectId.length)));
  });

  it("prioritizes urgent queued work", async () => {
    const order: string[] = [];
    const coordinator = new ProjectSummaryCoordinator({
      concurrency: 1,
      load: async (projectId) => {
        order.push(projectId);
        return summary(0);
      }
    });

    coordinator.queue("recent");
    coordinator.queue("background");
    coordinator.queue("active", { priority: "high" });
    await coordinator.whenIdle();

    expect(order).toEqual(["active", "recent", "background"]);
  });

  it("cancels queued work and suppresses stale active results", async () => {
    let release: (() => void) | undefined;
    const coordinator = new ProjectSummaryCoordinator({
      concurrency: 1,
      load: async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return summary(2);
      }
    });

    coordinator.queue("active");
    coordinator.queue("queued");
    await tick();
    coordinator.cancel("active");
    coordinator.cancel("queued");
    release?.();
    await coordinator.whenIdle();

    expect(coordinator.get("active")).toBeUndefined();
    expect(coordinator.get("queued")).toBeUndefined();
    expect(coordinator.sizesForDiagnostics.generations).toBe(0);
  });

  it("keeps a replacement load deduplicated when a cancelled active load settles", async () => {
    const releases: (() => void)[] = [];
    const load = vi.fn(async () => {
      await new Promise<void>((resolve) => releases.push(resolve));
      return summary(1);
    });
    const coordinator = new ProjectSummaryCoordinator({ concurrency: 2, load });

    coordinator.queue("project");
    await tick();
    coordinator.cancel("project");
    coordinator.queue("project");
    await tick();
    expect(load).toHaveBeenCalledTimes(2);

    releases[0]?.();
    await tick();
    coordinator.queue("project");
    await tick();

    expect(load).toHaveBeenCalledTimes(2);
    releases[1]?.();
    await coordinator.whenIdle();
  });

  it("invalidates cached work and permits a fresh result", async () => {
    let reviewedVisibleFiles = 1;
    const coordinator = new ProjectSummaryCoordinator({
      concurrency: 1,
      load: async () => summary(reviewedVisibleFiles)
    });

    coordinator.queue("project");
    await coordinator.whenIdle();
    expect(coordinator.get("project")).toEqual(summary(1));

    coordinator.invalidate("project");
    reviewedVisibleFiles = 2;
    coordinator.queue("project");
    await coordinator.whenIdle();

    expect(coordinator.get("project")).toEqual(summary(2));
  });

  it("releases cached summaries and generations when projects leave the open set", async () => {
    const coordinator = new ProjectSummaryCoordinator({
      load: async (projectId) => summary(projectId.length)
    });

    for (let index = 0; index < 250; index += 1) {
      const projectId = `project-${String(index)}`;
      coordinator.queue(projectId);
      await coordinator.whenIdle();
      coordinator.cancel(projectId);
    }

    expect(coordinator.sizesForDiagnostics).toEqual({ cache: 0, generations: 0 });
  });

  it("refreshes cached work and reports completed values", async () => {
    let value = 1;
    const loaded: [string, number | null][] = [];
    const coordinator = new ProjectSummaryCoordinator({
      load: async () => summary(value),
      onLoaded: (projectId, result) => {
        loaded.push([projectId, result?.progress.reviewedVisibleFiles ?? null]);
      }
    });

    coordinator.queue("worktree");
    await coordinator.whenIdle();
    value = 2;
    coordinator.queue("worktree", { refresh: true });
    await coordinator.whenIdle();

    expect(coordinator.get("worktree")).toEqual(summary(2));
    expect(loaded).toEqual([
      ["worktree", 1],
      ["worktree", 2]
    ]);
  });

  it("runs a follow-up refresh requested while a load is pending", async () => {
    const releases: (() => void)[] = [];
    let value = 1;
    const load = vi.fn(async () => {
      const loadedValue = value;
      await new Promise<void>((resolve) => releases.push(resolve));
      return summary(loadedValue);
    });
    const coordinator = new ProjectSummaryCoordinator({ load });

    coordinator.queue("worktree");
    await tick();
    value = 2;
    coordinator.queue("worktree", { refresh: true });
    releases[0]?.();
    await tick();

    expect(load).toHaveBeenCalledTimes(2);
    releases[1]?.();
    await coordinator.whenIdle();
    expect(coordinator.get("worktree")).toEqual(summary(2));
  });
});

function summary(reviewedVisibleFiles: number) {
  return {
    attentionCount: 0,
    progress: { reviewedVisibleFiles, totalVisibleReviewableFiles: 3 }
  };
}

async function tick(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}
