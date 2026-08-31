import { describe, expect, it } from "vitest";

import {
  applyLoadedFileDiffToWorkspace,
  carryLoadedDiffsForward,
  invalidateWorkspaceLoadRequest,
  isWorkspaceScopedCompletionCurrent,
  isWorkspaceLoadRequestCurrent,
  isFileDiffLoaded,
  loadReplacementWorkspace,
  openReplacementWorkspaceCandidates,
  reconcileProjectTabsAfterRemoval,
  projectTabRemovalDisposition,
  shouldClearInvalidatedDisplayedWorkspace,
  shouldClearUnavailableDisplayedWorkspace,
  shouldDismissWorktreePickerForProjectRemoval,
  shouldRefreshCachedWorkspaceAfterTabSwitch,
  shouldReloadWorkspaceAfterProjectChange,
  shouldCancelProjectsOpenedRequest,
  shouldApplySilentWorkspaceRefresh,
  shouldInvalidateWorkspaceLoadForTabRemoval
} from "./workspace-refresh.js";

type TestProject = {
  readonly defaultDiffTargetMode?: "branch" | "working_tree";
  readonly id: string;
  readonly name?: string;
  readonly reviewSummary?: { readonly total: number };
};

describe("workspace load request invalidation", () => {
  it("makes a silent apply stale when a tab removal advances the request after its pre-apply check", () => {
    const requestRef = { current: 4 };
    const silentRefreshRequestId = requestRef.current;

    expect(isWorkspaceLoadRequestCurrent(silentRefreshRequestId, requestRef)).toBe(true);

    invalidateWorkspaceLoadRequest(requestRef);

    expect(isWorkspaceLoadRequestCurrent(silentRefreshRequestId, requestRef)).toBe(false);
    expect(isWorkspaceLoadRequestCurrent(requestRef.current, requestRef)).toBe(true);
  });

  it("invalidates workspace loading only when the active tab is removed", () => {
    expect(shouldInvalidateWorkspaceLoadForTabRemoval("active", "active")).toBe(true);
    expect(shouldInvalidateWorkspaceLoadForTabRemoval("active", "inactive")).toBe(false);
  });

  it("invalidates bootstrap for any project removal", () => {
    expect(
      shouldInvalidateWorkspaceLoadForTabRemoval("loading-project", "closing-project", {
        invalidatesOnAnyProjectRemoval: true,
        projectId: undefined
      })
    ).toBe(true);
  });

  it("matches the intended project for a normal targetless load", () => {
    expect(
      shouldInvalidateWorkspaceLoadForTabRemoval("active", "inactive", {
        invalidatesOnAnyProjectRemoval: false,
        projectId: undefined
      })
    ).toBe(false);
  });

  it("does not invalidate a switch when the old displayed project is removed", () => {
    expect(
      shouldInvalidateWorkspaceLoadForTabRemoval(
        "displayed-project",
        "displayed-project",
        { invalidatesOnAnyProjectRemoval: false, projectId: "target-project" }
      )
    ).toBe(false);
  });

  it("invalidates a switch when its target project is removed", () => {
    expect(
      shouldInvalidateWorkspaceLoadForTabRemoval("displayed-project", "target-project", {
        invalidatesOnAnyProjectRemoval: false,
        projectId: "target-project"
      })
    ).toBe(true);
  });

  it("uses the current workspace for both removal dispositions during a cached tab switch", () => {
    const renderCapturedProjectId = "project-a";
    const currentWorkspaceProjectId = "project-b";

    expect(
      projectTabRemovalDisposition(renderCapturedProjectId, "project-b", {
        invalidatesOnAnyProjectRemoval: false,
        projectId: undefined
      })
    ).toEqual({ closingActiveProject: false, displayedProjectClosed: false });

    expect(
      projectTabRemovalDisposition(currentWorkspaceProjectId, "project-b", {
        invalidatesOnAnyProjectRemoval: false,
        projectId: undefined
      })
    ).toEqual({ closingActiveProject: true, displayedProjectClosed: true });
  });

  it("cancels only the opened-project request for the project being removed", () => {
    expect(shouldCancelProjectsOpenedRequest("closing", "closing")).toBe(true);
    expect(shouldCancelProjectsOpenedRequest("still-opening", "closing")).toBe(false);
    expect(shouldCancelProjectsOpenedRequest(undefined, "closing")).toBe(false);
  });
});

describe("worktree picker project removal", () => {
  it("dismisses only a picker scoped to the removed project", () => {
    expect(shouldDismissWorktreePickerForProjectRemoval("project-a", "project-a")).toBe(
      true
    );
    expect(shouldDismissWorktreePickerForProjectRemoval("project-b", "project-a")).toBe(
      false
    );
    expect(shouldDismissWorktreePickerForProjectRemoval(undefined, "project-a")).toBe(
      false
    );
  });
});

describe("replacement workspace loading", () => {
  it("excludes stale reconciled tabs that are absent from the authoritative open list", () => {
    const currentProjects = [
      { id: "closed-active", name: "Closed active" },
      { id: "closed-concurrently", name: "Closed concurrently" },
      { id: "still-open", name: "Still open" }
    ];
    const openProjects = [{ id: "still-open" }];
    const reconciledProjects = reconcileProjectTabsAfterRemoval(
      currentProjects,
      "closed-active",
      openProjects,
      "stale"
    );

    expect(reconciledProjects).toEqual(currentProjects.slice(1));

    expect(openReplacementWorkspaceCandidates(reconciledProjects, openProjects)).toEqual([
      { id: "still-open", name: "Still open" }
    ]);
  });

  it("continues after a failed candidate and returns the first error after all candidates fail", async () => {
    const firstError = new Error("first replacement failed");
    const secondError = new Error("second replacement failed");
    const attemptedProjects: string[] = [];

    await expect(
      loadReplacementWorkspace(["project-b", "project-c"], async (projectId) => {
        attemptedProjects.push(projectId);
        throw projectId === "project-b" ? firstError : secondError;
      })
    ).resolves.toEqual({ firstError, kind: "exhausted" });
    expect(attemptedProjects).toEqual(["project-b", "project-c"]);
  });
});

describe("invalidated displayed workspace fallback", () => {
  it("clears a closed displayed workspace when its in-flight replacement fails", () => {
    expect(shouldClearInvalidatedDisplayedWorkspace("project-a", "project-a")).toBe(true);
  });

  it("does not clear after another workspace has already replaced the closed project", () => {
    expect(shouldClearInvalidatedDisplayedWorkspace("project-a", "project-b")).toBe(
      false
    );
    expect(shouldClearInvalidatedDisplayedWorkspace(undefined, "project-a")).toBe(false);
  });
});

describe("unavailable displayed workspace", () => {
  it("clears only when the unavailable load targets the displayed project", () => {
    expect(shouldClearUnavailableDisplayedWorkspace("project-a", "project-a")).toBe(true);
    expect(shouldClearUnavailableDisplayedWorkspace("project-b", "project-a")).toBe(
      false
    );
    expect(shouldClearUnavailableDisplayedWorkspace(undefined, "project-a")).toBe(false);
  });
});

describe("workspace-scoped async completion", () => {
  it("accepts a completion only for the same project and apply generation", () => {
    const request = { applyVersion: 7, projectId: "project-a" };

    expect(
      isWorkspaceScopedCompletionCurrent(request, {
        applyVersion: 7,
        projectId: "project-a"
      })
    ).toBe(true);
    expect(
      isWorkspaceScopedCompletionCurrent(request, {
        applyVersion: 8,
        projectId: "project-a"
      })
    ).toBe(false);
    expect(
      isWorkspaceScopedCompletionCurrent(request, {
        applyVersion: 7,
        projectId: "project-b"
      })
    ).toBe(false);
    expect(
      isWorkspaceScopedCompletionCurrent(request, {
        applyVersion: 7,
        projectId: undefined
      })
    ).toBe(false);
  });
});

describe("reconcileProjectTabsAfterRemoval", () => {
  it("removes the closed tab even when the response still contains it", () => {
    expect(
      reconcileProjectTabsAfterRemoval([{ id: "closed", name: "Closed" }], "closed", [
        { id: "closed", name: "Closed (stale response)" }
      ])
    ).toEqual([]);
  });

  it("merges response metadata into retained tabs without clearing local metadata", () => {
    expect(
      reconcileProjectTabsAfterRemoval(
        [{ id: "kept", name: "Local name", reviewSummary: { total: 3 } }],
        "closed",
        [{ id: "kept", name: "Server name" }]
      )
    ).toEqual([{ id: "kept", name: "Server name", reviewSummary: { total: 3 } }]);
  });

  it("preserves current-only tabs and current metadata for stale responses", () => {
    const currentProjects: readonly TestProject[] = [
      { id: "closed", name: "Closed" },
      {
        defaultDiffTargetMode: "working_tree",
        id: "newer",
        name: "Newer",
        reviewSummary: { total: 4 }
      },
      { id: "added-by-refresh", name: "Added by refresh" }
    ];

    expect(
      reconcileProjectTabsAfterRemoval(
        currentProjects,
        "closed",
        [{ id: "newer", name: "Older response", defaultDiffTargetMode: "branch" }],
        "stale"
      )
    ).toEqual([
      {
        defaultDiffTargetMode: "working_tree",
        id: "newer",
        name: "Newer",
        reviewSummary: { total: 4 }
      },
      { id: "added-by-refresh", name: "Added by refresh" }
    ]);

    expect(
      reconcileProjectTabsAfterRemoval(
        currentProjects,
        "closed",
        [{ id: "newer", name: "Newer (from removal)" }],
        "current"
      )
    ).toEqual([
      {
        defaultDiffTargetMode: "working_tree",
        id: "newer",
        name: "Newer (from removal)",
        reviewSummary: { total: 4 }
      }
    ]);
  });
});

describe("shouldReloadWorkspaceAfterProjectChange", () => {
  const state = {
    activeProjectId: "difftray",
    droppedRepositoryPreviewOpen: false,
    eventProjectId: "difftray",
    externalDropActive: false,
    loadState: "idle" as const,
    paletteOpen: false,
    repositoryPickerOpen: false,
    settingsOpen: false,
    worktreePickerOpen: false
  };

  it("reloads the active workspace when no overlay is open", () => {
    expect(shouldReloadWorkspaceAfterProjectChange(state)).toBe(true);
  });

  it("does not reload while an external repository drop is active", () => {
    expect(
      shouldReloadWorkspaceAfterProjectChange({ ...state, externalDropActive: true })
    ).toBe(false);
  });
});

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

describe("applyLoadedFileDiffToWorkspace", () => {
  it("marks the matching file as loaded without changing unrelated files", () => {
    const current = workspace({
      files: [
        file({
          path: "src/app.ts"
        }),
        file({
          diffHash: "hash-b",
          path: "src/other.ts"
        })
      ]
    });

    const next = applyLoadedFileDiffToWorkspace(current, {
      additions: 8,
      deletions: 3,
      newText: "next",
      oldText: "previous",
      patch: "diff --git a/src/app.ts b/src/app.ts",
      path: "src/app.ts",
      status: "modified"
    });

    expect(next.files[0]).toEqual(
      expect.objectContaining({
        additions: 8,
        deletions: 3,
        diffLoaded: true,
        newText: "next",
        oldText: "previous",
        patch: "diff --git a/src/app.ts b/src/app.ts"
      })
    );
    expect(next.files[1]).toBe(current.files[1]);
  });
});

describe("isFileDiffLoaded", () => {
  it("requires both the loaded flag and patch content", () => {
    expect(
      isFileDiffLoaded(
        workspace({
          files: [
            file({
              diffLoaded: true,
              patch: "diff --git a/src/app.ts b/src/app.ts"
            })
          ]
        }),
        "src/app.ts"
      )
    ).toBe(true);

    expect(
      isFileDiffLoaded(
        workspace({
          files: [
            file({
              diffLoaded: true
            })
          ]
        }),
        "src/app.ts"
      )
    ).toBe(false);
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
