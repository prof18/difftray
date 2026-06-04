import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeImage,
  shell,
  type WebContents,
  type IpcMainInvokeEvent,
  type NativeImage,
  type OpenDialogOptions
} from "electron";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

import {
  calculateProgress,
  createDiffHash,
  createReviewTargetId,
  formatReviewCommentsReport,
  listInstalledEditorPresets,
  resolveReviewStates,
  type FileDiff,
  type ReviewCommentReportContext,
  type ReviewCommentReportItem,
  type ReviewMark,
  type ReviewProgress,
  type ReviewTarget
} from "@difftray/core";
import {
  findGitRepository,
  loadBranchReviewTarget,
  loadBranchDiffSummaries,
  loadBranchFileDiffSummary,
  loadBranchFileDiff,
  listBranchRefs,
  loadWorkingTreeReviewTarget,
  loadWorkingTreeDiffSummaries,
  loadWorkingTreeFileDiffSummary,
  loadWorkingTreeFileDiff,
  type DiffLoadProgress
} from "@difftray/git";
import {
  type AppSettingsRecord,
  openStorage,
  type DifftrayStorage,
  type ProjectSettingsRecord,
  type ProjectRecord,
  type StoredProjectRecord
} from "@difftray/storage";

import {
  ProjectWatchService,
  createChokidarProjectWatcherFactory,
  resolveGitProjectWatchPaths,
  type ProjectWatchChangeEvent,
  type WatchedProject
} from "./project-watch-service.js";
import {
  isTrustedRendererUrl,
  resolveRendererDevUrl,
  resolveSafeProjectFilePath,
  type TrustedRendererLocation,
  trustedEditorLaunchConfig
} from "./security.js";
import {
  readBooleanProperty,
  readEnumProperty,
  readNumberProperty,
  readOptionalBooleanProperty,
  readOptionalStringArrayProperty,
  readOptionalStringProperty,
  readStringProperty
} from "./ipc-input.js";
import { editorConfigFromInput, expandEditorArg } from "./editor-launch.js";
import {
  resolveAppRuntimeConfig,
  resolveWindowPresentationMode,
  type AppRuntimeConfig
} from "./app-runtime.js";
import { loadAutoUpdater } from "./electron-updater.js";
import { UpdateState, type UpdateEvent, type UpdatePhase } from "./update-state.js";
import {
  appSettingsView,
  fileDiffFromGit,
  patchForDiff,
  projectView,
  reviewCommentView,
  reviewFileView,
  projectReviewSummaryView,
  reviewProgressView,
  reviewTargetFromGit,
  reviewTargetFromRecord,
  reviewTargetLabel,
  reviewTargetRecord,
  sameCommentIds,
  settingsView,
  summarizePatch,
  type AppSettingsView,
  type FileReviewStateWithSummary,
  type ProjectReviewSummaryView,
  type ProjectSettingsView,
  type RecentProjectView,
  type ReviewCommentView,
  type ReviewFileView,
  type ReviewWorkspaceView
} from "./view-models.js";
import {
  appPathForPreset,
  discoverMacOSApplicationPathsByName,
  macOSBundleIconPath
} from "./editor-discovery.js";

const rendererDevUrlFromEnv = process.env.DIFFTRAY_RENDERER_URL;
const bootProjectPath = process.env.DIFFTRAY_BOOT_PROJECT;
const projectWatchersEnabled = process.env.DIFFTRAY_ENABLE_PROJECT_WATCHERS === "1";
const userDataPath = process.env.DIFFTRAY_USER_DATA_DIR;
const windowPresentationMode = resolveWindowPresentationMode(
  process.env.DIFFTRAY_WINDOW_PRESENTATION
);

let mainWindow: BrowserWindow | undefined;
let projectWatchService: ProjectWatchService | undefined;
let storage: DifftrayStorage | undefined;
let didConfigureAppRuntime = false;
let isQuitting = false;
let resolvedAppRuntimeConfig: AppRuntimeConfig | undefined;
let didWireAutoUpdater = false;
let trustedRendererLocation: TrustedRendererLocation | undefined;
const updateState = new UpdateState();

function mainPerformanceLoggingEnabled(): boolean {
  return process.env.DIFFTRAY_PERF_LOG === "1";
}

function logMainPerformance(
  event: string,
  payload: Readonly<Record<string, unknown>>
): void {
  if (!mainPerformanceLoggingEnabled()) {
    return;
  }

  console.info(
    "[difftray:perf]",
    JSON.stringify({
      event,
      ...payload
    })
  );
}

function elapsedSince(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}

type ProjectLoadProgressView = {
  readonly loadedFiles?: number;
  readonly message: string;
  readonly path?: string;
  readonly phase:
    | "loading_files"
    | "preparing_workspace"
    | "resolving_review_state"
    | "resolving_target"
    | "scanning_files";
  readonly projectId: string;
  readonly projectName: string;
  readonly projectPath: string;
  readonly totalFiles?: number;
};

type ProjectLoadProgressReporter = (
  progress: Omit<ProjectLoadProgressView, "projectId" | "projectName" | "projectPath">
) => void;

type ReviewFileDiffContentView = {
  readonly additions: number;
  readonly deletions: number;
  readonly newText?: string;
  readonly oldText?: string;
  readonly patch: string;
  readonly path: string;
  readonly status: FileDiff["status"];
};

type EditorPresetView = {
  readonly args: readonly string[];
  readonly command: string;
  readonly iconDataUrl?: string;
  readonly id: string;
  readonly name: string;
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

type OpenFileInEditorResult =
  | {
      readonly reason: "file_missing" | "launch_failed";
      readonly status: "rejected";
    }
  | {
      readonly status: "opened";
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

type UpdateReviewCommentResult =
  | {
      readonly comment: ReviewCommentView;
      readonly status: "updated";
    }
  | {
      readonly reason: "comment_missing";
      readonly status: "rejected";
    };

type DeleteReviewCommentResult =
  | {
      readonly status: "deleted";
    }
  | {
      readonly reason: "comment_missing";
      readonly status: "rejected";
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

const createMainWindow = async (): Promise<void> => {
  const icon = appIconImage();
  const window = new BrowserWindow({
    backgroundColor: "#ffffff",
    height: 820,
    ...(icon ? { icon } : {}),
    minHeight: 600,
    minWidth: 900,
    show: false,
    title: "Difftray",
    ...(process.platform === "darwin"
      ? {
          titleBarStyle: "hiddenInset" as const,
          trafficLightPosition: { x: 16, y: 15 }
        }
      : {}),
    width: 1220,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "../preload/index.cjs"),
      sandbox: true
    }
  });

  let didShowWindow = false;
  const showWindow = (): void => {
    if (didShowWindow || window.isDestroyed()) {
      return;
    }

    didShowWindow = true;
    if (windowPresentationMode === "inactive") {
      window.showInactive();
    } else {
      window.show();
    }
  };

  window.once("ready-to-show", showWindow);
  window.webContents.once("did-finish-load", showWindow);
  setTimeout(showWindow, 1_500);

  if (bootProjectPath) {
    await storeRepositoryAtPath(bootProjectPath);
  }

  const rendererDevUrl = resolveRendererDevUrl(rendererDevUrlFromEnv, app.isPackaged);

  if (rendererDevUrl) {
    trustedRendererLocation = {
      kind: "dev",
      origin: new URL(rendererDevUrl).origin
    };
    await window.loadURL(rendererDevUrl);
  } else {
    const rendererFilePath = path.join(__dirname, "../renderer/index.html");

    trustedRendererLocation = {
      kind: "file",
      path: rendererFilePath
    };
    await window.loadFile(rendererFilePath);
  }

  showWindow();
  mainWindow = window;
};

app.on("web-contents-created", (_event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });
  contents.on("will-navigate", (event, navigationUrl) => {
    if (!isTrustedNavigationTarget(navigationUrl)) {
      event.preventDefault();
    }
  });
});

handleTrusted("app:version", () => app.getVersion());
handleTrusted("updates:getPhase", (): UpdatePhase => updateState.phase);
handleTrusted("updates:installAndRelaunch", async (): Promise<void> => {
  if (resolvedAppRuntimeConfig?.variant !== "production") {
    return;
  }

  try {
    const autoUpdater = await loadAutoUpdater();

    autoUpdater.quitAndInstall();
  } catch (caughtError) {
    console.error("autoUpdater quitAndInstall failed", caughtError);
  }
});
handleTrusted(
  "editors:listInstalled",
  async (): Promise<readonly EditorPresetView[]> => listInstalledEditorPresetViews()
);
handleTrusted(
  "settings:getApp",
  (): AppSettingsView => appSettingsView(getStorage().getAppSettings())
);
handleTrusted(
  "settings:updateApp",
  (_event: IpcMainInvokeEvent, input: unknown): AppSettingsView => {
    const autoCollapseHunksOver = readNumberProperty(input, "autoCollapseHunksOver");
    const defaultDiffMode = readEnumProperty(input, "defaultDiffMode", [
      "split",
      "unified"
    ]);
    const showGeneratedFiles = readBooleanProperty(input, "showGeneratedFiles");
    const hideWhitespaceOnlyChanges = readBooleanProperty(
      input,
      "hideWhitespaceOnlyChanges"
    );
    const notifyOnDrift = readBooleanProperty(input, "notifyOnDrift");
    const reviewResetTrigger = readEnumProperty(input, "reviewResetTrigger", [
      "commit_sha",
      "diff_content",
      "line_count"
    ]);
    const editorMode = readEnumProperty(input, "editorMode", ["preset", "system"]);
    const editorCommand = readOptionalStringProperty(input, "editorCommand");
    const editorArgs = readOptionalStringProperty(input, "editorArgs");
    const editorArgList = readOptionalStringArrayProperty(input, "editorArgList");
    const themeMode = readEnumProperty(input, "themeMode", ["dark", "light", "system"]);
    const wrapDiffLines = readBooleanProperty(input, "wrapDiffLines");
    const settings: AppSettingsRecord = {
      autoCollapseHunksOver,
      defaultDiffMode,
      ...(editorMode === "preset"
        ? {
            editorLaunchConfig: editorConfigFromInput(
              editorCommand,
              editorArgList ?? editorArgs
            )
          }
        : {}),
      hideWhitespaceOnlyChanges,
      notifyOnDrift,
      reviewResetTrigger,
      showGeneratedFiles,
      themeMode,
      wrapDiffLines
    };

    getStorage().upsertAppSettings(settings);

    return appSettingsView(getStorage().getAppSettings());
  }
);
handleTrusted("projects:listRecent", () => listAvailableRecentProjectViews());
handleTrusted(
  "projects:getReviewSummary",
  async (
    _event: IpcMainInvokeEvent,
    input: unknown
  ): Promise<ProjectReviewSummaryView | null> => {
    const projectId = readStringProperty(input, "projectId");

    return loadProjectReviewSummaryIfAvailable(projectId);
  }
);
handleTrusted(
  "projects:listBranchRefs",
  async (_event: IpcMainInvokeEvent, input: unknown): Promise<readonly string[]> => {
    const projectId = readStringProperty(input, "projectId");
    const project = assertStoredProject(projectId);

    return listBranchRefs(project.path);
  }
);
handleTrusted(
  "projects:close",
  async (
    _event: IpcMainInvokeEvent,
    input: unknown
  ): Promise<readonly RecentProjectView[]> => {
    const projectId = readStringProperty(input, "projectId");

    getStorage().deleteProject(projectId);
    await getProjectWatchService().stopProject(projectId);

    return listAvailableRecentProjectViews();
  }
);
handleTrusted("projects:open", async (event: IpcMainInvokeEvent) =>
  openProjectFromDialog(event.sender)
);
handleTrusted(
  "projects:load",
  async (
    event: IpcMainInvokeEvent,
    input: unknown
  ): Promise<ReviewWorkspaceView | null> => {
    const projectId = readStringProperty(input, "projectId");
    const reportProgress = readOptionalBooleanProperty(input, "reportProgress") ?? true;

    return loadProjectWorkspaceIfAvailable(
      projectId,
      reportProgress ? projectLoadProgressReporter(event.sender, projectId) : undefined
    );
  }
);
handleTrusted(
  "projects:updateDiffTarget",
  async (event: IpcMainInvokeEvent, input: unknown): Promise<ReviewWorkspaceView> => {
    const projectId = readStringProperty(input, "projectId");
    const mode = readEnumProperty(input, "mode", ["branch", "working_tree"]);
    const project = assertStoredProject(projectId);
    const reportProgress = projectLoadProgressReporter(event.sender, projectId);
    const previousBaseRef = project.defaultBaseRef;

    if (mode === "branch") {
      const baseRefName = readStringProperty(input, "baseRefName").trim();

      if (baseRefName.length === 0) {
        throw new Error("Base branch is required.");
      }

      getStorage().updateProjectDefaultBaseRef(projectId, baseRefName);
    } else {
      getStorage().updateProjectDefaultBaseRef(projectId, undefined);
    }

    try {
      return await loadProjectWorkspace(projectId, reportProgress);
    } catch (caughtError) {
      getStorage().updateProjectDefaultBaseRef(projectId, previousBaseRef);
      throw caughtError;
    }
  }
);
handleTrusted(
  "settings:getProject",
  (_event: IpcMainInvokeEvent, input: unknown): ProjectSettingsView => {
    const projectId = readStringProperty(input, "projectId");

    assertStoredProject(projectId);

    return settingsView(getStorage().getProjectSettings(projectId));
  }
);
handleTrusted(
  "settings:updateProject",
  (_event: IpcMainInvokeEvent, input: unknown): ProjectSettingsView => {
    const projectId = readStringProperty(input, "projectId");
    const fileListCollapsed = readBooleanProperty(input, "fileListCollapsed");
    const fileListWidth = readNumberProperty(input, "fileListWidth");

    assertStoredProject(projectId);

    const settings: ProjectSettingsRecord = {
      fileListCollapsed,
      fileListWidth,
      projectId
    };

    getStorage().upsertProjectSettings(settings);

    return settingsView(getStorage().getProjectSettings(projectId));
  }
);
handleTrusted(
  "reviews:markFileReviewed",
  async (_event: IpcMainInvokeEvent, input: unknown): Promise<MarkReviewedResult> => {
    const totalStartedAt = performance.now();
    const projectId = readStringProperty(input, "projectId");
    const reviewTargetId = readStringProperty(input, "reviewTargetId");
    const pathName = readStringProperty(input, "path");
    const displayedDiffHash = readStringProperty(input, "displayedDiffHash");
    const project = assertStoredProject(projectId);
    const storedReviewTarget = getStorage().getReviewTarget(reviewTargetId);
    const reviewTarget =
      storedReviewTarget?.projectId === projectId
        ? reviewTargetFromRecord(storedReviewTarget)
        : undefined;
    const fileLoadStartedAt = performance.now();
    const file =
      reviewTarget !== undefined
        ? await loadCurrentReviewFile(project, reviewTarget, pathName)
        : null;
    const fileLoadMs = elapsedSince(fileLoadStartedAt);

    if (!file) {
      const workspace = await loadProjectWorkspace(projectId);
      logMainPerformance("reviews.markFileReviewed", {
        fileLoadMs,
        reason: "file_missing",
        status: "rejected",
        totalMs: elapsedSince(totalStartedAt)
      });
      return {
        reason: "file_missing",
        status: "rejected",
        workspace
      };
    }

    if (file.diffHash !== displayedDiffHash) {
      const workspace = await loadProjectWorkspace(projectId);
      logMainPerformance("reviews.markFileReviewed", {
        fileLoadMs,
        reason: "stale_diff",
        status: "rejected",
        totalMs: elapsedSince(totalStartedAt)
      });
      return {
        reason: "stale_diff",
        status: "rejected",
        workspace
      };
    }

    const result = getStorage().verifyAndMarkReviewed({
      currentDiffHash: file.diffHash,
      displayedDiffHash,
      path: pathName,
      ...(file.previousPath ? { previousPath: file.previousPath } : {}),
      projectId,
      reviewTargetId
    });

    if (!result.marked) {
      const workspace = await loadProjectWorkspace(projectId);
      logMainPerformance("reviews.markFileReviewed", {
        fileLoadMs,
        reason: result.reason,
        status: "rejected",
        totalMs: elapsedSince(totalStartedAt)
      });
      return {
        reason: result.reason,
        status: "rejected",
        workspace
      };
    }

    const workspaceLoadStartedAt = performance.now();
    const workspace = await loadProjectWorkspace(projectId);
    const workspaceLoadMs = elapsedSince(workspaceLoadStartedAt);
    logMainPerformance("reviews.markFileReviewed", {
      fileLoadMs,
      fileCount: workspace.files.length,
      path: pathName,
      status: "marked",
      totalMs: elapsedSince(totalStartedAt),
      workspaceLoadMs
    });

    return {
      status: "marked",
      workspace
    };
  }
);
handleTrusted(
  "reviews:unmarkFileReviewed",
  async (_event: IpcMainInvokeEvent, input: unknown): Promise<UnmarkReviewedResult> => {
    const projectId = readStringProperty(input, "projectId");
    const reviewTargetId = readStringProperty(input, "reviewTargetId");
    const pathName = readStringProperty(input, "path");
    const displayedDiffHash = readStringProperty(input, "displayedDiffHash");
    const workspace = await loadProjectWorkspace(projectId);
    const file = workspace.files.find((candidate) => candidate.path === pathName);

    if (!file) {
      return {
        reason: "file_missing",
        status: "rejected",
        workspace
      };
    }

    if (
      workspace.reviewTarget.id !== reviewTargetId ||
      file.diffHash !== displayedDiffHash
    ) {
      return {
        reason: "stale_diff",
        status: "rejected",
        workspace
      };
    }

    const result = getStorage().verifyAndUnmarkReviewed({
      currentDiffHash: file.diffHash,
      displayedDiffHash,
      path: file.path,
      reviewTargetId
    });

    if (!result.unmarked) {
      return {
        reason: result.reason,
        status: "rejected",
        workspace
      };
    }

    const remainingPathMarks = getStorage()
      .listReviewMarks(reviewTargetId)
      .filter((mark) => mark.path === file.path);

    return {
      status: "unmarked",
      workspace: workspaceWithUpdatedReviewState(workspace, file.path, {
        invalidated: remainingPathMarks.some(
          (mark) => mark.reviewedDiffHash !== file.diffHash
        ),
        reviewed: false
      })
    };
  }
);
handleTrusted(
  "comments:create",
  async (
    _event: IpcMainInvokeEvent,
    input: unknown
  ): Promise<CreateReviewCommentResult> => {
    const projectId = readStringProperty(input, "projectId");
    const reviewTargetId = readStringProperty(input, "reviewTargetId");
    const pathName = readStringProperty(input, "path");
    const displayedDiffHash = readStringProperty(input, "displayedDiffHash");
    const side = readEnumProperty(input, "side", ["additions", "deletions"]);
    const lineStart = readNumberProperty(input, "lineStart");
    const lineEnd = readNumberProperty(input, "lineEnd");
    const body = readStringProperty(input, "body").trim();
    const project = assertStoredProject(projectId);
    const reviewTarget = await loadCurrentProjectReviewTarget(project);
    const currentReviewTargetId = createReviewTargetId(reviewTarget);

    if (currentReviewTargetId !== reviewTargetId) {
      return {
        reason: "stale_diff",
        status: "rejected"
      };
    }

    const file = await loadCurrentReviewFile(project, reviewTarget, pathName);

    if (!file) {
      return {
        reason: "file_missing",
        status: "rejected"
      };
    }

    if (file.diffHash !== displayedDiffHash) {
      return {
        reason: "stale_diff",
        status: "rejected"
      };
    }

    if (body.length === 0) {
      throw new Error("Review comment body is required.");
    }

    const comment = getStorage().createReviewComment({
      body,
      diffHash: file.diffHash,
      lineEnd,
      lineStart,
      path: pathName,
      ...(file.previousPath ? { previousPath: file.previousPath } : {}),
      projectId,
      reviewTargetId,
      side
    });

    return {
      comment: reviewCommentView(comment),
      status: "created"
    };
  }
);
handleTrusted(
  "comments:update",
  (_event: IpcMainInvokeEvent, input: unknown): UpdateReviewCommentResult => {
    const commentId = readStringProperty(input, "id");
    const body = readStringProperty(input, "body").trim();

    if (body.length === 0) {
      throw new Error("Review comment body is required.");
    }

    const comment = getStorage().updateReviewComment(commentId, body);

    if (!comment) {
      return {
        reason: "comment_missing",
        status: "rejected"
      };
    }

    return {
      comment: reviewCommentView(comment),
      status: "updated"
    };
  }
);
handleTrusted(
  "comments:delete",
  (_event: IpcMainInvokeEvent, input: unknown): DeleteReviewCommentResult => {
    const commentId = readStringProperty(input, "id");

    if (!getStorage().deleteReviewComment(commentId)) {
      return {
        reason: "comment_missing",
        status: "rejected"
      };
    }

    return { status: "deleted" };
  }
);
handleTrusted(
  "comments:copyReport",
  async (
    _event: IpcMainInvokeEvent,
    input: unknown
  ): Promise<CopyReviewCommentsReportResult> => {
    const projectId = readStringProperty(input, "projectId");
    const reviewTargetId = readStringProperty(input, "reviewTargetId");
    const expectedCommentIds =
      readOptionalStringArrayProperty(input, "expectedCommentIds") ?? [];
    const workspace = await loadProjectWorkspace(projectId);

    if (
      workspace.reviewTarget.id !== reviewTargetId ||
      !sameCommentIds(workspace.comments, expectedCommentIds)
    ) {
      return {
        reason: "stale_diff",
        status: "rejected"
      };
    }

    const comments = await reviewCommentReportItems(projectId, workspace.comments);

    clipboard.writeText(
      formatReviewCommentsReport({
        comments,
        projectName: workspace.project.name,
        targetLabel: reviewTargetLabel(workspace.reviewTarget)
      })
    );

    return {
      commentCount: workspace.comments.length,
      status: "copied"
    };
  }
);
handleTrusted(
  "files:openInEditor",
  async (_event: IpcMainInvokeEvent, input: unknown): Promise<OpenFileInEditorResult> => {
    const projectId = readStringProperty(input, "projectId");
    const pathName = readStringProperty(input, "path");

    return openFileInEditor(projectId, pathName);
  }
);
handleTrusted(
  "files:loadDiff",
  async (
    _event: IpcMainInvokeEvent,
    input: unknown
  ): Promise<ReviewFileDiffContentView | null> => {
    const projectId = readStringProperty(input, "projectId");
    const pathName = readStringProperty(input, "path");

    return loadProjectFileDiff(projectId, pathName);
  }
);

app.on("before-quit", () => {
  isQuitting = true;
  pendingProjectWatcherSync = undefined;
  void projectWatchService?.close();
  projectWatchService = undefined;
  storage?.close();
  storage = undefined;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    configureAppRuntime();
    void createMainWindow();
  }
});

void app.whenReady().then(async () => {
  configureAppRuntime();
  await createMainWindow();
  scheduleAutoUpdaterWiring();
});

export { mainWindow };

function configureAppRuntime(): void {
  if (didConfigureAppRuntime) {
    return;
  }

  didConfigureAppRuntime = true;

  const appRuntimeConfig = resolveAppRuntimeConfig({
    envVariant: process.env.DIFFTRAY_APP_VARIANT,
    executablePath: process.execPath,
    isPackaged: app.isPackaged,
    productName: app.getName()
  });

  resolvedAppRuntimeConfig = appRuntimeConfig;

  if (process.platform === "win32") {
    app.setAppUserModelId(appRuntimeConfig.appId);
  }

  if (!userDataPath) {
    app.setPath(
      "userData",
      path.join(app.getPath("appData"), appRuntimeConfig.userDataDirectoryName)
    );
  }

  if (process.platform === "darwin" && !app.isPackaged) {
    const dockIcon = appIconImage();

    if (dockIcon) {
      app.dock?.setIcon(dockIcon);
    }
  }

  updateState.subscribe(emitUpdatePhase);
}

function handleTrusted(
  channel: string,
  listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
): void {
  ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
    assertTrustedIpcSender(event);

    return listener(event, ...args);
  });
}

function assertTrustedIpcSender(event: IpcMainInvokeEvent): void {
  const senderUrl = event.senderFrame?.url;

  if (!senderUrl || !isTrustedNavigationTarget(senderUrl)) {
    throw new Error("Rejected IPC message from untrusted renderer.");
  }
}

function isTrustedNavigationTarget(rawUrl: string): boolean {
  return (
    trustedRendererLocation !== undefined &&
    isTrustedRendererUrl(rawUrl, trustedRendererLocation)
  );
}

function appIconImage(): NativeImage | undefined {
  const iconPath = path.join(__dirname, "../../../resources/icon.png");
  const image = nativeImage.createFromPath(iconPath);

  return image.isEmpty() ? undefined : image;
}

function emitUpdatePhase(phase: UpdatePhase): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send("updates:phase", phase);
    }
  }
}

function scheduleAutoUpdaterWiring(): void {
  if (didWireAutoUpdater) {
    return;
  }

  if (resolvedAppRuntimeConfig?.variant !== "production") {
    return;
  }

  didWireAutoUpdater = true;

  setTimeout(() => {
    void wireAutoUpdater();
  }, 3_000);
}

async function wireAutoUpdater(): Promise<void> {
  const log = (await import("electron-log/main.js")).default;

  log.transports.file.level = "info";
  log.initialize();

  let autoUpdater;

  try {
    autoUpdater = await loadAutoUpdater();
  } catch (caughtError) {
    log.error("autoUpdater failed to load:", caughtError);
    console.error("autoUpdater failed to load:", caughtError);
    return;
  }

  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  const handleUpdateEvent = (event: UpdateEvent): void => {
    updateState.handleEvent(event);
    log.info("autoUpdater event", event, "phase", updateState.phase);
  };

  autoUpdater.on("checking-for-update", () => handleUpdateEvent({ kind: "checking" }));
  autoUpdater.on("update-available", (info) =>
    handleUpdateEvent({ kind: "available", version: info.version })
  );
  autoUpdater.on("update-not-available", () =>
    handleUpdateEvent({ kind: "not-available" })
  );
  autoUpdater.on("download-progress", (progress) =>
    handleUpdateEvent({ kind: "progress", percent: progress.percent })
  );
  autoUpdater.on("update-downloaded", (info) =>
    handleUpdateEvent({ kind: "downloaded", version: info.version })
  );
  autoUpdater.on("error", (error: Error) =>
    handleUpdateEvent({ kind: "error", message: error.message })
  );

  try {
    log.info("autoUpdater checking for updates");
    await autoUpdater.checkForUpdates();
  } catch (caughtError) {
    log.error("autoUpdater.checkForUpdates failed:", caughtError);
    console.error("autoUpdater.checkForUpdates failed:", caughtError);
  }
}

function getStorage(): DifftrayStorage {
  if (storage) {
    return storage;
  }

  const storageDir = path.join(userDataPath ?? app.getPath("userData"), "data");
  mkdirSync(storageDir, { recursive: true });
  storage = openStorage(path.join(storageDir, "difftray.sqlite"));

  return storage;
}

function getProjectWatchService(): ProjectWatchService {
  if (projectWatchService) {
    return projectWatchService;
  }

  projectWatchService = new ProjectWatchService({
    createWatcher: createChokidarProjectWatcherFactory(),
    emitProjectChange,
    resolveWatchPaths: async (project) => resolveGitProjectWatchPaths(project.path)
  });

  return projectWatchService;
}

function emitProjectChange(change: ProjectWatchChangeEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send("projects:changed", change);
    }
  }
}

let pendingProjectWatcherSync: readonly WatchedProject[] | undefined;
let isProjectWatcherSyncRunning = false;

function syncProjectWatchersInBackground(
  projects: readonly Pick<StoredProjectRecord, "id" | "path">[]
): void {
  if (!projectWatchersEnabled || isQuitting) {
    return;
  }

  pendingProjectWatcherSync = projects.map(projectWatchTarget);

  if (isProjectWatcherSyncRunning) {
    return;
  }

  isProjectWatcherSyncRunning = true;

  void (async () => {
    try {
      for (;;) {
        const projectsToSync = pendingProjectWatcherSync;

        if (!projectsToSync) {
          break;
        }

        pendingProjectWatcherSync = undefined;

        try {
          await getProjectWatchService().syncProjects(projectsToSync);
        } catch (caughtError) {
          console.error("Project watcher sync failed", caughtError);
        }
      }
    } finally {
      isProjectWatcherSyncRunning = false;

      if (pendingProjectWatcherSync) {
        syncProjectWatchersInBackground(pendingProjectWatcherSync);
      }
    }
  })();
}

function watchActiveProjectInBackground(
  project: Pick<StoredProjectRecord, "id" | "path">
): void {
  syncProjectWatchersInBackground([project]);
}

function projectWatchTarget(
  project: Pick<StoredProjectRecord, "id" | "path">
): WatchedProject {
  return {
    id: project.id,
    path: project.path
  };
}

function listAvailableRecentProjects(): readonly StoredProjectRecord[] {
  const projects = getStorage().listRecentProjects();

  for (const project of projects) {
    if (!existsSync(project.path)) {
      getStorage().deleteProject(project.id);
    }
  }

  return getStorage().listRecentProjects();
}

function listAvailableRecentProjectViews(): readonly RecentProjectView[] {
  const projects = listAvailableRecentProjects();

  return projects.map((project) => projectView(project));
}

function projectLoadProgressReporter(
  sender: WebContents,
  projectId: string
): ProjectLoadProgressReporter {
  return (progress) => {
    const project = getStorage().getProject(projectId);

    if (!project || sender.isDestroyed()) {
      return;
    }

    const payload: ProjectLoadProgressView = {
      ...progress,
      projectId: project.id,
      projectName: project.name,
      projectPath: project.path
    };

    sender.send("projects:loadProgress", payload);
  };
}

function projectProgressFromGit(
  progress: DiffLoadProgress
): Omit<ProjectLoadProgressView, "projectId" | "projectName" | "projectPath"> {
  return {
    ...(progress.loadedFiles !== undefined ? { loadedFiles: progress.loadedFiles } : {}),
    message: gitProgressMessage(progress.phase),
    ...(progress.path ? { path: progress.path } : {}),
    phase: progress.phase,
    ...(progress.totalFiles !== undefined ? { totalFiles: progress.totalFiles } : {})
  };
}

function gitProgressMessage(progress: DiffLoadProgress["phase"]): string {
  switch (progress) {
    case "resolving_target":
      return "Resolving review target";
    case "scanning_files":
      return "Scanning changed files";
    case "loading_files":
      return "Loading changed files";
  }
}

async function openProjectFromDialog(
  sender: WebContents
): Promise<ReviewWorkspaceView | null> {
  const dialogOptions: OpenDialogOptions = {
    buttonLabel: "Open Repository",
    properties: ["openDirectory"]
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);

  if (result.canceled) {
    return null;
  }

  const selectedPath = result.filePaths[0];

  if (!selectedPath) {
    return null;
  }

  const project = await storeRepositoryAtPath(selectedPath);

  return loadProjectWorkspace(
    project.id,
    projectLoadProgressReporter(sender, project.id)
  );
}

async function storeRepositoryAtPath(selectedPath: string): Promise<ProjectRecord> {
  const repository = await findGitRepository(selectedPath);

  if (!repository) {
    throw new Error("Selected folder is not inside a Git repository.");
  }

  const project = {
    id: repository.root,
    lastOpenedAt: new Date().toISOString(),
    name: path.basename(repository.root),
    path: repository.root
  };

  upsertOpenedProject(project);

  return project;
}

async function loadProjectWorkspace(
  projectId: string,
  reportProgress?: ProjectLoadProgressReporter
): Promise<ReviewWorkspaceView> {
  const project = getStorage().getProject(projectId);

  if (!project) {
    throw new Error(`Project is not stored: ${projectId}`);
  }

  const { files, progress, reviewTarget, reviewTargetId } = await loadProjectReviewState(
    project,
    reportProgress
  );
  const reviewSummary = projectReviewSummaryView(files, progress);

  watchActiveProjectInBackground(project);
  reportProgress?.({
    message: "Preparing diff view",
    phase: "preparing_workspace"
  });

  return {
    comments: activeReviewCommentViews(reviewTargetId, files),
    files: files.map((file) => reviewFileView(file)),
    progress,
    project: projectView(project, reviewSummary),
    reviewTarget: {
      ...(reviewTarget.kind === "branch"
        ? { baseRefName: reviewTarget.baseRefName }
        : {}),
      ...(reviewTarget.headRefName ? { headRefName: reviewTarget.headRefName } : {}),
      headSha: reviewTarget.headSha,
      id: reviewTargetId,
      kind: reviewTarget.kind
    }
  };
}

async function loadProjectReviewSummaryIfAvailable(
  projectId: string
): Promise<ProjectReviewSummaryView | null> {
  const project = getStorage().getProject(projectId);

  if (!project) {
    return null;
  }

  if (!existsSync(project.path)) {
    getStorage().deleteProject(project.id);
    await projectWatchService?.stopProject(project.id);
    return null;
  }

  const { files, progress } = await loadProjectReviewState(project);

  return projectReviewSummaryView(files, progress);
}

async function loadProjectReviewState(
  project: StoredProjectRecord,
  reportProgress?: ProjectLoadProgressReporter
): Promise<{
  readonly files: readonly FileReviewStateWithSummary[];
  readonly progress: ReviewProgress;
  readonly reviewTarget: ReviewTarget;
  readonly reviewTargetId: string;
}> {
  const gitProgress = {
    onProgress: (progress: DiffLoadProgress) => {
      reportProgress?.(projectProgressFromGit(progress));
    }
  };
  const diffResult = project.defaultBaseRef
    ? await loadBranchDiffSummaries(project.path, project.defaultBaseRef, gitProgress)
    : await loadWorkingTreeDiffSummaries(project.path, gitProgress);
  const reviewTarget = reviewTargetFromGit(diffResult.reviewTarget);
  const reviewTargetId = createReviewTargetId(reviewTarget);
  const settings = getStorage().getAppSettings();

  reportProgress?.({
    message: "Resolving review state",
    phase: "resolving_review_state"
  });
  getStorage().upsertReviewTarget(reviewTargetRecord(reviewTargetId, reviewTarget));

  const diffs = diffResult.files.map((file) => fileDiffFromGit(file));
  const marks = getStorage().listReviewMarks(
    reviewTargetId
  ) satisfies readonly ReviewMark[];
  const states = resolveReviewStates({
    diffs,
    marks,
    reviewTarget,
    showGeneratedFiles: settings.showGeneratedFiles
  });
  const files = states.map((state, index) => {
    const summary = diffResult.files[index];

    if (!summary) {
      throw new Error(`Review summary missing for ${state.path}`);
    }

    return { state, summary };
  });

  return {
    files,
    progress: calculateProgress(states),
    reviewTarget,
    reviewTargetId
  };
}

async function loadProjectWorkspaceIfAvailable(
  projectId: string,
  reportProgress?: ProjectLoadProgressReporter
): Promise<ReviewWorkspaceView | null> {
  const project = getStorage().getProject(projectId);

  if (!project) {
    return null;
  }

  if (!existsSync(project.path)) {
    getStorage().deleteProject(project.id);
    await projectWatchService?.stopProject(project.id);
    return null;
  }

  return loadProjectWorkspace(projectId, reportProgress);
}

function workspaceWithUpdatedReviewState(
  workspace: ReviewWorkspaceView,
  pathName: string,
  reviewState: Pick<ReviewFileView, "invalidated" | "reviewed">
): ReviewWorkspaceView {
  const files = workspace.files.map((file) =>
    file.path === pathName ? { ...file, ...reviewState } : file
  );
  const progress = reviewProgressView(files);

  return {
    ...workspace,
    files,
    progress,
    project: {
      ...workspace.project,
      reviewSummary: {
        attentionCount: files.filter((file) => file.visible && file.invalidated).length,
        progress
      }
    }
  };
}

async function openFileInEditor(
  projectId: string,
  pathName: string
): Promise<OpenFileInEditorResult> {
  const project = getStorage().getProject(projectId);

  if (!project) {
    throw new Error(`Project is not stored: ${projectId}`);
  }

  const workspace = await loadProjectWorkspace(projectId);
  const file = workspace.files.find((candidate) => candidate.path === pathName);

  if (!file || file.status === "deleted") {
    return {
      reason: "file_missing",
      status: "rejected"
    };
  }

  const absoluteFilePath = await resolveSafeProjectFilePath(project.path, file.path);

  if (!absoluteFilePath) {
    return {
      reason: "file_missing",
      status: "rejected"
    };
  }

  const settings = getStorage().getAppSettings();

  const editorLaunchConfig = trustedEditorLaunchConfig(settings.editorLaunchConfig);

  if (!editorLaunchConfig) {
    const launchError = await shell.openPath(absoluteFilePath);

    return launchError.length === 0
      ? { status: "opened" }
      : { reason: "launch_failed", status: "rejected" };
  }

  const child = spawn(
    editorLaunchConfig.command,
    editorLaunchConfig.args.map((arg) =>
      expandEditorArg(arg, {
        column: 1,
        filePath: absoluteFilePath,
        line: 1,
        projectPath: project.path
      })
    ),
    {
      detached: true,
      shell: false,
      stdio: "ignore"
    }
  );
  child.unref();

  return { status: "opened" };
}

async function loadProjectFileDiff(
  projectId: string,
  pathName: string
): Promise<ReviewFileDiffContentView | null> {
  const project = getStorage().getProject(projectId);

  if (!project) {
    throw new Error(`Project is not stored: ${projectId}`);
  }

  const gitDiff = project.defaultBaseRef
    ? await loadBranchFileDiff(project.path, project.defaultBaseRef, pathName)
    : await loadWorkingTreeFileDiff(project.path, pathName);

  if (!gitDiff) {
    return null;
  }

  const diff = fileDiffFromGit(gitDiff);
  const patch = patchForDiff(diff);
  const summary = summarizePatch(patch);
  const textContent = diff.content.kind === "text" ? diff.content : undefined;

  return {
    additions: summary.additions,
    deletions: summary.deletions,
    ...(textContent?.newText !== undefined ? { newText: textContent.newText } : {}),
    ...(textContent?.oldText !== undefined ? { oldText: textContent.oldText } : {}),
    patch,
    path: diff.newPath,
    status: diff.status
  };
}

async function reviewCommentReportItems(
  projectId: string,
  comments: readonly ReviewCommentView[]
): Promise<readonly ReviewCommentReportItem[]> {
  const uniquePaths = [...new Set(comments.map((comment) => comment.path))];
  const diffEntries = await Promise.all(
    uniquePaths.map(
      async (pathName) =>
        [pathName, await loadProjectFileDiff(projectId, pathName)] as const
    )
  );
  const diffByPath = new Map(diffEntries);

  return comments.map((comment) => {
    const context = commentReportContext(comment, diffByPath.get(comment.path) ?? null);

    return {
      ...comment,
      ...(context ? { context } : {})
    };
  });
}

function commentReportContext(
  comment: ReviewCommentView,
  diff: ReviewFileDiffContentView | null
): ReviewCommentReportContext | undefined {
  const text = comment.side === "additions" ? diff?.newText : diff?.oldText;

  if (text === undefined) {
    return undefined;
  }

  const lines = textLines(text);

  if (comment.lineStart > lines.length) {
    return undefined;
  }

  const contextRadius = 3;
  const lineStart = Math.max(1, comment.lineStart - contextRadius);
  const lineEnd = Math.min(lines.length, comment.lineEnd + contextRadius);

  return {
    lines: Array.from({ length: lineEnd - lineStart + 1 }, (_, index) => {
      const lineNumber = lineStart + index;

      return {
        kind:
          lineNumber >= comment.lineStart && lineNumber <= comment.lineEnd
            ? "commented"
            : "context",
        lineNumber,
        text: lines[lineNumber - 1] ?? ""
      };
    }),
    side: comment.side
  };
}

function textLines(text: string): readonly string[] {
  const lines = text.split("\n");

  return lines.at(-1) === "" ? lines.slice(0, -1) : lines;
}

function upsertOpenedProject(project: ProjectRecord): void {
  getStorage().upsertProject(project);
}

function assertStoredProject(projectId: string): StoredProjectRecord {
  const project = getStorage().getProject(projectId);

  if (!project) {
    throw new Error(`Project is not stored: ${projectId}`);
  }

  return project;
}

async function listInstalledEditorPresetViews(): Promise<readonly EditorPresetView[]> {
  const appPathByName = discoverMacOSApplicationPathsByName({
    homePath: app.getPath("home"),
    platform: process.platform
  });
  const presets = listInstalledEditorPresets({
    installedMacOSAppNames: [...appPathByName.keys()],
    platform: process.platform
  });

  return Promise.all(
    presets.map(async (preset) => {
      const appPath = appPathForPreset(preset, appPathByName);
      const iconDataUrl = appPath ? await iconDataUrlForAppPath(appPath) : undefined;

      return {
        args: preset.launchConfig.args,
        command: preset.launchConfig.command,
        ...(iconDataUrl ? { iconDataUrl } : {}),
        id: preset.id,
        name: preset.name
      };
    })
  );
}

async function iconDataUrlForAppPath(appPath: string): Promise<string | undefined> {
  const bundledIconDataUrl = await iconDataUrlFromBundle(appPath);

  if (bundledIconDataUrl) {
    return bundledIconDataUrl;
  }

  try {
    const icon = await nativeImageWithTimeout(
      app.getFileIcon(appPath, { size: "normal" }),
      300
    );
    const dataUrl = icon?.toDataURL() ?? "";

    return dataUrl.length > 0 ? dataUrl : undefined;
  } catch {
    return undefined;
  }
}

async function iconDataUrlFromBundle(appPath: string): Promise<string | undefined> {
  const iconPath = macOSBundleIconPath(appPath);

  if (!iconPath) {
    return undefined;
  }

  const thumbnail = await nativeImageWithTimeout(
    nativeImage.createThumbnailFromPath(iconPath, { height: 48, width: 48 }),
    300
  );

  if (thumbnail && !thumbnail.isEmpty()) {
    return thumbnail.toDataURL();
  }

  const icon = nativeImage.createFromPath(iconPath);

  if (icon.isEmpty()) {
    return undefined;
  }

  return icon.resize({ height: 48, width: 48 }).toDataURL();
}

async function nativeImageWithTimeout(
  promise: Promise<NativeImage>,
  timeoutMs: number
): Promise<NativeImage | undefined> {
  return Promise.race([
    promise,
    new Promise<undefined>((resolve) => {
      setTimeout(() => {
        resolve(undefined);
      }, timeoutMs);
    })
  ]);
}

async function loadCurrentReviewFile(
  project: StoredProjectRecord,
  reviewTarget: ReviewTarget,
  pathName: string
): Promise<{ readonly diffHash: string; readonly previousPath?: string } | null> {
  const summary =
    reviewTarget.kind === "branch"
      ? await loadBranchFileDiffSummary(project.path, reviewTarget.baseRefName, pathName)
      : await loadWorkingTreeFileDiffSummary(project.path, pathName);

  if (!summary) {
    return null;
  }

  const diff = fileDiffFromGit(summary);

  return {
    diffHash: createDiffHash(reviewTarget, diff),
    ...(diff.oldPath ? { previousPath: diff.oldPath } : {})
  };
}

async function loadCurrentProjectReviewTarget(
  project: StoredProjectRecord
): Promise<ReviewTarget> {
  const target = project.defaultBaseRef
    ? await loadBranchReviewTarget(project.path, project.defaultBaseRef)
    : (await loadWorkingTreeReviewTarget(project.path)).reviewTarget;

  return reviewTargetFromGit(target);
}

function activeReviewCommentViews(
  reviewTargetId: string,
  files: readonly FileReviewStateWithSummary[]
): readonly ReviewCommentView[] {
  const activeDiffHashByPath = new Map(
    files.map((file) => [file.state.path, file.state.diffHash])
  );

  return getStorage()
    .listReviewComments(reviewTargetId)
    .filter((comment) => activeDiffHashByPath.get(comment.path) === comment.diffHash)
    .map(reviewCommentView);
}
