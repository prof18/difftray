import { describe, expect, it, vi } from "vitest";

import type { ProjectReviewSummaryView, RecentProjectView } from "../view-models.js";
import { CompanionProjectList } from "./project-list.js";

describe("CompanionProjectList", () => {
  it("returns project metadata immediately while loading summaries once", async () => {
    const summary = deferred<ProjectReviewSummaryView | null>();
    const loadSummary = vi.fn(async () => summary.promise);
    const onSummaryUpdated = vi.fn();
    const projects = new CompanionProjectList({
      listProjects: () => [project()],
      loadSummary,
      onSummaryUpdated
    });

    expect(projects.list()).toEqual([project()]);
    expect(projects.list()).toEqual([project()]);
    expect(loadSummary).toHaveBeenCalledTimes(1);

    summary.resolve(reviewSummary(2));
    await flushPromises();

    expect(onSummaryUpdated).toHaveBeenCalledWith("project-1");
    expect(projects.list()).toEqual([{ ...project(), reviewSummary: reviewSummary(2) }]);
  });

  it("discards an in-flight summary after invalidation and refreshes once", async () => {
    const first = deferred<ProjectReviewSummaryView | null>();
    const second = deferred<ProjectReviewSummaryView | null>();
    const loadSummary = vi
      .fn<() => Promise<ProjectReviewSummaryView | null>>()
      .mockImplementationOnce(async () => first.promise)
      .mockImplementationOnce(async () => second.promise);
    const onSummaryUpdated = vi.fn();
    const projects = new CompanionProjectList({
      listProjects: () => [project()],
      loadSummary,
      onSummaryUpdated
    });

    projects.list();
    projects.invalidate("project-1");
    first.resolve(reviewSummary(1));
    await flushPromises();

    expect(loadSummary).toHaveBeenCalledTimes(2);
    expect(onSummaryUpdated).not.toHaveBeenCalled();

    second.resolve(reviewSummary(3));
    await flushPromises();

    expect(onSummaryUpdated).toHaveBeenCalledWith("project-1");
    expect(projects.list()).toEqual([{ ...project(), reviewSummary: reviewSummary(3) }]);
  });

  it("keeps the last good summary while invalidating an unchanged value", async () => {
    const refreshed = deferred<ProjectReviewSummaryView | null>();
    const loadSummary = vi
      .fn<() => Promise<ProjectReviewSummaryView | null>>()
      .mockResolvedValueOnce(reviewSummary(1))
      .mockImplementationOnce(async () => refreshed.promise);
    const onSummaryUpdated = vi.fn();
    const projects = new CompanionProjectList({
      listProjects: () => [project()],
      loadSummary,
      onSummaryUpdated
    });

    projects.list();
    await flushPromises();
    onSummaryUpdated.mockClear();

    projects.invalidate("project-1");
    expect(projects.list()).toEqual([{ ...project(), reviewSummary: reviewSummary(1) }]);

    refreshed.resolve(reviewSummary(1));
    await flushPromises();

    expect(onSummaryUpdated).not.toHaveBeenCalled();
    expect(projects.list()).toEqual([{ ...project(), reviewSummary: reviewSummary(1) }]);
  });

  it("discards a summary when a project is removed and reopened during its load", async () => {
    let listedProjects: readonly RecentProjectView[] = [project()];
    const first = deferred<ProjectReviewSummaryView | null>();
    const second = deferred<ProjectReviewSummaryView | null>();
    const loadSummary = vi
      .fn<() => Promise<ProjectReviewSummaryView | null>>()
      .mockImplementationOnce(async () => first.promise)
      .mockImplementationOnce(async () => second.promise);
    const onSummaryUpdated = vi.fn();
    const projects = new CompanionProjectList({
      listProjects: () => listedProjects,
      loadSummary,
      onSummaryUpdated
    });

    projects.list();
    listedProjects = [];
    expect(projects.list()).toEqual([]);
    listedProjects = [project()];
    expect(projects.list()).toEqual([project()]);

    first.resolve(reviewSummary(1));
    await flushPromises();

    expect(loadSummary).toHaveBeenCalledTimes(2);
    expect(onSummaryUpdated).not.toHaveBeenCalled();

    second.resolve(reviewSummary(2));
    await flushPromises();

    expect(onSummaryUpdated).toHaveBeenCalledWith("project-1");
    expect(projects.list()).toEqual([{ ...project(), reviewSummary: reviewSummary(2) }]);
  });

  it("notifies clients when summary loading removes a vanished project", async () => {
    let listedProjects: readonly RecentProjectView[] = [project()];
    const loadSummary = vi.fn(async () => {
      listedProjects = [];
      return null;
    });
    const onSummaryUpdated = vi.fn();
    const projects = new CompanionProjectList({
      listProjects: () => listedProjects,
      loadSummary,
      onSummaryUpdated
    });

    expect(projects.list()).toEqual([project()]);
    await flushPromises();

    expect(onSummaryUpdated).toHaveBeenCalledWith("project-1");
    expect(projects.list()).toEqual([]);
  });

  it("evicts a closed project before the same deterministic id is reopened", async () => {
    const refreshed = deferred<ProjectReviewSummaryView | null>();
    const reopened = deferred<ProjectReviewSummaryView | null>();
    const loadSummary = vi
      .fn<() => Promise<ProjectReviewSummaryView | null>>()
      .mockResolvedValueOnce(reviewSummary(1))
      .mockImplementationOnce(async () => refreshed.promise)
      .mockImplementationOnce(async () => reopened.promise);
    const onSummaryUpdated = vi.fn();
    const projects = new CompanionProjectList({
      listProjects: () => [project()],
      loadSummary,
      onSummaryUpdated
    });

    projects.list();
    await flushPromises();
    projects.invalidate("project-1");
    projects.remove("project-1");

    expect(projects.list()).toEqual([project()]);
    expect(loadSummary).toHaveBeenCalledTimes(3);

    reopened.resolve(reviewSummary(2));
    await flushPromises();

    expect(projects.list()).toEqual([{ ...project(), reviewSummary: reviewSummary(2) }]);

    refreshed.resolve(reviewSummary(1));
    await flushPromises();

    expect(projects.list()).toEqual([{ ...project(), reviewSummary: reviewSummary(2) }]);
  });

  it("waits for invalidation before retrying a failed summary", async () => {
    const loadSummary = vi
      .fn<() => Promise<ProjectReviewSummaryView | null>>()
      .mockRejectedValueOnce(new Error("git failed"))
      .mockResolvedValueOnce(reviewSummary(1));
    const projects = new CompanionProjectList({
      listProjects: () => [project()],
      loadSummary,
      onSummaryUpdated: vi.fn()
    });

    projects.list();
    await flushPromises();
    projects.list();

    expect(loadSummary).toHaveBeenCalledTimes(1);

    projects.invalidate("project-1");
    await flushPromises();

    expect(loadSummary).toHaveBeenCalledTimes(2);
  });

  it("refreshes stale cached summaries without blocking the project list", async () => {
    let now = 0;
    const refreshed = deferred<ProjectReviewSummaryView | null>();
    const loadSummary = vi
      .fn<() => Promise<ProjectReviewSummaryView | null>>()
      .mockResolvedValueOnce(reviewSummary(1))
      .mockImplementationOnce(async () => refreshed.promise)
      .mockResolvedValue(reviewSummary(2));
    const onSummaryUpdated = vi.fn();
    const projects = new CompanionProjectList({
      cacheTtlMs: 15_000,
      listProjects: () => [project()],
      loadSummary,
      now: () => now,
      onSummaryUpdated
    });

    projects.list();
    await flushPromises();
    onSummaryUpdated.mockClear();

    now = 14_999;
    expect(projects.list()).toEqual([{ ...project(), reviewSummary: reviewSummary(1) }]);
    expect(loadSummary).toHaveBeenCalledTimes(1);

    now = 15_000;
    expect(projects.list()).toEqual([{ ...project(), reviewSummary: reviewSummary(1) }]);
    expect(loadSummary).toHaveBeenCalledTimes(2);

    refreshed.resolve(reviewSummary(2));
    await flushPromises();

    expect(onSummaryUpdated).toHaveBeenCalledWith("project-1");
    expect(projects.list()).toEqual([{ ...project(), reviewSummary: reviewSummary(2) }]);

    now = 30_000;
    projects.list();
    await flushPromises();

    expect(loadSummary).toHaveBeenCalledTimes(3);
    expect(onSummaryUpdated).toHaveBeenCalledTimes(1);
  });
});

function project(): RecentProjectView {
  return {
    defaultDiffTargetMode: "working_tree",
    id: "project-1",
    name: "Difftray",
    path: "/repo"
  };
}

function reviewSummary(reviewedVisibleFiles: number): ProjectReviewSummaryView {
  return {
    attentionCount: 0,
    progress: {
      reviewedVisibleFiles,
      totalVisibleReviewableFiles: 3
    }
  };
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
