export type WorkspaceLoadState = "idle" | "loading";

export type WorkspaceLoadRequestRef = { current: number };

export type WorkspaceLoadTarget = {
  readonly invalidatesOnAnyProjectRemoval: boolean;
  readonly projectId: string | undefined;
};

export type ProjectTabRemovalDisposition = {
  readonly closingActiveProject: boolean;
  readonly displayedProjectClosed: boolean;
};

export type WorkspaceScopedCompletion = {
  readonly applyVersion: number;
  readonly projectId: string;
};

export type WorkspaceScopedCompletionState = {
  readonly applyVersion: number;
  readonly projectId: string | undefined;
};

export type ReplacementWorkspaceLoadResult<TWorkspace> =
  | { readonly kind: "loaded"; readonly workspace: TWorkspace }
  | { readonly firstError?: unknown; readonly kind: "exhausted" };

export type SilentWorkspaceRefreshState = {
  readonly activeProjectId: string | undefined;
  readonly applyVersion: number;
  readonly loadState: WorkspaceLoadState;
  readonly paletteOpen: boolean;
  readonly requestApplyVersion: number;
  readonly requestProjectId: string;
  readonly settingsOpen: boolean;
};

export type CachedWorkspaceTabSwitchRefreshState = {
  readonly activeProjectId: string | undefined;
  readonly loadState: WorkspaceLoadState;
  readonly nextProjectId: string;
  readonly paletteOpen: boolean;
  readonly settingsOpen: boolean;
};

export type ProjectChangeRefreshState = {
  readonly activeProjectId: string | undefined;
  readonly droppedRepositoryPreviewOpen: boolean;
  readonly eventProjectId: string;
  readonly externalDropActive: boolean;
  readonly loadState: WorkspaceLoadState;
  readonly paletteOpen: boolean;
  readonly repositoryPickerOpen: boolean;
  readonly settingsOpen: boolean;
  readonly worktreePickerOpen: boolean;
};

export type LoadedFileDiffView = Pick<
  ReviewFileView,
  "additions" | "deletions" | "path" | "status"
> &
  Partial<Pick<ReviewFileView, "newText" | "oldText">> & {
    readonly patch: string;
  };

export function invalidateWorkspaceLoadRequest(
  requestRef: WorkspaceLoadRequestRef
): number {
  requestRef.current += 1;
  return requestRef.current;
}

export function isWorkspaceLoadRequestCurrent(
  requestId: number,
  requestRef: WorkspaceLoadRequestRef
): boolean {
  return requestId === requestRef.current;
}

export async function loadReplacementWorkspace<TProject, TWorkspace>(
  candidateProjects: readonly TProject[],
  loadProject: (project: TProject) => Promise<TWorkspace | undefined>
): Promise<ReplacementWorkspaceLoadResult<TWorkspace>> {
  let firstError: unknown;

  for (const project of candidateProjects) {
    try {
      const workspace = await loadProject(project);

      if (workspace !== undefined) {
        return { kind: "loaded", workspace };
      }
    } catch (caughtError) {
      firstError ??= caughtError;
    }
  }

  return { firstError, kind: "exhausted" };
}

export function openReplacementWorkspaceCandidates<
  TProject extends { readonly id: string }
>(
  candidateProjects: readonly TProject[],
  openProjects: readonly { readonly id: string }[]
): readonly TProject[] {
  const openProjectIds = new Set(openProjects.map((project) => project.id));

  return candidateProjects.filter((project) => openProjectIds.has(project.id));
}

export function shouldClearInvalidatedDisplayedWorkspace(
  invalidatedProjectId: string | undefined,
  displayedProjectId: string | undefined
): boolean {
  return (
    invalidatedProjectId !== undefined && invalidatedProjectId === displayedProjectId
  );
}

export function shouldClearUnavailableDisplayedWorkspace(
  targetProjectId: string | undefined,
  displayedProjectId: string | undefined
): boolean {
  return targetProjectId !== undefined && targetProjectId === displayedProjectId;
}

export function isWorkspaceScopedCompletionCurrent(
  request: WorkspaceScopedCompletion,
  state: WorkspaceScopedCompletionState
): boolean {
  return (
    request.applyVersion === state.applyVersion && request.projectId === state.projectId
  );
}

export function shouldInvalidateWorkspaceLoadForTabRemoval(
  activeProjectId: string | undefined,
  removedProjectId: string,
  loadTarget?: Pick<WorkspaceLoadTarget, "invalidatesOnAnyProjectRemoval" | "projectId">
): boolean {
  return (
    loadTarget?.invalidatesOnAnyProjectRemoval === true ||
    (loadTarget?.projectId ?? activeProjectId) === removedProjectId
  );
}

export function projectTabRemovalDisposition(
  currentProjectId: string | undefined,
  removedProjectId: string,
  loadTarget?: Pick<WorkspaceLoadTarget, "invalidatesOnAnyProjectRemoval" | "projectId">
): ProjectTabRemovalDisposition {
  return {
    closingActiveProject: shouldInvalidateWorkspaceLoadForTabRemoval(
      currentProjectId,
      removedProjectId,
      loadTarget
    ),
    displayedProjectClosed: currentProjectId === removedProjectId
  };
}

export function reconcileProjectTabsAfterRemoval<
  TProject extends { readonly id: string }
>(
  currentProjects: readonly TProject[],
  removedProjectId: string,
  nextProjects: readonly TProject[],
  mode: "current" | "stale" = "current"
): readonly TProject[] {
  const nextProjectsById = new Map(
    nextProjects.map((project) => [project.id, project] as const)
  );
  const reconciledProjects = currentProjects
    .filter((project) => project.id !== removedProjectId)
    .filter((project) => mode === "stale" || nextProjectsById.has(project.id))
    .map((project) => {
      const nextProject = nextProjectsById.get(project.id);

      return mode === "stale" || !nextProject ? project : { ...project, ...nextProject };
    });
  const reconciledProjectIds = new Set(reconciledProjects.map((project) => project.id));

  if (mode === "current") {
    for (const project of nextProjects) {
      if (project.id !== removedProjectId && !reconciledProjectIds.has(project.id)) {
        reconciledProjects.push(project);
      }
    }
  }

  return reconciledProjects;
}

export function shouldApplySilentWorkspaceRefresh(
  state: SilentWorkspaceRefreshState
): boolean {
  return (
    state.activeProjectId === state.requestProjectId &&
    state.applyVersion === state.requestApplyVersion &&
    state.loadState === "idle" &&
    !state.paletteOpen &&
    !state.settingsOpen
  );
}

export function shouldCancelProjectsOpenedRequest(
  openingProjectId: string | undefined,
  closedProjectId: string
): boolean {
  return openingProjectId === closedProjectId;
}

export function shouldDismissWorktreePickerForProjectRemoval(
  worktreePickerProjectId: string | undefined,
  removedProjectId: string
): boolean {
  return worktreePickerProjectId === removedProjectId;
}

export function shouldRefreshCachedWorkspaceAfterTabSwitch(
  state: CachedWorkspaceTabSwitchRefreshState
): boolean {
  return (
    state.activeProjectId !== undefined &&
    state.activeProjectId !== state.nextProjectId &&
    state.loadState === "idle" &&
    !state.paletteOpen &&
    !state.settingsOpen
  );
}

export function shouldReloadWorkspaceAfterProjectChange(
  state: ProjectChangeRefreshState
): boolean {
  return (
    state.activeProjectId === state.eventProjectId &&
    state.loadState === "idle" &&
    !state.droppedRepositoryPreviewOpen &&
    !state.externalDropActive &&
    !state.paletteOpen &&
    !state.repositoryPickerOpen &&
    !state.settingsOpen &&
    !state.worktreePickerOpen
  );
}

export function carryLoadedDiffsForward(
  currentWorkspace: ReviewWorkspaceView | undefined,
  nextWorkspace: ReviewWorkspaceView
): ReviewWorkspaceView {
  if (
    currentWorkspace?.project.id !== nextWorkspace.project.id ||
    currentWorkspace.reviewTarget.id !== nextWorkspace.reviewTarget.id
  ) {
    return nextWorkspace;
  }

  const loadedFilesByPath = new Map(
    currentWorkspace.files.filter(hasLoadedPatch).map((file) => [file.path, file])
  );

  return {
    ...nextWorkspace,
    files: nextWorkspace.files.map((nextFile) => {
      const currentFile = loadedFilesByPath.get(nextFile.path);

      if (currentFile?.diffHash !== nextFile.diffHash) {
        return nextFile;
      }

      return {
        ...nextFile,
        additions: currentFile.additions,
        deletions: currentFile.deletions,
        diffLoaded: true,
        ...(currentFile.newText !== undefined ? { newText: currentFile.newText } : {}),
        ...(currentFile.oldText !== undefined ? { oldText: currentFile.oldText } : {}),
        patch: currentFile.patch
      };
    })
  };
}

export function applyLoadedFileDiffToWorkspace(
  workspace: ReviewWorkspaceView,
  loadedDiff: LoadedFileDiffView
): ReviewWorkspaceView {
  return {
    ...workspace,
    files: workspace.files.map((file) =>
      file.path === loadedDiff.path
        ? {
            ...file,
            additions: loadedDiff.additions,
            deletions: loadedDiff.deletions,
            diffLoaded: true,
            patch: loadedDiff.patch,
            status: loadedDiff.status,
            ...(loadedDiff.newText !== undefined ? { newText: loadedDiff.newText } : {}),
            ...(loadedDiff.oldText !== undefined ? { oldText: loadedDiff.oldText } : {})
          }
        : file
    )
  };
}

export function isFileDiffLoaded(
  workspace: ReviewWorkspaceView | undefined,
  filePath: string | undefined
): boolean {
  if (!workspace || !filePath) {
    return false;
  }

  const file = workspace.files.find((candidate) => candidate.path === filePath);

  return Boolean(file?.diffLoaded && file.patch !== undefined);
}

type LoadedPatchFileView = ReviewFileView & {
  readonly diffLoaded: true;
  readonly patch: string;
};

function hasLoadedPatch(file: ReviewFileView): file is LoadedPatchFileView {
  return file.diffLoaded && file.patch !== undefined;
}
