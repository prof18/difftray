import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

export type DifftrayApi = {
  readonly appVersion: () => Promise<string>;
  readonly getUpdatePhase: () => Promise<UpdatePhase>;
  readonly installAndRelaunch: () => Promise<void>;
  readonly onUpdatePhase: (listener: UpdatePhaseListener) => () => void;
  readonly closeProject: (projectId: string) => Promise<readonly RecentProjectView[]>;
  readonly copyReviewCommentsReport: (
    input: CopyReviewCommentsReportInput
  ) => Promise<CopyReviewCommentsReportResult>;
  readonly createReviewComment: (
    input: CreateReviewCommentInput
  ) => Promise<CreateReviewCommentResult>;
  readonly deleteReviewComment: (
    input: DeleteReviewCommentInput
  ) => Promise<DeleteReviewCommentResult>;
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
  readonly loadProject: (
    projectId: string,
    options?: LoadProjectOptions
  ) => Promise<ReviewWorkspaceView | null>;
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
  readonly updateReviewComment: (
    input: UpdateReviewCommentInput
  ) => Promise<UpdateReviewCommentResult>;
  readonly unmarkFileReviewed: (
    input: MarkFileReviewedInput
  ) => Promise<UnmarkReviewedResult>;
};

export type ThemeMode = "dark" | "light" | "system";

export type UpdatePhase =
  | { readonly kind: "idle" }
  | { readonly kind: "checking" }
  | { readonly kind: "available"; readonly version: string }
  | { readonly kind: "downloading"; readonly percent: number; readonly version: string }
  | { readonly kind: "downloaded"; readonly version: string }
  | { readonly kind: "error"; readonly message: string };

export type UpdatePhaseListener = (phase: UpdatePhase) => void;

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
  readonly wrapDiffLines: boolean;
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

export type LoadProjectOptions = {
  readonly reportProgress?: boolean;
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

export type ReviewCommentSide = "additions" | "deletions";

export type ReviewCommentView = {
  readonly body: string;
  readonly createdAt: string;
  readonly diffHash: string;
  readonly id: string;
  readonly lineEnd: number;
  readonly lineStart: number;
  readonly path: string;
  readonly previousPath?: string;
  readonly side: ReviewCommentSide;
  readonly updatedAt: string;
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
  readonly comments: readonly ReviewCommentView[];
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

export type CreateReviewCommentInput = {
  readonly body: string;
  readonly displayedDiffHash: string;
  readonly lineEnd: number;
  readonly lineStart: number;
  readonly path: string;
  readonly projectId: string;
  readonly reviewTargetId: string;
  readonly side: ReviewCommentSide;
};

export type CreateReviewCommentResult =
  | {
      readonly comment: ReviewCommentView;
      readonly status: "created";
    }
  | {
      readonly reason: "file_missing" | "stale_diff";
      readonly status: "rejected";
    };

export type UpdateReviewCommentInput = {
  readonly body: string;
  readonly id: string;
};

export type UpdateReviewCommentResult =
  | {
      readonly comment: ReviewCommentView;
      readonly status: "updated";
    }
  | {
      readonly reason: "comment_missing";
      readonly status: "rejected";
    };

export type DeleteReviewCommentInput = {
  readonly id: string;
};

export type DeleteReviewCommentResult =
  | {
      readonly status: "deleted";
    }
  | {
      readonly reason: "comment_missing";
      readonly status: "rejected";
    };

export type CopyReviewCommentsReportInput = {
  readonly expectedCommentIds: readonly string[];
  readonly projectId: string;
  readonly reviewTargetId: string;
};

export type CopyReviewCommentsReportResult =
  | {
      readonly commentCount: number;
      readonly status: "copied";
    }
  | {
      readonly reason: "stale_diff";
      readonly status: "rejected";
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
  readonly wrapDiffLines: boolean;
};

const api: DifftrayApi = {
  appVersion: async () => ipcRenderer.invoke("app:version") as Promise<string>,
  getUpdatePhase: async () =>
    ipcRenderer.invoke("updates:getPhase") as Promise<UpdatePhase>,
  installAndRelaunch: async () =>
    ipcRenderer.invoke("updates:installAndRelaunch") as Promise<void>,
  onUpdatePhase: (listener) => {
    const handler = (_event: IpcRendererEvent, payload: unknown): void => {
      const phase = parseUpdatePhase(payload);

      if (phase) {
        listener(phase);
      }
    };

    ipcRenderer.on("updates:phase", handler);

    return () => {
      ipcRenderer.removeListener("updates:phase", handler);
    };
  },
  closeProject: async (projectId) =>
    ipcRenderer.invoke("projects:close", {
      projectId
    }) as Promise<readonly RecentProjectView[]>,
  copyReviewCommentsReport: async (input) =>
    ipcRenderer.invoke(
      "comments:copyReport",
      input
    ) as Promise<CopyReviewCommentsReportResult>,
  createReviewComment: async (input) =>
    ipcRenderer.invoke("comments:create", input) as Promise<CreateReviewCommentResult>,
  deleteReviewComment: async (input) =>
    ipcRenderer.invoke("comments:delete", input) as Promise<DeleteReviewCommentResult>,
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
  loadProject: async (projectId, options = {}) =>
    ipcRenderer.invoke("projects:load", {
      projectId,
      reportProgress: options.reportProgress ?? true
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
  updateReviewComment: async (input) =>
    ipcRenderer.invoke("comments:update", input) as Promise<UpdateReviewCommentResult>,
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

function parseUpdatePhase(payload: unknown): UpdatePhase | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const { kind } = payload;

  switch (kind) {
    case "idle":
    case "checking":
      return { kind };
    case "available":
    case "downloaded":
      return typeof payload.version === "string"
        ? { kind, version: payload.version }
        : undefined;
    case "downloading":
      return typeof payload.version === "string" && typeof payload.percent === "number"
        ? { kind, percent: payload.percent, version: payload.version }
        : undefined;
    case "error":
      return typeof payload.message === "string"
        ? { kind, message: payload.message }
        : undefined;
    default:
      return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
