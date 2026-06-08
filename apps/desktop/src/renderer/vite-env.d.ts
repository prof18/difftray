/// <reference types="vite/client" />

export {};

declare global {
  type DifftrayApi = {
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
    readonly listProjectRecentCommits: (
      projectId: string
    ) => Promise<readonly RecentCommitView[]>;
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
    readonly updateAppSettings: (
      input: UpdateAppSettingsInput
    ) => Promise<AppSettingsView>;
    readonly updateReviewComment: (
      input: UpdateReviewCommentInput
    ) => Promise<UpdateReviewCommentResult>;
    readonly unmarkFileReviewed: (
      input: MarkFileReviewedInput
    ) => Promise<UnmarkReviewedResult>;
  };

  type ThemeMode = "dark" | "light" | "system";

  type AppSettingsView = {
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

  type EditorPresetView = {
    readonly args: readonly string[];
    readonly command: string;
    readonly iconDataUrl?: string;
    readonly id: string;
    readonly name: string;
  };

  type RecentProjectView = {
    readonly defaultBaseRef?: string;
    readonly defaultCommitRef?: string;
    readonly defaultDiffTargetMode?: "branch" | "commit" | "working_tree";
    readonly id: string;
    readonly lastOpenedAt?: string;
    readonly name: string;
    readonly path: string;
    readonly reviewSummary?: ProjectReviewSummaryView;
  };

  type RecentCommitView = {
    readonly authoredAt: string;
    readonly sha: string;
    readonly shortSha: string;
    readonly subject: string;
  };

  type LoadProjectOptions = {
    readonly reportProgress?: boolean;
  };

  type ProjectReviewSummaryView = {
    readonly attentionCount: number;
    readonly progress: ReviewProgressView;
  };

  type ProjectWatchReason = "deleted" | "git_metadata" | "watcher_error" | "worktree";

  type ProjectChangedEvent = {
    readonly errorMessage?: string;
    readonly projectId: string;
    readonly projectPath: string;
    readonly reasons: readonly ProjectWatchReason[];
    readonly sequence: number;
  };

  type ProjectChangedListener = (event: ProjectChangedEvent) => void;

  type ProjectLoadProgressPhase =
    | "loading_files"
    | "preparing_workspace"
    | "resolving_review_state"
    | "resolving_target"
    | "scanning_files";

  type ProjectLoadProgressView = {
    readonly loadedFiles?: number;
    readonly message: string;
    readonly path?: string;
    readonly phase: ProjectLoadProgressPhase;
    readonly projectId: string;
    readonly projectName: string;
    readonly projectPath: string;
    readonly totalFiles?: number;
  };

  type ProjectLoadProgressListener = (progress: ProjectLoadProgressView) => void;

  type UpdatePhase =
    | { readonly kind: "idle" }
    | { readonly kind: "checking" }
    | { readonly kind: "available"; readonly version: string }
    | { readonly kind: "downloading"; readonly percent: number; readonly version: string }
    | { readonly kind: "downloaded"; readonly version: string }
    | { readonly kind: "error"; readonly message: string };

  type UpdatePhaseListener = (phase: UpdatePhase) => void;

  type ReviewProgressView = {
    readonly reviewedVisibleFiles: number;
    readonly totalVisibleReviewableFiles: number;
  };

  type ReviewFileView = {
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

  type ReviewCommentSide = "additions" | "deletions";

  type ReviewCommentView = {
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

  type LoadFileDiffInput = {
    readonly path: string;
    readonly projectId: string;
  };

  type ReviewFileDiffContentView = {
    readonly additions: number;
    readonly deletions: number;
    readonly newText?: string;
    readonly oldText?: string;
    readonly patch: string;
    readonly path: string;
    readonly status: ReviewFileView["status"];
  };

  type ReviewWorkspaceView = {
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

  type CreateReviewCommentInput = {
    readonly body: string;
    readonly displayedDiffHash: string;
    readonly lineEnd: number;
    readonly lineStart: number;
    readonly path: string;
    readonly projectId: string;
    readonly reviewTargetId: string;
    readonly side: ReviewCommentSide;
  };

  type CreateReviewCommentResult =
    | {
        readonly comment: ReviewCommentView;
        readonly status: "created";
      }
    | {
        readonly reason: "file_missing" | "stale_diff";
        readonly status: "rejected";
      };

  type UpdateReviewCommentInput = {
    readonly body: string;
    readonly id: string;
  };

  type UpdateReviewCommentResult =
    | {
        readonly comment: ReviewCommentView;
        readonly status: "updated";
      }
    | {
        readonly reason: "comment_missing";
        readonly status: "rejected";
      };

  type DeleteReviewCommentInput = {
    readonly id: string;
  };

  type DeleteReviewCommentResult =
    | {
        readonly status: "deleted";
      }
    | {
        readonly reason: "comment_missing";
        readonly status: "rejected";
      };

  type CopyReviewCommentsReportInput = {
    readonly expectedCommentIds: readonly string[];
    readonly projectId: string;
    readonly reviewTargetId: string;
  };

  type CopyReviewCommentsReportResult =
    | {
        readonly commentCount: number;
        readonly status: "copied";
      }
    | {
        readonly reason: "stale_diff";
        readonly status: "rejected";
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
    readonly fileListCollapsed: boolean;
    readonly fileListWidth: number;
    readonly projectId: string;
  };

  type UpdateProjectSettingsInput = {
    readonly fileListCollapsed: boolean;
    readonly fileListWidth: number;
    readonly projectId: string;
  };

  type UpdateProjectDiffTargetInput =
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

  type UpdateAppSettingsInput = {
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

  interface Window {
    readonly difftray: DifftrayApi;
  }
}
