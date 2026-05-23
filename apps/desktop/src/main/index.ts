import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  type IpcMainInvokeEvent,
  type OpenDialogOptions
} from "electron";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

import {
  calculateProgress,
  createReviewTargetId,
  resolveReviewStates,
  type FileDiff,
  type ReviewMark,
  type ReviewTarget
} from "@difftray/core";
import {
  findGitRepository,
  loadWorkingTreeDiffs,
  type GitLoadedFileDiff,
  type GitWorkingTreeReviewTarget
} from "@difftray/git";
import {
  type EditorLaunchConfig,
  openStorage,
  type DifftrayStorage,
  type ProjectSettingsRecord,
  type ProjectRecord,
  type ReviewTargetRecord,
  type StoredProjectRecord
} from "@difftray/storage";

const rendererDevUrl = process.env.DIFFTRAY_RENDERER_URL;
const bootProjectPath = process.env.DIFFTRAY_BOOT_PROJECT;
const userDataPath = process.env.DIFFTRAY_USER_DATA_DIR;

let mainWindow: BrowserWindow | undefined;
let storage: DifftrayStorage | undefined;

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
  readonly path: string;
  readonly patch: string;
  readonly previousPath?: string;
  readonly reviewable: boolean;
  readonly reviewed: boolean;
  readonly status: FileDiff["status"];
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
    readonly kind: ReviewTarget["kind"];
  };
};

type ProjectSettingsView = {
  readonly editorArgs: string;
  readonly editorCommand: string;
  readonly editorMode: "custom" | "system";
  readonly projectId: string;
  readonly showGeneratedFiles: boolean;
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
    backgroundColor: "#151515",
    height: 820,
    minHeight: 600,
    minWidth: 900,
    show: false,
    title: "Difftray",
    width: 1220,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "../preload/index.cjs"),
      sandbox: true
    }
  });

  window.once("ready-to-show", () => {
    window.show();
  });

  if (bootProjectPath) {
    await storeRepositoryAtPath(bootProjectPath);
  }

  if (rendererDevUrl) {
    await window.loadURL(rendererDevUrl);
  } else {
    await window.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  mainWindow = window;
};

ipcMain.handle("app:version", () => app.getVersion());
ipcMain.handle("projects:listRecent", () =>
  getStorage()
    .listRecentProjects()
    .map((project) => projectView(project))
);
ipcMain.handle("projects:open", async () => openProjectFromDialog());
ipcMain.handle("projects:load", async (_event: IpcMainInvokeEvent, input: unknown) => {
  const projectId = readStringProperty(input, "projectId");

  return loadProjectWorkspace(projectId);
});
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
    const showGeneratedFiles = readBooleanProperty(input, "showGeneratedFiles");
    const editorMode = readEnumProperty(input, "editorMode", ["custom", "system"]);
    const editorCommand = readOptionalStringProperty(input, "editorCommand");
    const editorArgs = readOptionalStringProperty(input, "editorArgs");

    assertStoredProject(projectId);

    const settings: ProjectSettingsRecord = {
      ...(editorMode === "custom"
        ? { editorLaunchConfig: editorConfigFromInput(editorCommand, editorArgs) }
        : {}),
      projectId,
      showGeneratedFiles
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

app.on("before-quit", () => {
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

async function openProjectFromDialog(): Promise<ReviewWorkspaceView | null> {
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

  return loadProjectWorkspace(project.id);
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

async function loadProjectWorkspace(projectId: string): Promise<ReviewWorkspaceView> {
  const project = getStorage().getProject(projectId);

  if (!project) {
    throw new Error(`Project is not stored: ${projectId}`);
  }

  upsertOpenedProject({
    id: project.id,
    lastOpenedAt: new Date().toISOString(),
    name: project.name,
    path: project.path
  });

  const diffResult = await loadWorkingTreeDiffs(project.path);
  const reviewTarget = reviewTargetFromGit(diffResult.reviewTarget);
  const reviewTargetId = createReviewTargetId(reviewTarget);
  const settings = getStorage().getProjectSettings(project.id);

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
  const progress = calculateProgress(states);

  return {
    files: states.map((state) => {
      const patch = patchForDiff(state.diff);
      const summary = summarizePatch(patch);

      return {
        additions: summary.additions,
        deletions: summary.deletions,
        diffHash: state.diffHash,
        generated: state.generated,
        path: state.path,
        patch,
        ...(state.diff.oldPath ? { previousPath: state.diff.oldPath } : {}),
        reviewable: state.reviewable,
        reviewed: state.reviewed,
        status: state.diff.status,
        visible: state.visible
      };
    }),
    progress,
    project: projectView(project),
    reviewTarget: {
      ...(reviewTarget.headRefName ? { headRefName: reviewTarget.headRefName } : {}),
      headSha: reviewTarget.headSha,
      id: reviewTargetId,
      kind: reviewTarget.kind
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

  const absoluteFilePath = path.resolve(project.path, file.path);

  if (!isProjectContainedPath(project.path, absoluteFilePath)) {
    return {
      reason: "file_missing",
      status: "rejected"
    };
  }

  const settings = getStorage().getProjectSettings(projectId);

  if (!settings.editorLaunchConfig) {
    const launchError = await shell.openPath(absoluteFilePath);

    return launchError.length === 0
      ? { status: "opened" }
      : { reason: "launch_failed", status: "rejected" };
  }

  const child = spawn(
    settings.editorLaunchConfig.command,
    settings.editorLaunchConfig.args.map((arg) =>
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
    editorArgs: settings.editorLaunchConfig?.args.join(" ") ?? "",
    editorCommand: settings.editorLaunchConfig?.command ?? "",
    editorMode: settings.editorLaunchConfig ? "custom" : "system",
    projectId: settings.projectId,
    showGeneratedFiles: settings.showGeneratedFiles
  };
}

function editorConfigFromInput(
  command: string | undefined,
  args: string | undefined
): EditorLaunchConfig {
  const trimmedCommand = command?.trim();

  if (!trimmedCommand) {
    throw new Error("Custom editor command is required.");
  }

  return {
    args: splitEditorArgs(args ?? ""),
    command: trimmedCommand
  };
}

function splitEditorArgs(value: string): readonly string[] {
  return value
    .trim()
    .split(/\s+/)
    .filter((arg) => arg.length > 0);
}

function projectView(project: StoredProjectRecord): RecentProjectView {
  return {
    id: project.id,
    ...(project.lastOpenedAt ? { lastOpenedAt: project.lastOpenedAt } : {}),
    name: project.name,
    path: project.path
  };
}

function reviewTargetFromGit(target: GitWorkingTreeReviewTarget): ReviewTarget {
  return {
    ...(target.headRefName ? { headRefName: target.headRefName } : {}),
    headSha: target.headSha,
    kind: "working_tree",
    projectId: target.projectId
  };
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

function fileDiffFromGit(file: GitLoadedFileDiff): FileDiff {
  return {
    content: file.content,
    newPath: file.newPath,
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

function isProjectContainedPath(projectPath: string, filePath: string): boolean {
  const relativePath = path.relative(projectPath, filePath);

  return (
    relativePath.length === 0 ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
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

function readBooleanProperty(input: unknown, property: string): boolean {
  const value = readUnknownProperty(input, property);

  if (typeof value !== "boolean") {
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
