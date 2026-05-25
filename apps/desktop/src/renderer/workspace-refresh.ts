export type WorkspaceLoadState = "idle" | "loading";

export type SilentWorkspaceRefreshState = {
  readonly activeProjectId: string | undefined;
  readonly applyVersion: number;
  readonly loadState: WorkspaceLoadState;
  readonly paletteOpen: boolean;
  readonly requestApplyVersion: number;
  readonly requestProjectId: string;
  readonly settingsOpen: boolean;
};

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

type LoadedPatchFileView = ReviewFileView & {
  readonly diffLoaded: true;
  readonly patch: string;
};

function hasLoadedPatch(file: ReviewFileView): file is LoadedPatchFileView {
  return file.diffLoaded && file.patch !== undefined;
}
