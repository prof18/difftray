import { describe, expect, it } from "vitest";

import {
  delayedTabSwitchLoaderMs,
  loadProgressDetail,
  loadStatusFromProgress,
  projectTabTitle,
  tabLoadingText,
  tabReviewCountText,
  tabSwitchLoaderDelayMs
} from "./workspace-load-status.js";

describe("loadStatusFromProgress", () => {
  it("formats loading file progress with counts and current path", () => {
    const progress = projectProgress({
      loadedFiles: 3,
      phase: "loading_files",
      path: "src/App.tsx",
      totalFiles: 12
    });

    expect(loadProgressDetail(progress)).toBe("3 / 12 files · src/App.tsx");
    expect(loadStatusFromProgress(progress)).toEqual({
      detail: "3 / 12 files · src/App.tsx",
      loadedFiles: 3,
      title: "Loading files",
      totalFiles: 12
    });
  });

  it("falls back to the project name for non-file phases", () => {
    expect(loadProgressDetail(projectProgress({ phase: "resolving_target" }))).toBe(
      "Difftray"
    );
  });
});

describe("tab status text", () => {
  it("uses compact counts when total progress is available", () => {
    expect(
      tabLoadingText({
        detail: "Difftray",
        loadedFiles: 2,
        title: "Loading",
        totalFiles: 8
      })
    ).toBe("2/8");
  });

  it("uses a fallback label without usable totals", () => {
    expect(tabLoadingText({ detail: "Difftray", loadedFiles: 2, title: "Loading" })).toBe(
      "Loading"
    );
  });

  it("delays the tab switch loader for small projects only", () => {
    expect(tabSwitchLoaderDelayMs(project(20))).toBe(delayedTabSwitchLoaderMs);
    expect(tabSwitchLoaderDelayMs(project(76))).toBe(0);
  });

  it("formats review counts and tab titles", () => {
    expect(tabReviewCountText(undefined)).toBe("-/-");
    expect(tabReviewCountText(summary(1, 3, 0))).toBe("1/3");
    expect(projectTabTitle(project(3), summary(1, 3, 2), false)).toBe(
      "/repo/difftray · 2 reviewed files changed"
    );
    expect(projectTabTitle(project(0), summary(0, 0, 0), false)).toBe(
      "/repo/difftray · No changed files"
    );
    expect(projectTabTitle(project(3), summary(3, 3, 0), false)).toBe(
      "/repo/difftray · All files reviewed"
    );
    expect(projectTabTitle(project(3), summary(1, 3, 0), false)).toBe(
      "/repo/difftray · 1 of 3 files reviewed"
    );
  });
});

function projectProgress(
  patch: Partial<ProjectLoadProgressView>
): ProjectLoadProgressView {
  return {
    message: "Loading files",
    phase: "loading_files",
    projectId: "project-1",
    projectName: "Difftray",
    projectPath: "/repo/difftray",
    ...patch
  };
}

function project(totalVisibleReviewableFiles: number): RecentProjectView {
  return {
    id: "project-1",
    name: "Difftray",
    path: "/repo/difftray",
    reviewSummary: summary(0, totalVisibleReviewableFiles, 0)
  };
}

function summary(
  reviewedVisibleFiles: number,
  totalVisibleReviewableFiles: number,
  attentionCount: number
): ProjectReviewSummaryView {
  return {
    attentionCount,
    progress: {
      reviewedVisibleFiles,
      totalVisibleReviewableFiles
    }
  };
}
