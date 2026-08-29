import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from "electron";

import {
  parseApplicationCommand,
  parseProjectChangedEvent,
  parseProjectLoadProgress,
  parseRepositoryScanProgress,
  parseUpdatePhase,
  type ApplicationCommand,
  type ProjectChangedListener,
  type ProjectLoadProgressListener,
  type UpdatePhase,
  type UpdatePhaseListener
} from "./event-parsers.js";

export {
  type ApplicationCommand,
  type ProjectChangedEvent,
  type ProjectChangedListener,
  type ProjectLoadProgressListener,
  type ProjectLoadProgressPhase,
  type ProjectLoadProgressView,
  type ProjectWatchReason,
  type UpdatePhase,
  type UpdatePhaseListener
} from "./event-parsers.js";

export type ProjectsOpenedEvent = {
  readonly focusProjectId: string;
  readonly projectIds: readonly string[];
};

export type WorktreeChangeCountEvent = {
  readonly changeCount: number;
  readonly worktreePath: string;
};

export type DifftrayApi = {
  readonly appVersion: () => Promise<string>;
  readonly checkForUpdates: () => Promise<UpdatePhase>;
  readonly cancelCompanionPairing: () => Promise<CompanionStateView>;
  readonly getUpdatePhase: () => Promise<UpdatePhase>;
  readonly getCompanionState: () => Promise<CompanionStateView>;
  readonly installAndRelaunch: () => Promise<void>;
  readonly onCompanionStateChanged: (
    listener: CompanionStateChangedListener
  ) => () => void;
  readonly onApplicationCommand: (
    listener: (command: ApplicationCommand) => void
  ) => () => void;
  readonly onUpdatePhase: (listener: UpdatePhaseListener) => () => void;
  readonly closeProject: (projectId: string) => Promise<readonly RecentProjectView[]>;
  readonly forgetProject: (projectId: string) => Promise<readonly RecentProjectView[]>;
  readonly copyReviewCommentsReport: (
    input: CopyReviewCommentsReportInput
  ) => Promise<CopyReviewCommentsReportResult>;
  readonly copyCompanionStoreLink: (store: CompanionStore) => Promise<void>;
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
  readonly listProjectRecentCommits: (
    projectId: string
  ) => Promise<readonly RecentCommitView[]>;
  readonly listRecentProjects: () => Promise<readonly RecentProjectView[]>;
  readonly listKnownProjects: () => Promise<readonly RecentProjectView[]>;
  readonly listRepositoryCatalog: () => Promise<readonly RepositoryCatalogView[]>;
  readonly listRepositorySearchRoots: () => Promise<readonly RepositorySearchRootView[]>;
  readonly listRepositorySearchRootSuggestions: () => Promise<
    readonly RepositorySearchRootSuggestionView[]
  >;
  readonly listProjectWorktrees: (
    projectId: string
  ) => Promise<readonly RepositoryWorktreeView[]>;
  readonly saveProjectTabOrder: (projectIds: readonly string[]) => Promise<void>;
  readonly respondToCompanionPairRequest: (
    input: RespondToCompanionPairRequestInput
  ) => Promise<CompanionStateView>;
  readonly revokeCompanionDevice: (id: string) => Promise<CompanionStateView>;
  readonly setCompanionEnabled: (enabled: boolean) => Promise<CompanionStateView>;
  readonly startCompanionPairing: () => Promise<CompanionPairingStateView>;
  readonly loadFileDiff: (
    input: LoadFileDiffInput
  ) => Promise<ReviewFileDiffContentView | null>;
  readonly loadFileImage: (input: LoadFileImageInput) => Promise<FileImageView | null>;
  readonly loadProject: (
    projectId: string,
    options?: LoadProjectOptions
  ) => Promise<ReviewWorkspaceView | null>;
  readonly onProjectChanged: (listener: ProjectChangedListener) => () => void;
  readonly onProjectsOpened: (
    listener: (event: ProjectsOpenedEvent) => void
  ) => () => void;
  readonly onProjectLoadProgress: (listener: ProjectLoadProgressListener) => () => void;
  readonly onWorktreeChangeCount: (
    listener: (event: WorktreeChangeCountEvent) => void
  ) => () => void;
  readonly markFileReviewed: (
    input: MarkFileReviewedInput
  ) => Promise<MarkReviewedResult>;
  readonly openFileInEditor: (input: OpenFileInEditorInput) => Promise<OpenFileResult>;
  readonly openCompanionStore: (store: CompanionStore) => Promise<void>;
  readonly openProjectInFinder: (projectId: string) => Promise<void>;
  readonly openProject: () => Promise<ReviewWorkspaceView | null>;
  readonly openDroppedRepositories: (
    files: readonly File[]
  ) => Promise<ReviewWorkspaceView | null>;
  readonly previewDroppedRepositories: (
    files: readonly File[]
  ) => Promise<readonly DroppedRepositoryPreviewView[]>;
  readonly openDroppedRepositoryPreview: (input: {
    readonly candidateIds: readonly string[];
    readonly rememberSearchFolders: boolean;
  }) => Promise<ReviewWorkspaceView | null>;
  readonly openKnownProject: (projectId: string) => Promise<ReviewWorkspaceView | null>;
  readonly openRepositoryCatalogEntry: (
    repositoryId: string
  ) => Promise<ReviewWorkspaceView | null>;
  readonly openRepositoryCatalogEntries: (
    repositoryIds: readonly string[]
  ) => Promise<ReviewWorkspaceView | null>;
  readonly openRepositoryPickerEntries: (input: {
    readonly knownProjectIds: readonly string[];
    readonly repositoryIds: readonly string[];
  }) => Promise<ReviewWorkspaceView | null>;
  readonly addRepositorySearchRoot: () => Promise<boolean>;
  readonly addSuggestedRepositorySearchRoot: (suggestionId: string) => Promise<void>;
  readonly refreshRepositoryCatalog: () => Promise<void>;
  readonly refreshRepositorySearchRoot: (rootId: string) => Promise<void>;
  readonly cancelRepositoryScan: (rootId: string) => Promise<void>;
  readonly removeRepositorySearchRoot: (rootId: string) => Promise<void>;
  readonly onRepositoryScanProgress: (
    listener: (progress: RepositoryScanProgressView) => void
  ) => () => void;
  readonly onRepositoryQuickOpenRequested: (listener: () => void) => () => void;
  readonly onRepositoryScanFolderRequested: (listener: () => void) => () => void;
  readonly openProjectWorktree: (
    projectId: string,
    worktreeId: string
  ) => Promise<ReviewWorkspaceView>;
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

export type CompanionStateChangedListener = (state: CompanionStateView) => void;

export type CompanionAddressView = {
  readonly address: string;
  readonly host: string;
  readonly isTailscale: boolean;
};

export type CompanionDeviceView = {
  readonly createdAt: string;
  readonly id: string;
  readonly lastSeenAt?: string;
  readonly name: string;
  readonly platform: string;
  readonly publicKey: string;
  readonly revokedAt?: string;
};

export type CompanionPairingQrPayload = {
  readonly addresses: readonly string[];
  readonly expiresAt: string;
  readonly kind: "difftray-pairing";
  readonly protocolVersion: number;
  readonly secret: string;
  readonly serverId: string;
  readonly serverName: string;
  readonly serverPublicKey: string;
};

export type CompanionPairingStateView = {
  readonly code: string;
  readonly expiresAt: string;
  readonly qrPayload: CompanionPairingQrPayload;
};

export type CompanionPendingPairRequestView = {
  readonly deviceId: string;
  readonly deviceName: string;
  readonly devicePublicKey: string;
  readonly devicePublicKeyFingerprint: string;
  readonly expiresAt: string;
  readonly id: string;
  readonly platform: "android" | "ios";
};

export type CompanionStateView = {
  readonly activePairing: CompanionPairingStateView | null;
  readonly addresses: readonly CompanionAddressView[];
  readonly devices: readonly CompanionDeviceView[];
  readonly enabled: boolean;
  readonly errorMessage?: string;
  readonly pendingPairRequests: readonly CompanionPendingPairRequestView[];
  readonly port?: number;
  readonly status: "error" | "running" | "stopped";
};

export type RespondToCompanionPairRequestInput = {
  readonly approved: boolean;
  readonly id: string;
};

export type AppSettingsView = {
  readonly autoCollapseHunksOver: number;
  readonly companionEnabled: boolean;
  readonly companionPort: number;
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
  readonly defaultCommitRef?: string;
  readonly defaultDiffTargetMode?: "branch" | "commit" | "working_tree";
  readonly id: string;
  readonly lastOpenedAt?: string;
  readonly name: string;
  readonly path: string;
  readonly repositoryName?: string;
  readonly reviewSummary?: ProjectReviewSummaryView;
  readonly worktreeName?: string;
};

export type RepositoryWorktreeView = {
  readonly branchName?: string;
  readonly changeCount?: number;
  readonly displayName: string;
  readonly displayPath: string;
  readonly headSha?: string;
  readonly id: string;
  readonly locked: boolean;
  readonly shortHeadSha?: string;
  readonly state: "available" | "current" | "open";
};

export type RepositoryCatalogView = {
  readonly available: boolean;
  readonly id: string;
  readonly lastSeenAt: string;
  readonly name: string;
  readonly path: string;
  readonly rootId: string;
};

export type RepositoryScanProgressView = {
  readonly rootId: string;
  readonly scannedDirectories: number;
  readonly skippedDirectories: number;
  readonly status: "cancelled" | "complete" | "failed" | "scanning";
};

export type RepositorySearchRootView = {
  readonly enabled: boolean;
  readonly id: string;
  readonly lastScanCompletedAt?: string;
  readonly lastScanError?: string;
  readonly path: string;
  readonly repositoryCount: number;
  readonly scannedDirectories?: number;
  readonly scanning: boolean;
  readonly skippedDirectories?: number;
};

export type RepositorySearchRootSuggestionView = {
  readonly id: string;
  readonly name: string;
  readonly path: string;
};

export type DroppedRepositoryPreviewView = {
  readonly displayPath: string;
  readonly id: string;
  readonly name: string;
  readonly rememberEligible: boolean;
};

export type RecentCommitView = {
  readonly authoredAt: string;
  readonly sha: string;
  readonly shortSha: string;
  readonly subject: string;
};

export type LoadProjectOptions = {
  readonly reportProgress?: boolean;
};

export type ProjectReviewSummaryView = {
  readonly attentionCount: number;
  readonly progress: ReviewProgressView;
};

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

export type FileImageSide = "new" | "old";
export type FileImageStatus =
  | "added"
  | "deleted"
  | "mode_changed"
  | "modified"
  | "renamed";

export type LoadFileImageInput = {
  readonly diffHash: string;
  readonly path: string;
  readonly previousPath?: string;
  readonly projectId: string;
  readonly side: FileImageSide;
  readonly status: FileImageStatus;
};

export type FileImageView = {
  readonly diffHash: string;
  readonly image: {
    readonly dataBase64: string;
    readonly height: number;
    readonly mimeType: "image/jpeg" | "image/png" | "image/webp";
    readonly width: number;
  };
  readonly side: FileImageSide;
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
    readonly commitSha?: string;
    readonly commitShortSha?: string;
    readonly commitSubject?: string;
    readonly headRefName?: string;
    readonly headSha: string;
    readonly id: string;
    readonly kind: "branch" | "commit" | "working_tree";
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
    }
  | {
      readonly commitRef: string;
      readonly mode: "commit";
      readonly projectId: string;
    };

export type UpdateAppSettingsInput = {
  readonly autoCollapseHunksOver: number;
  readonly companionEnabled: boolean;
  readonly companionPort: number;
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

export type CompanionStore = "app-store" | "google-play";

const api: DifftrayApi = {
  appVersion: async () => ipcRenderer.invoke("app:version") as Promise<string>,
  cancelCompanionPairing: async () =>
    ipcRenderer.invoke("companion:cancelPairing") as Promise<CompanionStateView>,
  checkForUpdates: async () =>
    ipcRenderer.invoke("updates:checkNow") as Promise<UpdatePhase>,
  getCompanionState: async () =>
    ipcRenderer.invoke("companion:getState") as Promise<CompanionStateView>,
  getUpdatePhase: async () =>
    ipcRenderer.invoke("updates:getPhase") as Promise<UpdatePhase>,
  installAndRelaunch: async () =>
    ipcRenderer.invoke("updates:installAndRelaunch") as Promise<void>,
  onCompanionStateChanged: (listener) => {
    const handler = (_event: IpcRendererEvent, payload: unknown): void => {
      listener(payload as CompanionStateView);
    };

    ipcRenderer.on("companion:stateChanged", handler);

    return () => {
      ipcRenderer.removeListener("companion:stateChanged", handler);
    };
  },
  onApplicationCommand: (listener) => {
    const handler = (_event: IpcRendererEvent, payload: unknown): void => {
      const command = parseApplicationCommand(payload);

      if (command) {
        listener(command);
      }
    };

    ipcRenderer.on("application:command", handler);

    return () => {
      ipcRenderer.removeListener("application:command", handler);
    };
  },
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
  forgetProject: async (projectId) =>
    ipcRenderer.invoke("projects:forget", {
      projectId
    }) as Promise<readonly RecentProjectView[]>,
  copyReviewCommentsReport: async (input) =>
    ipcRenderer.invoke(
      "comments:copyReport",
      input
    ) as Promise<CopyReviewCommentsReportResult>,
  copyCompanionStoreLink: async (store) =>
    ipcRenderer.invoke("external:copyStoreLink", store) as Promise<void>,
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
  listProjectRecentCommits: async (projectId) =>
    ipcRenderer.invoke("projects:listRecentCommits", {
      projectId
    }) as Promise<readonly RecentCommitView[]>,
  listRecentProjects: async () =>
    ipcRenderer.invoke("projects:listRecent") as Promise<readonly RecentProjectView[]>,
  listKnownProjects: async () =>
    ipcRenderer.invoke("projects:listKnown") as Promise<readonly RecentProjectView[]>,
  listRepositoryCatalog: async () =>
    ipcRenderer.invoke("repositories:listCatalog") as Promise<
      readonly RepositoryCatalogView[]
    >,
  listRepositorySearchRoots: async () =>
    ipcRenderer.invoke("repositories:listSearchRoots") as Promise<
      readonly RepositorySearchRootView[]
    >,
  listRepositorySearchRootSuggestions: async () =>
    ipcRenderer.invoke("repositories:listSearchRootSuggestions") as Promise<
      readonly RepositorySearchRootSuggestionView[]
    >,
  listProjectWorktrees: async (projectId) =>
    ipcRenderer.invoke("projects:listWorktrees", {
      projectId
    }) as Promise<readonly RepositoryWorktreeView[]>,
  respondToCompanionPairRequest: async (input) =>
    ipcRenderer.invoke(
      "companion:respondToPairRequest",
      input
    ) as Promise<CompanionStateView>,
  revokeCompanionDevice: async (id) =>
    ipcRenderer.invoke("companion:revokeDevice", { id }) as Promise<CompanionStateView>,
  saveProjectTabOrder: async (projectIds) => {
    await ipcRenderer.invoke("projects:saveTabOrder", { projectIds });
  },
  setCompanionEnabled: async (enabled) =>
    ipcRenderer.invoke("companion:setEnabled", {
      enabled
    }) as Promise<CompanionStateView>,
  startCompanionPairing: async () =>
    ipcRenderer.invoke("companion:startPairing") as Promise<CompanionPairingStateView>,
  loadFileDiff: async (input) =>
    ipcRenderer.invoke(
      "files:loadDiff",
      input
    ) as Promise<ReviewFileDiffContentView | null>,
  loadFileImage: async (input) =>
    ipcRenderer.invoke("files:loadImage", input) as Promise<FileImageView | null>,
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
  onProjectsOpened: (listener) => {
    const handler = (_event: IpcRendererEvent, payload: unknown): void => {
      if (!isProjectsOpenedEvent(payload)) return;
      listener(payload);
    };

    ipcRenderer.on("projects:opened", handler);

    return () => {
      ipcRenderer.removeListener("projects:opened", handler);
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
  onWorktreeChangeCount: (listener) => {
    const handler = (_event: IpcRendererEvent, payload: unknown): void => {
      if (!isWorktreeChangeCountEvent(payload)) return;
      listener(payload);
    };

    ipcRenderer.on("projects:worktreeChangeCount", handler);

    return () => {
      ipcRenderer.removeListener("projects:worktreeChangeCount", handler);
    };
  },
  openFileInEditor: async (input) =>
    ipcRenderer.invoke("files:openInEditor", input) as Promise<OpenFileResult>,
  openCompanionStore: async (store) =>
    ipcRenderer.invoke("external:openStore", store) as Promise<void>,
  openProjectInFinder: async (projectId) =>
    ipcRenderer.invoke("projects:openInFinder", { projectId }) as Promise<void>,
  openProject: async () =>
    ipcRenderer.invoke("projects:open") as Promise<ReviewWorkspaceView | null>,
  openDroppedRepositories: async (files) => {
    const paths = files
      .map((file) => webUtils.getPathForFile(file))
      .filter((filePath) => filePath.length > 0);

    return ipcRenderer.invoke("projects:openPaths", {
      paths
    }) as Promise<ReviewWorkspaceView | null>;
  },
  previewDroppedRepositories: async (files) => {
    const paths = files.map((file) => webUtils.getPathForFile(file)).filter(Boolean);
    return ipcRenderer.invoke("repositories:previewDroppedPaths", { paths }) as Promise<
      readonly DroppedRepositoryPreviewView[]
    >;
  },
  openDroppedRepositoryPreview: async (input) =>
    ipcRenderer.invoke(
      "repositories:openDroppedPreview",
      input
    ) as Promise<ReviewWorkspaceView | null>,
  openKnownProject: async (projectId) =>
    ipcRenderer.invoke("projects:openKnown", {
      projectId
    }) as Promise<ReviewWorkspaceView | null>,
  openRepositoryCatalogEntry: async (repositoryId) =>
    ipcRenderer.invoke("repositories:openCatalogEntry", {
      repositoryId
    }) as Promise<ReviewWorkspaceView | null>,
  openRepositoryCatalogEntries: async (repositoryIds) =>
    ipcRenderer.invoke("repositories:openCatalogEntries", {
      repositoryIds
    }) as Promise<ReviewWorkspaceView | null>,
  openRepositoryPickerEntries: async (input) =>
    ipcRenderer.invoke(
      "repositories:openPickerEntries",
      input
    ) as Promise<ReviewWorkspaceView | null>,
  addRepositorySearchRoot: async () =>
    ipcRenderer.invoke("repositories:addSearchRoot") as Promise<boolean>,
  addSuggestedRepositorySearchRoot: async (suggestionId) =>
    ipcRenderer.invoke("repositories:addSuggestedSearchRoot", {
      suggestionId
    }) as Promise<void>,
  refreshRepositoryCatalog: async () =>
    ipcRenderer.invoke("repositories:refreshAll") as Promise<void>,
  refreshRepositorySearchRoot: async (rootId) =>
    ipcRenderer.invoke("repositories:refreshSearchRoot", { rootId }) as Promise<void>,
  cancelRepositoryScan: async (rootId) =>
    ipcRenderer.invoke("repositories:cancelScan", { rootId }) as Promise<void>,
  removeRepositorySearchRoot: async (rootId) =>
    ipcRenderer.invoke("repositories:removeSearchRoot", { rootId }) as Promise<void>,
  onRepositoryScanProgress: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, progress: unknown) => {
      const parsed = parseRepositoryScanProgress(progress);
      if (parsed) listener(parsed);
    };
    ipcRenderer.on("repositories:scanProgress", wrapped);
    return () => ipcRenderer.removeListener("repositories:scanProgress", wrapped);
  },
  onRepositoryQuickOpenRequested: (listener) => {
    ipcRenderer.on("repositories:quickOpenRequested", listener);
    return () => ipcRenderer.removeListener("repositories:quickOpenRequested", listener);
  },
  onRepositoryScanFolderRequested: (listener) => {
    ipcRenderer.on("repositories:scanFolderRequested", listener);
    return () => ipcRenderer.removeListener("repositories:scanFolderRequested", listener);
  },
  openProjectWorktree: async (projectId, worktreeId) =>
    ipcRenderer.invoke("projects:openWorktree", {
      projectId,
      worktreeId
    }) as Promise<ReviewWorkspaceView>,
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

function isProjectsOpenedEvent(payload: unknown): payload is ProjectsOpenedEvent {
  if (!isRecord(payload) || typeof payload.focusProjectId !== "string") return false;
  return (
    Array.isArray(payload.projectIds) &&
    payload.projectIds.every(
      (projectId): projectId is string => typeof projectId === "string"
    )
  );
}

function isWorktreeChangeCountEvent(
  payload: unknown
): payload is WorktreeChangeCountEvent {
  return (
    isRecord(payload) &&
    typeof payload.changeCount === "number" &&
    Number.isSafeInteger(payload.changeCount) &&
    payload.changeCount >= 0 &&
    typeof payload.worktreePath === "string"
  );
}

function isRecord(payload: unknown): payload is Record<string, unknown> {
  return typeof payload === "object" && payload !== null;
}

contextBridge.exposeInMainWorld("difftray", api);
