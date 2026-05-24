import { contextBridge, ipcRenderer } from "electron";

export type DifftrayApi = {
  readonly appVersion: () => Promise<string>;
  readonly closeProject: (projectId: string) => Promise<readonly RecentProjectView[]>;
  readonly getAppSettings: () => Promise<AppSettingsView>;
  readonly listRecentProjects: () => Promise<readonly RecentProjectView[]>;
  readonly loadProject: (projectId: string) => Promise<ReviewWorkspaceView | null>;
  readonly markFileReviewed: (
    input: MarkFileReviewedInput
  ) => Promise<MarkReviewedResult>;
  readonly openFileInEditor: (input: OpenFileInEditorInput) => Promise<OpenFileResult>;
  readonly openProject: () => Promise<ReviewWorkspaceView | null>;
  readonly getProjectSettings: (projectId: string) => Promise<ProjectSettingsView>;
  readonly updateProjectSettings: (
    input: UpdateProjectSettingsInput
  ) => Promise<ProjectSettingsView>;
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
  readonly editorCommand: string;
  readonly editorMode: "custom" | "system";
  readonly hideWhitespaceOnlyChanges: boolean;
  readonly notifyOnDrift: boolean;
  readonly reviewResetTrigger: "commit_sha" | "diff_content" | "line_count";
  readonly showGeneratedFiles: boolean;
  readonly themeMode: ThemeMode;
};

export type RecentProjectView = {
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

export type ReviewProgressView = {
  readonly reviewedVisibleFiles: number;
  readonly totalVisibleReviewableFiles: number;
};

export type ReviewFileView = {
  readonly additions: number;
  readonly deletions: number;
  readonly diffHash: string;
  readonly generated: boolean;
  readonly invalidated: boolean;
  readonly path: string;
  readonly patch: string;
  readonly previousPath?: string;
  readonly reviewable: boolean;
  readonly reviewed: boolean;
  readonly status: "added" | "deleted" | "mode_changed" | "modified" | "renamed";
  readonly visible: boolean;
};

export type ReviewWorkspaceView = {
  readonly files: readonly ReviewFileView[];
  readonly project: RecentProjectView;
  readonly progress: ReviewProgressView;
  readonly reviewTarget: {
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

export type UpdateAppSettingsInput = {
  readonly autoCollapseHunksOver: number;
  readonly defaultDiffMode: "split" | "unified";
  readonly editorArgs?: string;
  readonly editorCommand?: string;
  readonly editorMode: "custom" | "system";
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
  listRecentProjects: async () =>
    ipcRenderer.invoke("projects:listRecent") as Promise<readonly RecentProjectView[]>,
  loadProject: async (projectId) =>
    ipcRenderer.invoke("projects:load", {
      projectId
    }) as Promise<ReviewWorkspaceView | null>,
  markFileReviewed: async (input) =>
    ipcRenderer.invoke("reviews:markFileReviewed", input) as Promise<MarkReviewedResult>,
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
  updateAppSettings: async (input) =>
    ipcRenderer.invoke("settings:updateApp", input) as Promise<AppSettingsView>,
  unmarkFileReviewed: async (input) =>
    ipcRenderer.invoke(
      "reviews:unmarkFileReviewed",
      input
    ) as Promise<UnmarkReviewedResult>
};

contextBridge.exposeInMainWorld("difftray", api);
