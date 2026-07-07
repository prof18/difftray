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
import { networkInterfaces } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

import {
  calculateProgress,
  createDiffHash,
  createReviewTargetId,
  formatReviewCommentsReport,
  resolveReviewStates,
  type ReviewCommentReportItem,
  type ReviewMark,
  type ReviewProgress,
  type ReviewTarget
} from "@difftray/core";
import {
  COMPANION_PROTOCOL_VERSION,
  type PairingQrPayload,
  CreateCommentBody as CompanionCreateCommentBody,
  DiffTargetBody,
  FileDiffContentKind,
  MarkReviewedBody as CompanionMarkReviewedBody,
  UpdateCommentBody as CompanionUpdateCommentBody,
  WorkspaceSummary
} from "@difftray/companion-protocol";
import {
  findGitRepository,
  loadBranchReviewTarget,
  loadBranchDiffSummaries,
  loadBranchFileDiffSummary,
  loadBranchFileDiff,
  listBranchRefs,
  listRecentCommits,
  loadCommitReviewTarget,
  loadCommitDiffSummaries,
  loadCommitFileDiffSummary,
  loadCommitFileDiff,
  loadWorkingTreeReviewTarget,
  loadWorkingTreeDiffSummaries,
  loadWorkingTreeFileDiffSummary,
  loadWorkingTreeFileDiff,
  type DiffLoadProgress
} from "@difftray/git";
import {
  applyProjectTabOrder,
  sanitizeProjectTabOrder,
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
  readStringArrayProperty,
  readStringProperty
} from "./ipc-input.js";
import { editorConfigFromInput, expandEditorArg } from "./editor-launch.js";
import {
  resolveAppRuntimeConfig,
  resolveWindowPresentationMode,
  type AppRuntimeConfig
} from "./app-runtime.js";
import { loadAutoUpdater } from "./electron-updater.js";
import { ApplicationMenuController } from "./application-menu.js";
import {
  createCompanionAuthManager,
  createCompanionEnvelopeVerifier,
  getOrCreateCompanionServerIdentity,
  type CompanionAuthManager,
  type CompanionPairingSessionView,
  type PendingPairRequestView
} from "./companion/auth.js";
import {
  CompanionLifecycleController,
  CompanionWorkspaceChangeBroadcaster
} from "./companion/lifecycle.js";
import { createCompanionServer } from "./companion/server.js";
import { UpdateCheckScheduler } from "./update-check-scheduler.js";
import { UpdateState, type UpdateEvent, type UpdatePhase } from "./update-state.js";
import {
  appSettingsView,
  commentReportContext,
  fileDiffFromGit,
  patchForDiff,
  projectProgressFromGit,
  projectView,
  reviewCommentView,
  projectReviewSummaryView,
  reviewTargetFromGit,
  reviewTargetFromRecord,
  reviewTargetLabel,
  reviewTargetRecord,
  sameCommentIds,
  settingsView,
  summarizePatch,
  workspaceWithUpdatedReviewState,
  type AppSettingsView,
  type FileReviewStateWithSummary,
  type ProjectLoadProgressPatch,
  type ProjectLoadProgressView,
  type ProjectReviewSummaryView,
  type ProjectSettingsView,
  type RecentProjectView,
  type ReviewFileDiffContentView,
  type ReviewCommentView,
  type ReviewWorkspaceView
} from "./view-models.js";
import {
  discoverMacOSApplicationPathsByName,
  macOSBundleIconPath
} from "./editor-discovery.js";
import {
  installedEditorPresetViews,
  type EditorPresetView
} from "./editor-preset-views.js";
import { elapsedSince, logMainPerformance } from "./main-performance.js";
import { reviewWorkspaceView } from "./project-workspace-view.js";
import type {
  CompanionDeps,
  MarkResult as CompanionMarkResult,
  UnmarkResult as CompanionUnmarkResult
} from "./companion/api.js";

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
let applicationMenuController: ApplicationMenuController | undefined;
let updateCheckScheduler: UpdateCheckScheduler | undefined;
let updateCheckSchedulerPromise: Promise<UpdateCheckScheduler | undefined> | undefined;
let companionLifecycleController: CompanionLifecycleController | undefined;
let companionWorkspaceChangeBroadcaster: CompanionWorkspaceChangeBroadcaster | undefined;
let companionAuthManager: CompanionAuthManager | undefined;
let trustedRendererLocation: TrustedRendererLocation | undefined;
const updateState = new UpdateState();

type ProjectLoadProgressReporter = (progress: ProjectLoadProgressPatch) => void;

type CompanionAddressView = {
  readonly address: string;
  readonly host: string;
  readonly isTailscale: boolean;
};

type CompanionPairingStateView = {
  readonly code: string;
  readonly expiresAt: string;
  readonly qrPayload: PairingQrPayload;
};

type CompanionStateView = {
  readonly activePairing: CompanionPairingStateView | null;
  readonly addresses: readonly CompanionAddressView[];
  readonly devices: readonly CompanionDeviceView[];
  readonly enabled: boolean;
  readonly errorMessage?: string;
  readonly pendingPairRequests: readonly PendingPairRequestView[];
  readonly port?: number;
  readonly status: "error" | "running" | "stopped";
};

type CompanionDeviceView = {
  readonly createdAt: string;
  readonly id: string;
  readonly lastSeenAt?: string;
  readonly name: string;
  readonly platform: string;
  readonly publicKey: string;
  readonly revokedAt?: string;
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
handleTrusted("updates:checkNow", async (): Promise<UpdatePhase> => {
  await checkForUpdatesNow();

  return updateState.phase;
});
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
  async (_event: IpcMainInvokeEvent, input: unknown): Promise<AppSettingsView> => {
    const autoCollapseHunksOver = readNumberProperty(input, "autoCollapseHunksOver");
    const companionEnabled = readBooleanProperty(input, "companionEnabled");
    const companionPort = readNumberProperty(input, "companionPort");
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
      companionEnabled,
      companionPort,
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
    await syncCompanionLifecycleWithSettings();

    return appSettingsView(getStorage().getAppSettings());
  }
);
handleTrusted("companion:getState", async (): Promise<CompanionStateView> => {
  return companionStateView();
});
handleTrusted(
  "companion:setEnabled",
  async (_event: IpcMainInvokeEvent, input: unknown): Promise<CompanionStateView> => {
    const enabled = readBooleanProperty(input, "enabled");
    const currentSettings = getStorage().getAppSettings();

    getStorage().upsertAppSettings({
      ...currentSettings,
      companionEnabled: enabled
    });
    await syncCompanionLifecycleWithSettings();
    emitCompanionStateChanged();

    return companionStateView();
  }
);
handleTrusted("companion:startPairing", async (): Promise<CompanionPairingStateView> => {
  if (getCompanionLifecycleController().state.status !== "running") {
    throw new Error("Companion server is not running.");
  }

  const session = getCompanionAuthManager().startPairing();
  const pairing = await companionPairingStateView(session);

  emitCompanionStateChanged();

  return pairing;
});
handleTrusted("companion:cancelPairing", async (): Promise<CompanionStateView> => {
  getCompanionAuthManager().cancelPairing();
  emitCompanionStateChanged();

  return companionStateView();
});
handleTrusted(
  "companion:respondToPairRequest",
  async (_event: IpcMainInvokeEvent, input: unknown): Promise<CompanionStateView> => {
    const id = readStringProperty(input, "id");
    const approved = readBooleanProperty(input, "approved");

    if (approved) {
      getCompanionAuthManager().approvePairRequest(id);
    } else {
      getCompanionAuthManager().denyPairRequest(id);
    }

    emitCompanionStateChanged();

    return companionStateView();
  }
);
handleTrusted(
  "companion:revokeDevice",
  async (_event: IpcMainInvokeEvent, input: unknown): Promise<CompanionStateView> => {
    const id = readStringProperty(input, "id");

    getStorage().revokeCompanionDevice(id);
    emitCompanionStateChanged();

    return companionStateView();
  }
);
handleTrusted("projects:listRecent", () => listAvailableRecentProjectViews());
handleTrusted(
  "projects:saveTabOrder",
  (_event: IpcMainInvokeEvent, input: unknown): void => {
    const projectIds = readStringArrayProperty(input, "projectIds");
    const knownProjects = getStorage().listRecentProjects();

    getStorage().upsertProjectTabOrder(
      sanitizeProjectTabOrder(knownProjects, projectIds)
    );
  }
);
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

    return listBranchRefsForProject(projectId);
  }
);
handleTrusted(
  "projects:listRecentCommits",
  async (
    _event: IpcMainInvokeEvent,
    input: unknown
  ): Promise<Awaited<ReturnType<typeof listRecentCommits>>> => {
    const projectId = readStringProperty(input, "projectId");

    return listRecentCommitsForProject(projectId);
  }
);
handleTrusted(
  "projects:close",
  async (
    _event: IpcMainInvokeEvent,
    input: unknown
  ): Promise<readonly RecentProjectView[]> => {
    const projectId = readStringProperty(input, "projectId");

    deleteStoredProject(projectId);
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
    const mode = readEnumProperty(input, "mode", ["branch", "commit", "working_tree"]);
    const reportProgress = projectLoadProgressReporter(event.sender, projectId);
    const target =
      mode === "branch"
        ? ({
            mode,
            ref: readStringProperty(input, "baseRefName")
          } satisfies DiffTargetBody)
        : mode === "commit"
          ? ({
              mode,
              ref: readStringProperty(input, "commitRef")
            } satisfies DiffTargetBody)
          : ({ mode } satisfies DiffTargetBody);

    return updateProjectDiffTarget(projectId, target, reportProgress);
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
    const projectId = readStringProperty(input, "projectId");
    const reviewTargetId = readStringProperty(input, "reviewTargetId");
    const path = readStringProperty(input, "path");
    const displayedDiffHash = readStringProperty(input, "displayedDiffHash");

    return markProjectFileReviewed({
      displayedDiffHash,
      path,
      projectId,
      reviewTargetId
    });
  }
);
handleTrusted(
  "reviews:unmarkFileReviewed",
  async (_event: IpcMainInvokeEvent, input: unknown): Promise<UnmarkReviewedResult> => {
    const projectId = readStringProperty(input, "projectId");
    const reviewTargetId = readStringProperty(input, "reviewTargetId");
    const path = readStringProperty(input, "path");
    const displayedDiffHash = readStringProperty(input, "displayedDiffHash");

    return unmarkProjectFileReviewed({
      displayedDiffHash,
      path,
      projectId,
      reviewTargetId
    });
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
    const path = readStringProperty(input, "path");
    const displayedDiffHash = readStringProperty(input, "displayedDiffHash");
    const side = readEnumProperty(input, "side", ["additions", "deletions"]);
    const lineStart = readNumberProperty(input, "lineStart");
    const lineEnd = readNumberProperty(input, "lineEnd");
    const body = readStringProperty(input, "body");

    return createProjectReviewComment({
      body,
      diffHash: displayedDiffHash,
      lineEnd,
      lineStart,
      path,
      projectId,
      reviewTargetId,
      side
    });
  }
);
handleTrusted(
  "comments:update",
  (_event: IpcMainInvokeEvent, input: unknown): UpdateReviewCommentResult => {
    return updateProjectReviewComment({
      body: readStringProperty(input, "body"),
      id: readStringProperty(input, "id")
    });
  }
);
handleTrusted(
  "comments:delete",
  (_event: IpcMainInvokeEvent, input: unknown): DeleteReviewCommentResult => {
    return deleteProjectReviewComment(readStringProperty(input, "id"));
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

    clipboard.writeText(await formatProjectCommentsReport(projectId, workspace));

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

    const diff = await loadProjectFileDiffForCompanion(projectId, pathName);

    return diff?.content ?? null;
  }
);

app.on("before-quit", () => {
  isQuitting = true;
  pendingProjectWatcherSync = undefined;
  void companionLifecycleController?.stop();
  companionLifecycleController = undefined;
  companionWorkspaceChangeBroadcaster?.dispose();
  companionWorkspaceChangeBroadcaster = undefined;
  void projectWatchService?.close();
  projectWatchService = undefined;
  updateCheckScheduler?.stop();
  updateCheckScheduler = undefined;
  applicationMenuController?.dispose();
  applicationMenuController = undefined;
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
  installApplicationMenu();
  await syncCompanionLifecycleWithSettings();
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

function installApplicationMenu(): void {
  if (applicationMenuController || !resolvedAppRuntimeConfig) {
    return;
  }

  applicationMenuController = new ApplicationMenuController({
    appName: resolvedAppRuntimeConfig.name,
    checkForUpdates: checkForUpdatesNow,
    getUpdatePhase: () => updateState.phase,
    onUpdatePhaseChange: (listener) => updateState.subscribe(listener),
    updatesEnabled: resolvedAppRuntimeConfig.variant === "production"
  });
  applicationMenuController.install();
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
    void startAutoUpdaterChecks();
  }, 3_000);
}

async function checkForUpdatesNow(): Promise<void> {
  if (resolvedAppRuntimeConfig?.variant !== "production") {
    return;
  }

  const scheduler = await ensureAutoUpdaterScheduler();

  if (!scheduler) {
    throw new Error(
      updateState.phase.kind === "error"
        ? updateState.phase.message
        : "Unable to check for updates."
    );
  }

  await scheduler.checkNow();
}

async function startAutoUpdaterChecks(): Promise<void> {
  const scheduler = await ensureAutoUpdaterScheduler();

  scheduler?.start();
}

async function ensureAutoUpdaterScheduler(): Promise<UpdateCheckScheduler | undefined> {
  if (updateCheckScheduler) {
    return updateCheckScheduler;
  }

  updateCheckSchedulerPromise ??= wireAutoUpdater().finally(() => {
    updateCheckSchedulerPromise = undefined;
  });

  return updateCheckSchedulerPromise;
}

async function wireAutoUpdater(): Promise<UpdateCheckScheduler | undefined> {
  const log = (await import("electron-log/main.js")).default;

  log.transports.file.level = "info";
  log.initialize();

  let autoUpdater;

  try {
    autoUpdater = await loadAutoUpdater();
  } catch (caughtError) {
    const error =
      caughtError instanceof Error ? caughtError : new Error(String(caughtError));

    updateState.handleEvent({ kind: "error", message: error.message });
    log.error("autoUpdater failed to load:", caughtError);
    console.error("autoUpdater failed to load:", caughtError);
    return undefined;
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

  updateCheckScheduler = new UpdateCheckScheduler({
    checkForUpdates: async () => {
      try {
        log.info("autoUpdater checking for updates");
        await autoUpdater.checkForUpdates();
      } catch (caughtError) {
        const error =
          caughtError instanceof Error ? caughtError : new Error(String(caughtError));
        handleUpdateEvent({ kind: "error", message: error.message });
        log.error("autoUpdater.checkForUpdates failed:", caughtError);
        console.error("autoUpdater.checkForUpdates failed:", caughtError);
      }
    }
  });

  return updateCheckScheduler;
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

function getCompanionLifecycleController(): CompanionLifecycleController {
  if (companionLifecycleController) {
    return companionLifecycleController;
  }

  companionLifecycleController = new CompanionLifecycleController({
    createServer: () => createCompanionServer(createDesktopCompanionDeps()),
    serverIdentity: companionServerIdentity
  });

  return companionLifecycleController;
}

function getCompanionAuthManager(): CompanionAuthManager {
  if (companionAuthManager) {
    return companionAuthManager;
  }

  companionAuthManager = createCompanionAuthManager({
    onStateChanged: emitCompanionStateChanged,
    storage: getStorage()
  });

  return companionAuthManager;
}

function companionServerIdentity(): ReturnType<
  typeof getOrCreateCompanionServerIdentity
> {
  return getOrCreateCompanionServerIdentity({
    appVersion: app.getVersion(),
    storage: getStorage()
  });
}

async function syncCompanionLifecycleWithSettings(): Promise<void> {
  try {
    await getCompanionLifecycleController().applySettings(getStorage().getAppSettings());
  } catch (caughtError) {
    console.error("Companion server lifecycle sync failed", caughtError);
  }
}

async function companionStateView(): Promise<CompanionStateView> {
  const settings = getStorage().getAppSettings();
  const lifecycleState =
    companionLifecycleController?.state ??
    ({
      enabled: false,
      status: "stopped"
    } as const);
  const port = lifecycleState.status === "running" ? lifecycleState.port : undefined;
  const addresses = port ? await companionAddressViews(port) : [];
  const activeSession =
    port === undefined ? null : getCompanionAuthManager().getActivePairingSession();

  return {
    activePairing:
      activeSession && port
        ? await companionPairingStateView(activeSession, addresses)
        : null,
    addresses,
    devices: getStorage().listCompanionDevices().map(companionDeviceView),
    enabled: settings.companionEnabled,
    ...(lifecycleState.status === "error"
      ? { errorMessage: lifecycleState.errorMessage }
      : {}),
    pendingPairRequests: getCompanionAuthManager().listPendingPairRequests(),
    ...(port ? { port } : {}),
    status: lifecycleState.status
  };
}

async function companionPairingStateView(
  session: CompanionPairingSessionView,
  existingAddresses?: readonly CompanionAddressView[]
): Promise<CompanionPairingStateView> {
  const lifecycleState = getCompanionLifecycleController().state;

  if (lifecycleState.status !== "running") {
    throw new Error("Companion server is not running.");
  }

  const identity = companionServerIdentity();
  const addresses =
    existingAddresses ?? (await companionAddressViews(lifecycleState.port));

  return {
    code: session.code,
    expiresAt: session.expiresAt,
    qrPayload: {
      addresses: addresses.map((address) => address.address),
      expiresAt: session.expiresAt,
      kind: "difftray-pairing",
      protocolVersion: COMPANION_PROTOCOL_VERSION,
      secret: session.secret,
      serverId: identity.serverId,
      serverName: identity.serverName,
      serverPublicKey: identity.serverPublicKey
    }
  };
}

function companionDeviceView(
  device: ReturnType<DifftrayStorage["listCompanionDevices"]>[number]
): CompanionDeviceView {
  return {
    createdAt: device.createdAt,
    id: device.id,
    ...(device.lastSeenAt ? { lastSeenAt: device.lastSeenAt } : {}),
    name: device.name,
    platform: device.platform,
    publicKey: device.publicKey,
    ...(device.revokedAt ? { revokedAt: device.revokedAt } : {})
  };
}

async function companionAddressViews(
  port: number
): Promise<readonly CompanionAddressView[]> {
  const localAddresses = Object.values(networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .filter((entry) => entry.family === "IPv4" && !entry.internal)
    .map((entry) => companionAddressView(entry.address, port));
  const magicDnsNames = await resolveTailscaleMagicDnsNames();

  return uniqueCompanionAddresses([
    ...localAddresses,
    ...magicDnsNames.map((host) => companionAddressView(host, port, true))
  ]);
}

function companionAddressView(
  host: string,
  port: number,
  forceTailscale = false
): CompanionAddressView {
  return {
    address: `${host}:${String(port)}`,
    host,
    isTailscale: forceTailscale || isTailscaleIpv4Address(host)
  };
}

function uniqueCompanionAddresses(
  addresses: readonly CompanionAddressView[]
): readonly CompanionAddressView[] {
  const seen = new Set<string>();

  return addresses.filter((address) => {
    if (seen.has(address.address)) {
      return false;
    }

    seen.add(address.address);
    return true;
  });
}

function isTailscaleIpv4Address(address: string): boolean {
  const parts = address.split(".").map((part) => Number(part));

  return (
    parts.length === 4 &&
    parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) &&
    parts[0] === 100 &&
    parts[1] !== undefined &&
    parts[1] >= 64 &&
    parts[1] <= 127
  );
}

function resolveTailscaleMagicDnsNames(): Promise<readonly string[]> {
  return new Promise((resolve) => {
    const child = spawn("tailscale", ["status", "--json"], {
      stdio: ["ignore", "pipe", "ignore"]
    });
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill();
      resolve([]);
    }, 1_000);

    child.stdout.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    child.once("error", () => {
      clearTimeout(timer);
      resolve([]);
    });
    child.once("close", (code) => {
      clearTimeout(timer);

      if (code !== 0) {
        resolve([]);
        return;
      }

      resolve(parseTailscaleMagicDnsNames(Buffer.concat(chunks).toString("utf8")));
    });
  });
}

function parseTailscaleMagicDnsNames(rawJson: string): readonly string[] {
  try {
    const parsed = JSON.parse(rawJson) as unknown;

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "Self" in parsed &&
      typeof parsed.Self === "object" &&
      parsed.Self !== null &&
      "DNSName" in parsed.Self &&
      typeof parsed.Self.DNSName === "string"
    ) {
      return [parsed.Self.DNSName.replace(/\.$/, "")].filter((name) => name.length > 0);
    }
  } catch {
    return [];
  }

  return [];
}

function emitCompanionStateChanged(): void {
  void companionStateView()
    .then((state) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) {
          window.webContents.send("companion:stateChanged", state);
        }
      }
    })
    .catch((caughtError: unknown) => {
      console.error("Companion state emission failed", caughtError);
    });
}

function getCompanionWorkspaceChangeBroadcaster(): CompanionWorkspaceChangeBroadcaster {
  if (companionWorkspaceChangeBroadcaster) {
    return companionWorkspaceChangeBroadcaster;
  }

  companionWorkspaceChangeBroadcaster = new CompanionWorkspaceChangeBroadcaster({
    broadcast: notifyCompanionWorkspaceChanged
  });

  return companionWorkspaceChangeBroadcaster;
}

function emitProjectChange(change: ProjectWatchChangeEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send("projects:changed", change);
    }
  }

  getCompanionWorkspaceChangeBroadcaster().notify(change.projectId, "filesystem");
}

function notifyCompanionWorkspaceChanged(
  projectId: string,
  reason: "comments" | "diff_target" | "filesystem" | "review_state"
): void {
  companionLifecycleController?.broadcastWorkspaceChanged(projectId, reason);
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
      deleteStoredProject(project.id);
    }
  }

  return applyProjectTabOrder(
    getStorage().listRecentProjects(),
    getStorage().getProjectTabOrder()
  );
}

function listAvailableRecentProjectViews(): readonly RecentProjectView[] {
  const projects = listAvailableRecentProjects();

  return projects.map((project) => projectView(project));
}

async function listAvailableRecentProjectViewsWithSummaries(): Promise<
  readonly RecentProjectView[]
> {
  const projects = listAvailableRecentProjects();
  const summaries = await Promise.all(
    projects.map(async (project) => {
      try {
        return await loadProjectReviewSummaryIfAvailable(project.id);
      } catch {
        return null;
      }
    })
  );

  return projects.map((project, index) =>
    projectView(project, summaries[index] ?? undefined)
  );
}

function listBranchRefsForProject(projectId: string): Promise<readonly string[]> {
  const project = assertStoredProject(projectId);

  return listBranchRefs(project.path);
}

function listRecentCommitsForProject(
  projectId: string
): Promise<Awaited<ReturnType<typeof listRecentCommits>>> {
  const project = assertStoredProject(projectId);

  return listRecentCommits(project.path);
}

async function updateProjectDiffTarget(
  projectId: string,
  target: DiffTargetBody,
  reportProgress?: ProjectLoadProgressReporter
): Promise<ReviewWorkspaceView> {
  const project = assertStoredProject(projectId);
  const previousTarget = {
    defaultBaseRef: project.defaultBaseRef,
    defaultCommitRef: project.defaultCommitRef,
    defaultDiffTargetMode: project.defaultDiffTargetMode
  };

  if (target.mode === "branch") {
    const baseRefName = target.ref.trim();

    if (baseRefName.length === 0) {
      throw new Error("Base branch is required.");
    }

    getStorage().updateProjectDefaultDiffTarget(projectId, {
      mode: "branch",
      ref: baseRefName
    });
  } else if (target.mode === "commit") {
    const commitRef = target.ref.trim();

    if (commitRef.length === 0) {
      throw new Error("Commit is required.");
    }

    getStorage().updateProjectDefaultDiffTarget(projectId, {
      mode: "commit",
      ref: commitRef
    });
  } else {
    getStorage().updateProjectDefaultDiffTarget(projectId, { mode: "working_tree" });
  }

  try {
    return await loadProjectWorkspace(projectId, reportProgress);
  } catch (caughtError) {
    getStorage().updateProjectDefaultDiffTarget(
      projectId,
      previousTarget.defaultDiffTargetMode === "branch" && previousTarget.defaultBaseRef
        ? { mode: "branch", ref: previousTarget.defaultBaseRef }
        : previousTarget.defaultDiffTargetMode === "commit" &&
            previousTarget.defaultCommitRef
          ? { mode: "commit", ref: previousTarget.defaultCommitRef }
          : { mode: "working_tree" }
    );
    throw caughtError;
  }
}

export function createDesktopCompanionDeps(): CompanionDeps {
  const storage = getStorage();

  return {
    companionAuth: getCompanionAuthManager(),
    companionEnvelope: createCompanionEnvelopeVerifier({ storage }),
    commentsReport: async (projectId) =>
      formatProjectCommentsReport(projectId, await loadProjectWorkspace(projectId)),
    createComment: async (input) => {
      const result = await createProjectReviewComment(input);

      if (result.status === "rejected") {
        throw new Error(result.reason);
      }

      notifyDesktopRenderer(input.projectId);
      notifyCompanionWorkspaceChanged(input.projectId, "comments");

      return result.comment;
    },
    deleteComment: (id) => {
      const comment = storage.getReviewComment(id);
      const deleted = deleteProjectReviewComment(id).status === "deleted";

      if (deleted && comment) {
        notifyDesktopRenderer(comment.projectId);
        notifyCompanionWorkspaceChanged(comment.projectId, "comments");
      }

      return Promise.resolve(deleted);
    },
    listBranchRefs: listBranchRefsForProject,
    listRecentCommits: listRecentCommitsForProject,
    listRecentProjects: listAvailableRecentProjectViewsWithSummaries,
    loadFileDiff: async (projectId, pathName) => {
      const [diff, workspace] = await Promise.all([
        loadProjectFileDiffForCompanion(projectId, pathName),
        loadProjectWorkspace(projectId)
      ]);

      if (!diff) {
        throw new Error(`File diff is not available: ${pathName}`);
      }
      const workspaceFile = workspace.files.find((file) => file.path === pathName);

      if (!workspaceFile) {
        throw new Error(`File diff is not in the current workspace: ${pathName}`);
      }

      return {
        ...diff,
        diffHash: workspaceFile.diffHash
      };
    },
    loadWorkspaceView: loadProjectWorkspace,
    markReviewed: async (input) => {
      const result = await markProjectFileReviewed(input);

      if (result.status === "marked") {
        notifyDesktopRenderer(input.projectId);
        notifyCompanionWorkspaceChanged(input.projectId, "review_state");
      }

      return companionMarkResult(result);
    },
    notifyDesktopRenderer,
    serverIdentity: () =>
      getOrCreateCompanionServerIdentity({
        appVersion: app.getVersion(),
        storage
      }),
    storage,
    unmarkReviewed: async (input) => {
      const result = await unmarkProjectFileReviewed(input);

      if (result.status === "unmarked") {
        notifyDesktopRenderer(input.projectId);
        notifyCompanionWorkspaceChanged(input.projectId, "review_state");
      }

      return companionUnmarkResult(result);
    },
    updateComment: (input) => {
      const storedComment = storage.getReviewComment(input.commentId);
      const result = updateProjectReviewComment({
        body: input.body,
        id: input.commentId
      });

      if (result.status === "updated" && storedComment) {
        notifyDesktopRenderer(storedComment.projectId);
        notifyCompanionWorkspaceChanged(storedComment.projectId, "comments");
      }

      return Promise.resolve(result.status === "updated" ? result.comment : null);
    },
    updateDiffTarget: async (projectId, target) => {
      const workspace = await updateProjectDiffTarget(projectId, target);

      notifyDesktopRenderer(projectId);
      notifyCompanionWorkspaceChanged(projectId, "diff_target");

      return workspace;
    }
  };
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

  watchActiveProjectInBackground(project);
  reportProgress?.({
    message: "Preparing diff view",
    phase: "preparing_workspace"
  });

  return reviewWorkspaceView({
    comments: getStorage().listReviewComments(reviewTargetId),
    files,
    progress,
    project,
    reviewTarget,
    reviewTargetId
  });
}

async function loadProjectReviewSummaryIfAvailable(
  projectId: string
): Promise<ProjectReviewSummaryView | null> {
  const project = getStorage().getProject(projectId);

  if (!project) {
    return null;
  }

  if (!existsSync(project.path)) {
    deleteStoredProject(project.id);
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
  const diffResult =
    project.defaultDiffTargetMode === "branch" && project.defaultBaseRef
      ? await loadBranchDiffSummaries(project.path, project.defaultBaseRef, gitProgress)
      : project.defaultDiffTargetMode === "commit" && project.defaultCommitRef
        ? await loadCommitDiffSummaries(
            project.path,
            project.defaultCommitRef,
            gitProgress
          )
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
    deleteStoredProject(project.id);
    await projectWatchService?.stopProject(project.id);
    return null;
  }

  return loadProjectWorkspace(projectId, reportProgress);
}

async function markProjectFileReviewed(
  input: CompanionMarkReviewedBody & { readonly projectId: string }
): Promise<MarkReviewedResult> {
  const totalStartedAt = performance.now();
  const { displayedDiffHash, path: pathName, projectId, reviewTargetId } = input;
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

async function unmarkProjectFileReviewed(
  input: CompanionMarkReviewedBody & { readonly projectId: string }
): Promise<UnmarkReviewedResult> {
  const { displayedDiffHash, path: pathName, projectId, reviewTargetId } = input;
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

async function createProjectReviewComment(
  input: CompanionCreateCommentBody & { readonly projectId: string }
): Promise<CreateReviewCommentResult> {
  const {
    body: rawBody,
    diffHash,
    lineEnd,
    lineStart,
    path: pathName,
    projectId,
    reviewTargetId,
    side
  } = input;
  const body = rawBody.trim();
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

  if (file.diffHash !== diffHash) {
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

function updateProjectReviewComment(
  input: CompanionUpdateCommentBody & { readonly id: string }
): UpdateReviewCommentResult {
  const body = input.body.trim();

  if (body.length === 0) {
    throw new Error("Review comment body is required.");
  }

  const comment = getStorage().updateReviewComment(input.id, body);

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

function deleteProjectReviewComment(commentId: string): DeleteReviewCommentResult {
  if (!getStorage().deleteReviewComment(commentId)) {
    return {
      reason: "comment_missing",
      status: "rejected"
    };
  }

  return { status: "deleted" };
}

async function formatProjectCommentsReport(
  projectId: string,
  workspace: ReviewWorkspaceView
): Promise<string> {
  const comments = await reviewCommentReportItems(projectId, workspace.comments);

  return formatReviewCommentsReport({
    comments,
    projectName: workspace.project.name,
    targetLabel: reviewTargetLabel(workspace.reviewTarget)
  });
}

function companionMarkResult(result: MarkReviewedResult): CompanionMarkResult {
  return result.status === "marked"
    ? {
        marked: true,
        workspaceSummary: workspaceSummaryFromWorkspace(result.workspace)
      }
    : {
        stale: true,
        workspace: result.workspace
      };
}

function companionUnmarkResult(result: UnmarkReviewedResult): CompanionUnmarkResult {
  return result.status === "unmarked"
    ? {
        unmarked: true,
        workspaceSummary: workspaceSummaryFromWorkspace(result.workspace)
      }
    : {
        stale: true,
        workspace: result.workspace
      };
}

function workspaceSummaryFromWorkspace(workspace: ReviewWorkspaceView): WorkspaceSummary {
  return {
    files: workspace.files.map((file) => ({
      invalidated: file.invalidated,
      path: file.path,
      reviewed: file.reviewed
    })),
    progress: workspace.progress
  };
}

function notifyDesktopRenderer(projectId: string): void {
  const project = getStorage().getProject(projectId);

  if (!project) {
    return;
  }

  emitProjectChange({
    projectId,
    projectPath: project.path,
    reasons: ["worktree"],
    sequence: Date.now()
  });
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
  const diff = await loadProjectFileDiffForCompanion(projectId, pathName);

  return diff?.content ?? null;
}

async function loadProjectFileDiffForCompanion(
  projectId: string,
  pathName: string
): Promise<{
  readonly content: ReviewFileDiffContentView;
  readonly contentKind: FileDiffContentKind;
  readonly diffHash: string;
} | null> {
  const project = getStorage().getProject(projectId);

  if (!project) {
    throw new Error(`Project is not stored: ${projectId}`);
  }

  const reviewTarget = await loadCurrentProjectReviewTarget(project);
  const gitDiff =
    reviewTarget.kind === "branch"
      ? await loadBranchFileDiff(project.path, reviewTarget.baseRefName, pathName)
      : reviewTarget.kind === "commit"
        ? await loadCommitFileDiff(project.path, reviewTarget.commitSha, pathName)
        : await loadWorkingTreeFileDiff(project.path, pathName);

  if (!gitDiff) {
    return null;
  }

  const diff = fileDiffFromGit(gitDiff);
  const patch = patchForDiff(diff);
  const summary = summarizePatch(patch);
  const textContent = diff.content.kind === "text" ? diff.content : undefined;

  return {
    content: {
      additions: summary.additions,
      deletions: summary.deletions,
      ...(textContent?.newText !== undefined ? { newText: textContent.newText } : {}),
      ...(textContent?.oldText !== undefined ? { oldText: textContent.oldText } : {}),
      patch,
      path: diff.newPath,
      status: diff.status
    },
    contentKind: diff.content.kind,
    diffHash: createDiffHash(reviewTarget, diff)
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

function upsertOpenedProject(project: ProjectRecord): void {
  getStorage().upsertProject(project);
  getStorage().appendProjectToTabOrder(project.id);
}

function deleteStoredProject(projectId: string): void {
  getStorage().removeProjectFromTabOrder(projectId);
  getStorage().deleteProject(projectId);
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

  return installedEditorPresetViews({
    appPathByName,
    iconDataUrlForAppPath,
    platform: process.platform
  });
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
      : reviewTarget.kind === "commit"
        ? await loadCommitFileDiffSummary(project.path, reviewTarget.commitSha, pathName)
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
  const target =
    project.defaultDiffTargetMode === "branch" && project.defaultBaseRef
      ? await loadBranchReviewTarget(project.path, project.defaultBaseRef)
      : project.defaultDiffTargetMode === "commit" && project.defaultCommitRef
        ? await loadCommitReviewTarget(project.path, project.defaultCommitRef)
        : (await loadWorkingTreeReviewTarget(project.path)).reviewTarget;

  return reviewTargetFromGit(target);
}
