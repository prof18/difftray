import { describe, expect, it } from "vitest";

import {
  carryLoadedDiffsForward,
  shouldRefreshCachedWorkspaceAfterTabSwitch,
  shouldApplySilentWorkspaceRefresh
} from "./workspace-refresh.js";

describe("shouldApplySilentWorkspaceRefresh", () => {
  it("applies a silent refresh only when the original project is still active and idle", () => {
    expect(
      shouldApplySilentWorkspaceRefresh({
        activeProjectId: "difftray",
        applyVersion: 2,
        loadState: "idle",
        paletteOpen: false,
        requestApplyVersion: 2,
        requestProjectId: "difftray",
        settingsOpen: false
      })
    ).toBe(true);
  });

  it("ignores a silent refresh after the active project changes", () => {
    expect(
      shouldApplySilentWorkspaceRefresh({
        activeProjectId: "reader-flow",
        applyVersion: 2,
        loadState: "idle",
        paletteOpen: false,
        requestApplyVersion: 2,
        requestProjectId: "difftray",
        settingsOpen: false
      })
    ).toBe(false);
  });

  it("ignores a silent refresh after another workspace update starts", () => {
    expect(
      shouldApplySilentWorkspaceRefresh({
        activeProjectId: "difftray",
        applyVersion: 3,
        loadState: "idle",
        paletteOpen: false,
        requestApplyVersion: 2,
        requestProjectId: "difftray",
        settingsOpen: false
      })
    ).toBe(false);
  });

  it("does not apply while a visible load or overlay is active", () => {
    const input = {
      activeProjectId: "difftray",
      applyVersion: 2,
      loadState: "loading" as const,
      paletteOpen: false,
      requestApplyVersion: 2,
      requestProjectId: "difftray",
      settingsOpen: false
    };

    expect(shouldApplySilentWorkspaceRefresh(input)).toBe(false);
    expect(
      shouldApplySilentWorkspaceRefresh({
        ...input,
        loadState: "idle",
        paletteOpen: true
      })
    ).toBe(false);
    expect(
      shouldApplySilentWorkspaceRefresh({
        ...input,
        loadState: "idle",
        settingsOpen: true
      })
    ).toBe(false);
  });
});

describe("shouldRefreshCachedWorkspaceAfterTabSwitch", () => {
  it("refreshes silently after switching to a different cached project", () => {
    expect(
      shouldRefreshCachedWorkspaceAfterTabSwitch({
        activeProjectId: "difftray",
        loadState: "idle",
        nextProjectId: "reader-flow",
        paletteOpen: false,
        settingsOpen: false
      })
    ).toBe(true);
  });

  it("does not refresh when reselecting the active project", () => {
    expect(
      shouldRefreshCachedWorkspaceAfterTabSwitch({
        activeProjectId: "difftray",
        loadState: "idle",
        nextProjectId: "difftray",
        paletteOpen: false,
        settingsOpen: false
      })
    ).toBe(false);
  });

  it("does not refresh while a visible load or overlay is active", () => {
    const input = {
      activeProjectId: "difftray",
      loadState: "loading" as const,
      nextProjectId: "reader-flow",
      paletteOpen: false,
      settingsOpen: false
    };

    expect(shouldRefreshCachedWorkspaceAfterTabSwitch(input)).toBe(false);
    expect(
      shouldRefreshCachedWorkspaceAfterTabSwitch({
        ...input,
        loadState: "idle",
        paletteOpen: true
      })
    ).toBe(false);
    expect(
      shouldRefreshCachedWorkspaceAfterTabSwitch({
        ...input,
        loadState: "idle",
        settingsOpen: true
      })
    ).toBe(false);
  });
});

describe("carryLoadedDiffsForward", () => {
  it("keeps loaded patch content when a refreshed file has the same diff hash", () => {
    const current = workspace({
      files: [
        file({
          additions: 4,
          deletions: 1,
          diffHash: "hash-a",
          diffLoaded: true,
          invalidated: false,
          newText: "next",
          oldText: "previous",
          patch: "diff --git a/src/app.ts b/src/app.ts",
          path: "src/app.ts",
          reviewed: false
        })
      ]
    });
    const next = workspace({
      files: [
        file({
          additions: 0,
          deletions: 0,
          diffHash: "hash-a",
          diffLoaded: false,
          invalidated: true,
          path: "src/app.ts",
          reviewed: true
        })
      ]
    });

    expect(carryLoadedDiffsForward(current, next).files[0]).toEqual(
      expect.objectContaining({
        additions: 4,
        deletions: 1,
        diffLoaded: true,
        invalidated: true,
        newText: "next",
        oldText: "previous",
        patch: "diff --git a/src/app.ts b/src/app.ts",
        reviewed: true
      })
    );
  });

  it("drops loaded patch content when the diff hash changes", () => {
    const current = workspace({
      files: [
        file({
          diffHash: "hash-a",
          diffLoaded: true,
          patch: "old patch",
          path: "src/app.ts"
        })
      ]
    });
    const next = workspace({
      files: [
        file({
          diffHash: "hash-b",
          diffLoaded: false,
          path: "src/app.ts"
        })
      ]
    });

    expect(carryLoadedDiffsForward(current, next).files[0]).toEqual(next.files[0]);
  });
});

function workspace(patch: Partial<ReviewWorkspaceView> = {}): ReviewWorkspaceView {
  return {
    comments: [],
    files: [],
    progress: {
      reviewedVisibleFiles: 0,
      totalVisibleReviewableFiles: 0
    },
    project: {
      id: "difftray",
      name: "Difftray",
      path: "/tmp/difftray"
    },
    reviewTarget: {
      headSha: "abc123",
      id: "target",
      kind: "working_tree"
    },
    ...patch
  };
}

function file(patch: Partial<ReviewFileView> = {}): ReviewFileView {
  return {
    additions: 0,
    deletions: 0,
    diffHash: "hash-a",
    diffLoaded: false,
    generated: false,
    invalidated: false,
    path: "src/app.ts",
    reviewable: true,
    reviewed: false,
    status: "modified",
    visible: true,
    ...patch
  };
}
