/// <reference types="vite/client" />

export {};

declare global {
  type DifftrayApi = {
    readonly appVersion: () => Promise<string>;
    readonly getAppSettings: () => Promise<AppSettingsView>;
    readonly listRecentProjects: () => Promise<readonly RecentProjectView[]>;
    readonly loadProject: (projectId: string) => Promise<ReviewWorkspaceView>;
    readonly markFileReviewed: (
      input: MarkFileReviewedInput
    ) => Promise<MarkReviewedResult>;
    readonly openFileInEditor: (input: OpenFileInEditorInput) => Promise<OpenFileResult>;
    readonly openProject: () => Promise<ReviewWorkspaceView | null>;
    readonly getProjectSettings: (projectId: string) => Promise<ProjectSettingsView>;
    readonly updateProjectSettings: (
      input: UpdateProjectSettingsInput
    ) => Promise<ProjectSettingsView>;
    readonly updateAppSettings: (
      input: UpdateAppSettingsInput
    ) => Promise<AppSettingsView>;
    readonly unmarkFileReviewed: (
      input: MarkFileReviewedInput
    ) => Promise<UnmarkReviewedResult>;
  };

  type ThemeMode = "dark" | "light" | "system";

  type AppSettingsView = {
    readonly themeMode: ThemeMode;
  };

  type RecentProjectView = {
    readonly id: string;
    readonly lastOpenedAt?: string;
    readonly name: string;
    readonly path: string;
  };

  type ReviewFileView = {
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

  type ReviewWorkspaceView = {
    readonly files: readonly ReviewFileView[];
    readonly project: RecentProjectView;
    readonly progress: {
      readonly reviewedVisibleFiles: number;
      readonly totalVisibleReviewableFiles: number;
    };
    readonly reviewTarget: {
      readonly headRefName?: string;
      readonly headSha: string;
      readonly id: string;
      readonly kind: "branch" | "working_tree";
    };
  };

  type MarkFileReviewedInput = {
    readonly displayedDiffHash: string;
    readonly path: string;
    readonly projectId: string;
    readonly reviewTargetId: string;
  };

  type MarkReviewedResult =
    | {
        readonly reason: "file_missing" | "stale_diff";
        readonly status: "rejected";
        readonly workspace: ReviewWorkspaceView;
      }
    | {
        readonly status: "marked";
        readonly workspace: ReviewWorkspaceView;
      };

  type UnmarkReviewedResult =
    | {
        readonly reason: "file_missing" | "stale_diff";
        readonly status: "rejected";
        readonly workspace: ReviewWorkspaceView;
      }
    | {
        readonly status: "unmarked";
        readonly workspace: ReviewWorkspaceView;
      };

  type OpenFileInEditorInput = {
    readonly path: string;
    readonly projectId: string;
  };

  type OpenFileResult =
    | {
        readonly reason: "file_missing" | "launch_failed";
        readonly status: "rejected";
      }
    | {
        readonly status: "opened";
      };

  type ProjectSettingsView = {
    readonly editorArgs: string;
    readonly editorCommand: string;
    readonly editorMode: "custom" | "system";
    readonly projectId: string;
    readonly showGeneratedFiles: boolean;
  };

  type UpdateProjectSettingsInput = {
    readonly editorArgs?: string;
    readonly editorCommand?: string;
    readonly editorMode: "custom" | "system";
    readonly projectId: string;
    readonly showGeneratedFiles: boolean;
  };

  type UpdateAppSettingsInput = {
    readonly themeMode: ThemeMode;
  };

  interface Window {
    readonly difftray: DifftrayApi;
  }
}
