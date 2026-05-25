import {
  app,
  BrowserWindow,
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
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import {
  calculateProgress,
  createReviewTargetId,
  listInstalledEditorPresets,
  resolveReviewStates,
  type EditorPreset,
  type FileDiff,
  type FileReviewState,
  type ReviewMark,
  type ReviewProgress,
  type ReviewTarget
} from "@difftray/core";
import {
  findGitRepository,
  loadBranchDiffSummaries,
  loadBranchFileDiff,
  listBranchRefs,
  loadWorkingTreeDiffSummaries,
  loadWorkingTreeFileDiff,
  type DiffLoadProgress,
  type GitFileDiffSummary,
  type GitBranchReviewTarget,
  type GitLoadedFileDiff,
  type GitWorkingTreeReviewTarget
} from "@difftray/git";
import {
  type AppSettingsRecord,
  type EditorLaunchConfig,
  openStorage,
  type DifftrayStorage,
  type ProjectSettingsRecord,
  type ProjectRecord,
  type ReviewTargetRecord,
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
  resolveRendererDevUrl,
  resolveSafeProjectFilePath,
  trustedEditorLaunchConfig
} from "./security.js";

const rendererDevUrlFromEnv = process.env.DIFFTRAY_RENDERER_URL;
const bootProjectPath = process.env.DIFFTRAY_BOOT_PROJECT;
const projectWatchersEnabled = process.env.DIFFTRAY_ENABLE_PROJECT_WATCHERS === "1";
const userDataPath = process.env.DIFFTRAY_USER_DATA_DIR;

let mainWindow: BrowserWindow | undefined;
let projectWatchService: ProjectWatchService | undefined;
let storage: DifftrayStorage | undefined;
let isQuitting = false;

type RecentProjectView = {
  readonly defaultBaseRef?: string;
  readonly id: string;
  readonly lastOpenedAt?: string;
  readonly name: string;
  readonly path: string;
  readonly reviewSummary?: ProjectReviewSummaryView;
};

type ProjectReviewSummaryView = {
  readonly attentionCount: number;
  readonly progress: ReviewProgressView;
};

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
  readonly status: FileDiff["status"];
  readonly visible: boolean;
};

type ReviewWorkspaceView = {
  readonly files: readonly ReviewFileView[];
  readonly project: RecentProjectView;
  readonly progress: ReviewProgressView;
  readonly reviewTarget: {
    readonly baseRefName?: string;
    readonly headRefName?: string;
    readonly headSha: string;
    readonly id: string;
    readonly kind: ReviewTarget["kind"];
  };
};

type FileReviewStateWithSummary = {
  readonly state: FileReviewState;
  readonly summary: GitFileDiffSummary;
};

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

type ProjectSettingsView = {
  readonly fileListCollapsed: boolean;
  readonly fileListWidth: number;
  readonly projectId: string;
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

const createMainWindow = async (): Promise<void> => {
  const window = new BrowserWindow({
    backgroundColor: "#ffffff",
    height: 820,
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
    window.show();
  };

  window.once("ready-to-show", showWindow);
  window.webContents.once("did-finish-load", showWindow);
  setTimeout(showWindow, 1_500);

  if (bootProjectPath) {
    await storeRepositoryAtPath(bootProjectPath);
  }

  const rendererDevUrl = resolveRendererDevUrl(rendererDevUrlFromEnv, app.isPackaged);

  if (rendererDevUrl) {
    await window.loadURL(rendererDevUrl);
  } else {
    await window.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  showWindow();
  mainWindow = window;
};

ipcMain.handle("app:version", () => app.getVersion());
ipcMain.handle(
  "editors:listInstalled",
  async (): Promise<readonly EditorPresetView[]> => listInstalledEditorPresetViews()
);
ipcMain.handle(
  "settings:getApp",
  (): AppSettingsView => appSettingsView(getStorage().getAppSettings())
);
ipcMain.handle(
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
      themeMode
    };

    getStorage().upsertAppSettings(settings);

    return appSettingsView(getStorage().getAppSettings());
  }
);
ipcMain.handle("projects:listRecent", () => listAvailableRecentProjectViews());
ipcMain.handle(
  "projects:getReviewSummary",
  async (
    _event: IpcMainInvokeEvent,
    input: unknown
  ): Promise<ProjectReviewSummaryView | null> => {
    const projectId = readStringProperty(input, "projectId");

    return loadProjectReviewSummaryIfAvailable(projectId);
  }
);
ipcMain.handle(
  "projects:listBranchRefs",
  async (_event: IpcMainInvokeEvent, input: unknown): Promise<readonly string[]> => {
    const projectId = readStringProperty(input, "projectId");
    const project = assertStoredProject(projectId);

    return listBranchRefs(project.path);
  }
);
ipcMain.handle(
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
ipcMain.handle("projects:open", async (event: IpcMainInvokeEvent) =>
  openProjectFromDialog(event.sender)
);
ipcMain.handle(
  "projects:load",
  async (
    event: IpcMainInvokeEvent,
    input: unknown
  ): Promise<ReviewWorkspaceView | null> => {
    const projectId = readStringProperty(input, "projectId");

    return loadProjectWorkspaceIfAvailable(
      projectId,
      projectLoadProgressReporter(event.sender, projectId)
    );
  }
);
ipcMain.handle(
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
ipcMain.handle(
  "settings:getProject",
  (_event: IpcMainInvokeEvent, input: unknown): ProjectSettingsView => {
    const projectId = readStringProperty(input, "projectId");

    assertStoredProject(projectId);

    return settingsView(getStorage().getProjectSettings(projectId));
  }
);
ipcMain.handle(
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
ipcMain.handle(
  "reviews:markFileReviewed",
  async (_event: IpcMainInvokeEvent, input: unknown): Promise<MarkReviewedResult> => {
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

    const result = getStorage().verifyAndMarkReviewed({
      currentDiffHash: file.diffHash,
      displayedDiffHash,
      path: file.path,
      ...(file.previousPath ? { previousPath: file.previousPath } : {}),
      projectId,
      reviewTargetId
    });

    if (!result.marked) {
      return {
        reason: result.reason,
        status: "rejected",
        workspace
      };
    }

    return {
      status: "marked",
      workspace: await loadProjectWorkspace(projectId)
    };
  }
);
ipcMain.handle(
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

    return {
      status: "unmarked",
      workspace: await loadProjectWorkspace(projectId)
    };
  }
);
ipcMain.handle(
  "files:openInEditor",
  async (_event: IpcMainInvokeEvent, input: unknown): Promise<OpenFileInEditorResult> => {
    const projectId = readStringProperty(input, "projectId");
    const pathName = readStringProperty(input, "path");

    return openFileInEditor(projectId, pathName);
  }
);
ipcMain.handle(
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
    void createMainWindow();
  }
});

void app.whenReady().then(createMainWindow);

export { mainWindow };

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

function projectReviewSummaryView(
  files: readonly FileReviewStateWithSummary[],
  progress: ReviewProgress
): ProjectReviewSummaryView {
  return {
    attentionCount: files.filter((file) => file.state.visible && file.state.invalidated)
      .length,
    progress
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

function settingsView(settings: ProjectSettingsRecord): ProjectSettingsView {
  return {
    fileListCollapsed: settings.fileListCollapsed,
    fileListWidth: settings.fileListWidth,
    projectId: settings.projectId
  };
}

function appSettingsView(settings: AppSettingsRecord): AppSettingsView {
  const editorLaunchConfig = trustedEditorLaunchConfig(settings.editorLaunchConfig);

  return {
    autoCollapseHunksOver: settings.autoCollapseHunksOver,
    defaultDiffMode: settings.defaultDiffMode,
    editorArgs: editorLaunchConfig?.args.join(" ") ?? "",
    editorArgList: editorLaunchConfig?.args ?? [],
    editorCommand: editorLaunchConfig?.command ?? "",
    editorMode: editorLaunchConfig ? "preset" : "system",
    hideWhitespaceOnlyChanges: settings.hideWhitespaceOnlyChanges,
    notifyOnDrift: settings.notifyOnDrift,
    reviewResetTrigger: settings.reviewResetTrigger,
    showGeneratedFiles: settings.showGeneratedFiles,
    themeMode: settings.themeMode
  };
}

function editorConfigFromInput(
  command: string | undefined,
  args: readonly string[] | string | undefined
): EditorLaunchConfig {
  const trimmedCommand = command?.trim();

  if (!trimmedCommand) {
    throw new Error("Editor preset command is required.");
  }

  const normalizedArgs =
    typeof args === "string" || args === undefined
      ? splitEditorArgs(args ?? "")
      : normalizeEditorArgs(args);

  const launchConfig = {
    args: normalizedArgs,
    command: trimmedCommand
  };
  const trustedConfig = trustedEditorLaunchConfig(launchConfig);

  if (!trustedConfig) {
    throw new Error("Only built-in editor presets are supported.");
  }

  return trustedConfig;
}

function splitEditorArgs(value: string): readonly string[] {
  return normalizeEditorArgs(
    value
      .trim()
      .split(/\s+/)
      .filter((arg) => arg.length > 0)
  );
}

function normalizeEditorArgs(args: readonly string[]): readonly string[] {
  return args.map((arg) => arg.trim()).filter((arg) => arg.length > 0);
}

async function listInstalledEditorPresetViews(): Promise<readonly EditorPresetView[]> {
  const appPathByName = discoverMacOSApplicationPathsByName();
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

function discoverMacOSApplicationPathsByName(): Map<string, string> {
  if (process.platform !== "darwin") {
    return new Map();
  }

  const applicationDirectories = [
    "/Applications",
    "/System/Applications",
    path.join(app.getPath("home"), "Applications")
  ];
  const appPathsByName = new Map<string, string>();

  for (const directory of applicationDirectories) {
    for (const candidate of macOSApplicationCandidates(directory)) {
      if (!appPathsByName.has(candidate.appName)) {
        appPathsByName.set(candidate.appName, candidate.appPath);
      }
    }
  }

  return appPathsByName;
}

function macOSApplicationCandidates(
  directory: string
): readonly { readonly appName: string; readonly appPath: string }[] {
  if (!existsSync(directory)) {
    return [];
  }

  try {
    return readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.name.endsWith(".app"))
      .map((entry) => ({
        appName: entry.name,
        appPath: path.join(directory, entry.name)
      }));
  } catch {
    return [];
  }
}

function appPathForPreset(
  preset: EditorPreset,
  appPathByName: ReadonlyMap<string, string>
): string | undefined {
  for (const appName of preset.macOS.appNames) {
    const appPath = appPathByName.get(appName);

    if (appPath) {
      return appPath;
    }
  }

  return undefined;
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

function macOSBundleIconPath(appPath: string): string | undefined {
  const iconFile = macOSBundleIconFile(appPath);

  if (!iconFile) {
    return undefined;
  }

  const normalizedIconFile = iconFile.endsWith(".icns") ? iconFile : `${iconFile}.icns`;
  const iconPath = path.join(appPath, "Contents", "Resources", normalizedIconFile);

  return existsSync(iconPath) ? iconPath : undefined;
}

function macOSBundleIconFile(appPath: string): string | undefined {
  try {
    const infoPlist = readFileSync(path.join(appPath, "Contents", "Info.plist"), "utf8");
    const match =
      /<key>CFBundleIconFile<\/key>\s*<string>(?<iconFile>[^<]+)<\/string>/u.exec(
        infoPlist
      );

    return match?.groups?.iconFile ? decodeXmlText(match.groups.iconFile) : undefined;
  } catch {
    return undefined;
  }
}

function decodeXmlText(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function projectView(
  project: StoredProjectRecord,
  reviewSummary?: ProjectReviewSummaryView
): RecentProjectView {
  return {
    ...(project.defaultBaseRef ? { defaultBaseRef: project.defaultBaseRef } : {}),
    id: project.id,
    ...(project.lastOpenedAt ? { lastOpenedAt: project.lastOpenedAt } : {}),
    name: project.name,
    path: project.path,
    ...(reviewSummary ? { reviewSummary } : {})
  };
}

function reviewTargetFromGit(
  target: GitBranchReviewTarget | GitWorkingTreeReviewTarget
): ReviewTarget {
  switch (target.kind) {
    case "branch":
      return {
        baseRefName: target.baseRefName,
        baseSha: target.baseSha,
        ...(target.headRefName ? { headRefName: target.headRefName } : {}),
        headSha: target.headSha,
        kind: "branch",
        mergeBaseSha: target.mergeBaseSha,
        projectId: target.projectId
      };
    case "working_tree":
      return {
        ...(target.headRefName ? { headRefName: target.headRefName } : {}),
        headSha: target.headSha,
        kind: "working_tree",
        projectId: target.projectId
      };
  }
}

function reviewTargetRecord(id: string, target: ReviewTarget): ReviewTargetRecord {
  switch (target.kind) {
    case "working_tree":
      return {
        headKind: "working_tree",
        ...(target.headRefName ? { headRefName: target.headRefName } : {}),
        headRefSha: target.headSha,
        id,
        mode: "working_tree",
        projectId: target.projectId
      };
    case "branch":
      return {
        baseRefName: target.baseRefName,
        baseRefSha: target.baseSha,
        headKind: "ref",
        ...(target.headRefName ? { headRefName: target.headRefName } : {}),
        headRefSha: target.headSha,
        id,
        mergeBaseSha: target.mergeBaseSha,
        mode: "branch",
        projectId: target.projectId
      };
  }
}

function reviewFileView(
  file: FileReviewStateWithSummary,
  detailedDiff?: FileDiff
): ReviewFileView {
  const patch = detailedDiff ? patchForDiff(detailedDiff) : undefined;
  const patchSummary = patch ? summarizePatch(patch) : undefined;
  const textContent =
    detailedDiff?.content.kind === "text" ? detailedDiff.content : undefined;

  return {
    additions: patchSummary?.additions ?? file.summary.additions,
    deletions: patchSummary?.deletions ?? file.summary.deletions,
    diffHash: file.state.diffHash,
    diffLoaded: detailedDiff !== undefined,
    generated: file.state.generated,
    invalidated: file.state.invalidated,
    ...(textContent?.newText !== undefined ? { newText: textContent.newText } : {}),
    ...(textContent?.oldText !== undefined ? { oldText: textContent.oldText } : {}),
    path: file.state.path,
    ...(patch !== undefined ? { patch } : {}),
    ...(file.state.diff.oldPath ? { previousPath: file.state.diff.oldPath } : {}),
    reviewable: file.state.reviewable,
    reviewed: file.state.reviewed,
    status: file.state.diff.status,
    visible: file.state.visible
  };
}

function fileDiffFromGit(file: GitLoadedFileDiff | GitFileDiffSummary): FileDiff {
  return {
    content: file.content,
    ...(file.newMode ? { newMode: file.newMode } : {}),
    newPath: file.newPath,
    ...(file.oldMode ? { oldMode: file.oldMode } : {}),
    ...(file.oldPath ? { oldPath: file.oldPath } : {}),
    status: file.status
  };
}

function patchForDiff(diff: FileDiff): string {
  switch (diff.content.kind) {
    case "text":
      return diff.content.patch;
    case "binary":
      return [
        `diff --git a/${diff.oldPath ?? diff.newPath} b/${diff.newPath}`,
        `Binary file changed (${String(diff.content.byteSize)} bytes)`,
        `sha256 ${diff.content.digest}`
      ].join("\n");
    case "mode_only":
      return `Mode changed: ${diff.oldMode ?? "unknown"} -> ${diff.newMode ?? "unknown"}`;
    case "submodule":
      return `Submodule changed: ${diff.content.oldCommit ?? "unknown"} -> ${diff.content.newCommit ?? "unknown"}`;
    case "symlink":
      return `Symlink changed: ${diff.content.oldTarget ?? "unknown"} -> ${diff.content.newTarget ?? "unknown"}`;
  }
}

function summarizePatch(patch: string): { additions: number; deletions: number } {
  const lines = patch.split("\n");

  return lines.reduce(
    (summary, line) => {
      if (line.startsWith("+++") || line.startsWith("---")) {
        return summary;
      }

      if (line.startsWith("+")) {
        return { ...summary, additions: summary.additions + 1 };
      }

      if (line.startsWith("-")) {
        return { ...summary, deletions: summary.deletions + 1 };
      }

      return summary;
    },
    { additions: 0, deletions: 0 }
  );
}

function expandEditorArg(
  arg: string,
  input: {
    readonly column: number;
    readonly filePath: string;
    readonly line: number;
    readonly projectPath: string;
  }
): string {
  return arg
    .replaceAll("{path}", input.filePath)
    .replaceAll("{line}", String(input.line))
    .replaceAll("{column}", String(input.column))
    .replaceAll("{project}", input.projectPath);
}

function readStringProperty(input: unknown, property: string): string {
  const value = readUnknownProperty(input, property);

  if (typeof value !== "string") {
    throw new Error(`Invalid IPC payload: missing ${property}`);
  }

  return value;
}

function readOptionalStringProperty(
  input: unknown,
  property: string
): string | undefined {
  const value = readUnknownProperty(input, property);

  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`Invalid IPC payload: ${property} must be a string`);
  }

  return value;
}

function readOptionalStringArrayProperty(
  input: unknown,
  property: string
): readonly string[] | undefined {
  const value = readUnknownProperty(input, property);

  if (value === undefined || value === null) {
    return undefined;
  }

  if (!isStringArray(value)) {
    throw new Error(`Invalid IPC payload: ${property} must be a string array`);
  }

  return value;
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function readBooleanProperty(input: unknown, property: string): boolean {
  const value = readUnknownProperty(input, property);

  if (typeof value !== "boolean") {
    throw new Error(`Invalid IPC payload: missing ${property}`);
  }

  return value;
}

function readNumberProperty(input: unknown, property: string): number {
  const value = readUnknownProperty(input, property);

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid IPC payload: missing ${property}`);
  }

  return value;
}

function readEnumProperty<const T extends string>(
  input: unknown,
  property: string,
  values: readonly T[]
): T {
  const value = readStringProperty(input, property);

  if (!values.includes(value as T)) {
    throw new Error(`Invalid IPC payload: unsupported ${property}`);
  }

  return value as T;
}

function readUnknownProperty(input: unknown, property: string): unknown {
  if (
    typeof input !== "object" ||
    input === null ||
    !Object.prototype.hasOwnProperty.call(input, property)
  ) {
    return undefined;
  }

  return (input as Record<string, unknown>)[property];
}
