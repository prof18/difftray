import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

export type DifftrayApi = {
  readonly appVersion: () => Promise<string>;
  readonly closeProject: (projectId: string) => Promise<readonly RecentProjectView[]>;
  readonly getAppSettings: () => Promise<AppSettingsView>;
  readonly getProjectReviewSummary: (
    projectId: string
  ) => Promise<ProjectReviewSummaryView | null>;
  readonly listInstalledEditors: () => Promise<readonly EditorPresetView[]>;
  readonly listProjectBranchRefs: (projectId: string) => Promise<readonly string[]>;
  readonly listRecentProjects: () => Promise<readonly RecentProjectView[]>;
  readonly loadFileDiff: (
    input: LoadFileDiffInput
  ) => Promise<ReviewFileDiffContentView | null>;
  readonly loadProject: (projectId: string) => Promise<ReviewWorkspaceView | null>;
  readonly onProjectChanged: (listener: ProjectChangedListener) => () => void;
  readonly onProjectLoadProgress: (listener: ProjectLoadProgressListener) => () => void;
  readonly markFileReviewed: (
    input: MarkFileReviewedInput
  ) => Promise<MarkReviewedResult>;
  readonly openFileInEditor: (input: OpenFileInEditorInput) => Promise<OpenFileResult>;
  readonly openProject: () => Promise<ReviewWorkspaceView | null>;
  readonly getProjectSettings: (projectId: string) => Promise<ProjectSettingsView>;
  readonly updateProjectSettings: (
    input: UpdateProjectSettingsInput
  ) => Promise<ProjectSettingsView>;
  readonly updateProjectDiffTarget: (
    input: UpdateProjectDiffTargetInput
  ) => Promise<ReviewWorkspaceView>;
  readonly updateAppSettings: (input: UpdateAppSettingsInput) => Promise<AppSettingsView>;
  readonly unmarkFileReviewed: (
    input: MarkFileReviewedInput
  ) => Promise<UnmarkReviewedResult>;
};

export type ThemeMode = "dark" | "light" | "system";

export type AppSettingsView = {
  readonly autoCollapseHunksOver: number;
  readonly defaultDiffMode: "split" | "unified";
  readonly editorArgs: string;
  readonly editorArgList: readonly string[];
  readonly editorCommand: string;
  readonly editorMode: "preset" | "system";
  readonly hideWhitespaceOnlyChanges: boolean;
  readonly notifyOnDrift: boolean;
  readonly reviewResetTrigger: "commit_sha" | "diff_content" | "line_count";
  readonly showGeneratedFiles: boolean;
  readonly themeMode: ThemeMode;
};

export type EditorPresetView = {
  readonly args: readonly string[];
  readonly command: string;
  readonly iconDataUrl?: string;
  readonly id: string;
  readonly name: string;
};

export type RecentProjectView = {
  readonly defaultBaseRef?: string;
  readonly id: string;
  readonly lastOpenedAt?: string;
  readonly name: string;
  readonly path: string;
  readonly reviewSummary?: ProjectReviewSummaryView;
};

export type ProjectReviewSummaryView = {
  readonly attentionCount: number;
  readonly progress: ReviewProgressView;
};

export type ProjectWatchReason =
  | "deleted"
  | "git_metadata"
  | "watcher_error"
  | "worktree";

export type ProjectChangedEvent = {
  readonly errorMessage?: string;
  readonly projectId: string;
  readonly projectPath: string;
  readonly reasons: readonly ProjectWatchReason[];
  readonly sequence: number;
};

export type ProjectChangedListener = (event: ProjectChangedEvent) => void;

export type ProjectLoadProgressPhase =
  | "loading_files"
  | "preparing_workspace"
  | "resolving_review_state"
  | "resolving_target"
  | "scanning_files";

export type ProjectLoadProgressView = {
  readonly loadedFiles?: number;
  readonly message: string;
  readonly path?: string;
  readonly phase: ProjectLoadProgressPhase;
  readonly projectId: string;
  readonly projectName: string;
  readonly projectPath: string;
  readonly totalFiles?: number;
};

export type ProjectLoadProgressListener = (progress: ProjectLoadProgressView) => void;

export type ReviewProgressView = {
  readonly reviewedVisibleFiles: number;
  readonly totalVisibleReviewableFiles: number;
};

export type ReviewFileView = {
  readonly additions: number;
  readonly deletions: number;
  readonly diffHash: string;
  readonly diffLoaded: boolean;
  readonly generated: boolean;
  readonly invalidated: boolean;
  readonly newText?: string;
  readonly oldText?: string;
  readonly path: string;
  readonly patch?: string;
  readonly previousPath?: string;
  readonly reviewable: boolean;
  readonly reviewed: boolean;
  readonly status: "added" | "deleted" | "mode_changed" | "modified" | "renamed";
  readonly visible: boolean;
};

export type LoadFileDiffInput = {
  readonly path: string;
  readonly projectId: string;
};

export type ReviewFileDiffContentView = {
  readonly additions: number;
  readonly deletions: number;
  readonly newText?: string;
  readonly oldText?: string;
  readonly patch: string;
  readonly path: string;
  readonly status: ReviewFileView["status"];
};

export type ReviewWorkspaceView = {
  readonly files: readonly ReviewFileView[];
  readonly project: RecentProjectView;
  readonly progress: ReviewProgressView;
  readonly reviewTarget: {
    readonly baseRefName?: string;
    readonly headRefName?: string;
    readonly headSha: string;
    readonly id: string;
    readonly kind: "branch" | "working_tree";
  };
};

export type MarkFileReviewedInput = {
  readonly displayedDiffHash: string;
  readonly path: string;
  readonly projectId: string;
  readonly reviewTargetId: string;
};

export type MarkReviewedResult =
  | {
      readonly reason: "file_missing" | "stale_diff";
      readonly status: "rejected";
      readonly workspace: ReviewWorkspaceView;
    }
  | {
      readonly status: "marked";
      readonly workspace: ReviewWorkspaceView;
    };

export type UnmarkReviewedResult =
  | {
      readonly reason: "file_missing" | "stale_diff";
      readonly status: "rejected";
      readonly workspace: ReviewWorkspaceView;
    }
  | {
      readonly status: "unmarked";
      readonly workspace: ReviewWorkspaceView;
    };

export type OpenFileInEditorInput = {
  readonly path: string;
  readonly projectId: string;
};

export type OpenFileResult =
  | {
      readonly reason: "file_missing" | "launch_failed";
      readonly status: "rejected";
    }
  | {
      readonly status: "opened";
    };

export type ProjectSettingsView = {
  readonly fileListCollapsed: boolean;
  readonly fileListWidth: number;
  readonly projectId: string;
};

export type UpdateProjectSettingsInput = {
  readonly fileListCollapsed: boolean;
  readonly fileListWidth: number;
  readonly projectId: string;
};

export type UpdateProjectDiffTargetInput =
  | {
      readonly mode: "working_tree";
      readonly projectId: string;
    }
  | {
      readonly baseRefName: string;
      readonly mode: "branch";
      readonly projectId: string;
    };

export type UpdateAppSettingsInput = {
  readonly autoCollapseHunksOver: number;
  readonly defaultDiffMode: "split" | "unified";
  readonly editorArgList?: readonly string[];
  readonly editorArgs?: string;
  readonly editorCommand?: string;
  readonly editorMode: "preset" | "system";
  readonly hideWhitespaceOnlyChanges: boolean;
  readonly notifyOnDrift: boolean;
  readonly reviewResetTrigger: "commit_sha" | "diff_content" | "line_count";
  readonly showGeneratedFiles: boolean;
  readonly themeMode: ThemeMode;
};

const api: DifftrayApi = {
  appVersion: async () => ipcRenderer.invoke("app:version") as Promise<string>,
  closeProject: async (projectId) =>
    ipcRenderer.invoke("projects:close", {
      projectId
    }) as Promise<readonly RecentProjectView[]>,
  getAppSettings: async () =>
    ipcRenderer.invoke("settings:getApp") as Promise<AppSettingsView>,
  getProjectReviewSummary: async (projectId) =>
    ipcRenderer.invoke("projects:getReviewSummary", {
      projectId
    }) as Promise<ProjectReviewSummaryView | null>,
  listInstalledEditors: async () =>
    ipcRenderer.invoke("editors:listInstalled") as Promise<readonly EditorPresetView[]>,
  listProjectBranchRefs: async (projectId) =>
    ipcRenderer.invoke("projects:listBranchRefs", {
      projectId
    }) as Promise<readonly string[]>,
  listRecentProjects: async () =>
    ipcRenderer.invoke("projects:listRecent") as Promise<readonly RecentProjectView[]>,
  loadFileDiff: async (input) =>
    ipcRenderer.invoke(
      "files:loadDiff",
      input
    ) as Promise<ReviewFileDiffContentView | null>,
  loadProject: async (projectId) =>
    ipcRenderer.invoke("projects:load", {
      projectId
    }) as Promise<ReviewWorkspaceView | null>,
  markFileReviewed: async (input) =>
    ipcRenderer.invoke("reviews:markFileReviewed", input) as Promise<MarkReviewedResult>,
  onProjectChanged: (listener) => {
    const handler = (_event: IpcRendererEvent, payload: unknown): void => {
      const projectChangedEvent = parseProjectChangedEvent(payload);

      if (projectChangedEvent) {
        listener(projectChangedEvent);
      }
    };

    ipcRenderer.on("projects:changed", handler);

    return () => {
      ipcRenderer.removeListener("projects:changed", handler);
    };
  },
  onProjectLoadProgress: (listener) => {
    const handler = (_event: IpcRendererEvent, payload: unknown): void => {
      const progress = parseProjectLoadProgress(payload);

      if (progress) {
        listener(progress);
      }
    };

    ipcRenderer.on("projects:loadProgress", handler);

    return () => {
      ipcRenderer.removeListener("projects:loadProgress", handler);
    };
  },
  openFileInEditor: async (input) =>
    ipcRenderer.invoke("files:openInEditor", input) as Promise<OpenFileResult>,
  openProject: async () =>
    ipcRenderer.invoke("projects:open") as Promise<ReviewWorkspaceView | null>,
  getProjectSettings: async (projectId) =>
    ipcRenderer.invoke("settings:getProject", {
      projectId
    }) as Promise<ProjectSettingsView>,
  updateProjectSettings: async (input) =>
    ipcRenderer.invoke("settings:updateProject", input) as Promise<ProjectSettingsView>,
  updateProjectDiffTarget: async (input) =>
    ipcRenderer.invoke(
      "projects:updateDiffTarget",
      input
    ) as Promise<ReviewWorkspaceView>,
  updateAppSettings: async (input) =>
    ipcRenderer.invoke("settings:updateApp", input) as Promise<AppSettingsView>,
  unmarkFileReviewed: async (input) =>
    ipcRenderer.invoke(
      "reviews:unmarkFileReviewed",
      input
    ) as Promise<UnmarkReviewedResult>
};

contextBridge.exposeInMainWorld("difftray", api);

function parseProjectChangedEvent(payload: unknown): ProjectChangedEvent | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const { errorMessage, projectId, projectPath, reasons, sequence } = payload;

  if (
    typeof projectId !== "string" ||
    typeof projectPath !== "string" ||
    typeof sequence !== "number" ||
    !Array.isArray(reasons) ||
    !reasons.every(isProjectWatchReason)
  ) {
    return undefined;
  }

  return {
    ...(typeof errorMessage === "string" ? { errorMessage } : {}),
    projectId,
    projectPath,
    reasons,
    sequence
  };
}

function isProjectWatchReason(value: unknown): value is ProjectWatchReason {
  return (
    value === "deleted" ||
    value === "git_metadata" ||
    value === "watcher_error" ||
    value === "worktree"
  );
}

function parseProjectLoadProgress(payload: unknown): ProjectLoadProgressView | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const {
    loadedFiles,
    message,
    path,
    phase,
    projectId,
    projectName,
    projectPath,
    totalFiles
  } = payload;

  if (
    typeof message !== "string" ||
    !isProjectLoadProgressPhase(phase) ||
    typeof projectId !== "string" ||
    typeof projectName !== "string" ||
    typeof projectPath !== "string"
  ) {
    return undefined;
  }

  return {
    ...(typeof loadedFiles === "number" ? { loadedFiles } : {}),
    message,
    ...(typeof path === "string" ? { path } : {}),
    phase,
    projectId,
    projectName,
    projectPath,
    ...(typeof totalFiles === "number" ? { totalFiles } : {})
  };
}

function isProjectLoadProgressPhase(value: unknown): value is ProjectLoadProgressPhase {
  return (
    value === "loading_files" ||
    value === "preparing_workspace" ||
    value === "resolving_review_state" ||
    value === "resolving_target" ||
    value === "scanning_files"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
