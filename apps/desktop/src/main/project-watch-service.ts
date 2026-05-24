import path from "node:path";

import { getWorktreeInfo } from "@difftray/git";
import { watch as chokidarWatch } from "chokidar";

export type ProjectWatchReason =
  | "deleted"
  | "git_metadata"
  | "watcher_error"
  | "worktree";

export type ProjectWatchChangeEvent = {
  readonly errorMessage?: string;
  readonly projectId: string;
  readonly projectPath: string;
  readonly reasons: readonly ProjectWatchReason[];
  readonly sequence: number;
};

export type WatchedProject = {
  readonly id: string;
  readonly path: string;
};

export type ProjectWatchPaths = {
  readonly gitMetadataContainerPaths: readonly string[];
  readonly gitMetadataPaths: readonly string[];
  readonly worktreeRoot: string;
};

export type ProjectRawWatchEvent =
  | {
      readonly kind: "add" | "addDir" | "change" | "unlink" | "unlinkDir";
      readonly path: string;
    }
  | {
      readonly error: unknown;
      readonly kind: "error";
    };

export type ProjectWatcher = {
  readonly close: () => Promise<void>;
};

export type ProjectWatcherInput = {
  readonly ignored: ProjectWatchIgnoreMatcher;
  readonly onEvent: (event: ProjectRawWatchEvent) => void;
  readonly projectId: string;
  readonly projectPath: string;
  readonly watchPaths: readonly string[];
};

export type ProjectWatcherFactory = (
  input: ProjectWatcherInput
) => Promise<ProjectWatcher>;

export type ProjectWatchIgnoreMatcher = (candidatePath: string) => boolean;

export type ProjectWatchServiceOptions = {
  readonly createWatcher: ProjectWatcherFactory;
  readonly debounceMs?: number;
  readonly emitProjectChange: (change: ProjectWatchChangeEvent) => void;
  readonly maxWaitMs?: number;
  readonly resolveWatchPaths: (project: WatchedProject) => Promise<ProjectWatchPaths>;
};

type ProjectWatchState = {
  debounceTimer: Timer | undefined;
  readonly ignored: ProjectWatchIgnoreMatcher;
  maxWaitTimer: Timer | undefined;
  pendingErrorMessage: string | undefined;
  readonly pendingReasons: Set<ProjectWatchReason>;
  readonly project: WatchedProject;
  readonly watcher: ProjectWatcher;
  readonly watchPaths: ProjectWatchPaths;
};

type Timer = ReturnType<typeof setTimeout>;

const defaultDebounceMs = 250;
const defaultMaxWaitMs = 1_000;
const maxErrorMessageLength = 240;

const projectWatchReasonOrder = [
  "worktree",
  "git_metadata",
  "deleted",
  "watcher_error"
] as const satisfies readonly ProjectWatchReason[];

const noisyPathSegments = new Set([
  ".cache",
  ".git",
  ".gradle",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out"
]);

const gitMarkerFiles = [
  "AUTO_MERGE",
  "BISECT_LOG",
  "CHERRY_PICK_HEAD",
  "MERGE_HEAD",
  "MERGE_MODE",
  "MERGE_MSG",
  "ORIG_HEAD",
  "REBASE_HEAD",
  "REVERT_HEAD",
  "SQUASH_MSG"
] as const;

const gitMarkerDirectories = ["rebase-apply", "rebase-merge", "sequencer"] as const;

export class ProjectWatchService {
  private readonly createWatcher: ProjectWatcherFactory;
  private isClosed = false;
  private readonly debounceMs: number;
  private readonly emitProjectChange: (change: ProjectWatchChangeEvent) => void;
  private readonly maxWaitMs: number;
  private readonly projects = new Map<string, ProjectWatchState>();
  private readonly resolveWatchPaths: (
    project: WatchedProject
  ) => Promise<ProjectWatchPaths>;
  private readonly sequences = new Map<string, number>();

  constructor(options: ProjectWatchServiceOptions) {
    this.createWatcher = options.createWatcher;
    this.debounceMs = options.debounceMs ?? defaultDebounceMs;
    this.emitProjectChange = options.emitProjectChange;
    this.maxWaitMs = options.maxWaitMs ?? defaultMaxWaitMs;
    this.resolveWatchPaths = options.resolveWatchPaths;
  }

  async watchProject(project: WatchedProject): Promise<void> {
    if (this.isClosed) {
      return;
    }

    const normalizedProject = {
      id: project.id,
      path: path.resolve(project.path)
    };
    const existing = this.projects.get(normalizedProject.id);

    if (existing?.project.path === normalizedProject.path) {
      return;
    }

    await this.stopProject(normalizedProject.id);

    let watchPaths: ProjectWatchPaths;

    try {
      watchPaths = normalizeProjectWatchPaths(
        await this.resolveWatchPaths(normalizedProject)
      );
    } catch (caughtError) {
      this.emitWatcherStartupError(normalizedProject, caughtError);
      return;
    }

    const ignored = createProjectWatchIgnoreMatcher({
      gitMetadataContainerPaths: watchPaths.gitMetadataContainerPaths,
      gitMetadataPaths: watchPaths.gitMetadataPaths,
      projectPath: normalizedProject.path
    });
    const watchPathList = uniquePaths([
      watchPaths.worktreeRoot,
      ...watchPaths.gitMetadataContainerPaths,
      ...watchPaths.gitMetadataPaths
    ]);

    try {
      const watcher = await this.createWatcher({
        ignored,
        onEvent: (event) => {
          this.handleRawEvent(normalizedProject.id, event);
        },
        projectId: normalizedProject.id,
        projectPath: normalizedProject.path,
        watchPaths: watchPathList
      });

      this.projects.set(normalizedProject.id, {
        debounceTimer: undefined,
        ignored,
        maxWaitTimer: undefined,
        pendingErrorMessage: undefined,
        pendingReasons: new Set(),
        project: normalizedProject,
        watcher,
        watchPaths
      });
    } catch (caughtError) {
      this.emitWatcherStartupError(normalizedProject, caughtError);
    }
  }

  async syncProjects(projects: readonly WatchedProject[]): Promise<void> {
    const nextProjectIds = new Set(projects.map((project) => project.id));

    await Promise.all(
      [...this.projects.keys()]
        .filter((projectId) => !nextProjectIds.has(projectId))
        .map(async (projectId) => this.stopProject(projectId))
    );

    for (const project of projects) {
      await this.watchProject(project);
    }
  }

  async stopProject(projectId: string): Promise<void> {
    const state = this.projects.get(projectId);

    if (!state) {
      return;
    }

    this.projects.delete(projectId);
    this.clearStateTimers(state);
    await state.watcher.close();
  }

  async close(): Promise<void> {
    this.isClosed = true;

    await Promise.all(
      [...this.projects.keys()].map((projectId) => this.stopProject(projectId))
    );
  }

  private handleRawEvent(projectId: string, event: ProjectRawWatchEvent): void {
    const state = this.projects.get(projectId);

    if (!state) {
      return;
    }

    if (event.kind === "error") {
      this.queueProjectChange(state, ["watcher_error"], boundedErrorMessage(event.error));
      return;
    }

    if (state.ignored(event.path)) {
      return;
    }

    this.queueProjectChange(state, reasonsForPathEvent(state, event));
  }

  private queueProjectChange(
    state: ProjectWatchState,
    reasons: readonly ProjectWatchReason[],
    errorMessage?: string
  ): void {
    for (const reason of reasons) {
      state.pendingReasons.add(reason);
    }

    if (errorMessage) {
      state.pendingErrorMessage = errorMessage;
    }

    state.maxWaitTimer ??= setTimeout(() => {
      this.flushProjectChange(state.project.id);
    }, this.maxWaitMs);

    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer);
    }

    state.debounceTimer = setTimeout(() => {
      this.flushProjectChange(state.project.id);
    }, this.debounceMs);
  }

  private flushProjectChange(projectId: string): void {
    const state = this.projects.get(projectId);

    if (!state || state.pendingReasons.size === 0) {
      return;
    }

    const reasons = projectWatchReasonOrder.filter((reason) =>
      state.pendingReasons.has(reason)
    );
    const errorMessage = state.pendingErrorMessage;

    state.pendingReasons.clear();
    state.pendingErrorMessage = undefined;
    this.clearStateTimers(state);

    this.emitProjectChange({
      ...(errorMessage ? { errorMessage } : {}),
      projectId: state.project.id,
      projectPath: state.project.path,
      reasons,
      sequence: this.nextSequence(state.project.id)
    });
  }

  private emitWatcherStartupError(project: WatchedProject, error: unknown): void {
    this.emitProjectChange({
      errorMessage: boundedErrorMessage(error),
      projectId: project.id,
      projectPath: project.path,
      reasons: ["watcher_error"],
      sequence: this.nextSequence(project.id)
    });
  }

  private nextSequence(projectId: string): number {
    const sequence = (this.sequences.get(projectId) ?? 0) + 1;

    this.sequences.set(projectId, sequence);
    return sequence;
  }

  private clearStateTimers(state: ProjectWatchState): void {
    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer);
      state.debounceTimer = undefined;
    }

    if (state.maxWaitTimer) {
      clearTimeout(state.maxWaitTimer);
      state.maxWaitTimer = undefined;
    }
  }
}

export function createProjectWatchIgnoreMatcher(input: {
  readonly gitMetadataContainerPaths: readonly string[];
  readonly gitMetadataPaths: readonly string[];
  readonly projectPath: string;
}): ProjectWatchIgnoreMatcher {
  const projectPath = path.resolve(input.projectPath);
  const gitMetadataPaths = input.gitMetadataPaths.map((metadataPath) =>
    path.resolve(metadataPath)
  );
  const gitMetadataContainerPaths = input.gitMetadataContainerPaths.map((metadataPath) =>
    path.resolve(metadataPath)
  );

  return (candidatePath) => {
    const normalizedCandidatePath = normalizeCandidatePath(candidatePath, projectPath);

    if (
      gitMetadataPaths.some((metadataPath) =>
        isSameOrInside(metadataPath, normalizedCandidatePath)
      )
    ) {
      return false;
    }

    if (
      gitMetadataContainerPaths.some((metadataPath) =>
        isSamePath(metadataPath, normalizedCandidatePath)
      )
    ) {
      return false;
    }

    return pathSegments(normalizedCandidatePath).some((segment) =>
      noisyPathSegments.has(segment)
    );
  };
}

export async function resolveGitProjectWatchPaths(
  projectPath: string
): Promise<ProjectWatchPaths> {
  const worktreeInfo = await getWorktreeInfo(projectPath);
  const gitDir = path.resolve(worktreeInfo.gitDir);
  const commonGitDir = path.resolve(worktreeInfo.commonGitDir);
  const worktreeRoot = path.resolve(worktreeInfo.root);

  return normalizeProjectWatchPaths({
    gitMetadataContainerPaths: [gitDir, commonGitDir],
    gitMetadataPaths: [
      path.join(gitDir, "HEAD"),
      path.join(gitDir, "index"),
      ...gitMarkerFiles.map((markerFile) => path.join(gitDir, markerFile)),
      ...gitMarkerDirectories.map((markerDirectory) =>
        path.join(gitDir, markerDirectory)
      ),
      path.join(commonGitDir, "refs"),
      path.join(commonGitDir, "packed-refs")
    ],
    worktreeRoot
  });
}

export function createChokidarProjectWatcherFactory(): ProjectWatcherFactory {
  return (input) => {
    const watcher = chokidarWatch([...input.watchPaths], {
      atomic: true,
      awaitWriteFinish: false,
      followSymlinks: false,
      ignoreInitial: true,
      ignorePermissionErrors: true,
      ignored: (candidatePath: string) => input.ignored(candidatePath),
      persistent: true,
      usePolling: false
    });

    watcher.on("add", (filePath) => {
      input.onEvent({ kind: "add", path: filePath });
    });
    watcher.on("addDir", (directoryPath) => {
      input.onEvent({ kind: "addDir", path: directoryPath });
    });
    watcher.on("change", (filePath) => {
      input.onEvent({ kind: "change", path: filePath });
    });
    watcher.on("unlink", (filePath) => {
      input.onEvent({ kind: "unlink", path: filePath });
    });
    watcher.on("unlinkDir", (directoryPath) => {
      input.onEvent({ kind: "unlinkDir", path: directoryPath });
    });
    watcher.on("error", (error) => {
      input.onEvent({ error, kind: "error" });
    });

    return Promise.resolve({
      close: async () => {
        await watcher.close();
      }
    });
  };
}

function reasonsForPathEvent(
  state: ProjectWatchState,
  event: Extract<ProjectRawWatchEvent, { readonly path: string }>
): readonly ProjectWatchReason[] {
  const candidatePath = normalizeCandidatePath(event.path, state.project.path);
  const reasons = new Set<ProjectWatchReason>();
  const gitMetadataPaths = [
    ...state.watchPaths.gitMetadataPaths,
    ...state.watchPaths.gitMetadataContainerPaths
  ];

  reasons.add(
    gitMetadataPaths.some((metadataPath) => isSameOrInside(metadataPath, candidatePath))
      ? "git_metadata"
      : "worktree"
  );

  if (event.kind === "unlink" || event.kind === "unlinkDir") {
    reasons.add("deleted");
  }

  return projectWatchReasonOrder.filter((reason) => reasons.has(reason));
}

function normalizeProjectWatchPaths(paths: ProjectWatchPaths): ProjectWatchPaths {
  return {
    gitMetadataContainerPaths: uniquePaths(paths.gitMetadataContainerPaths),
    gitMetadataPaths: uniquePaths(paths.gitMetadataPaths),
    worktreeRoot: path.resolve(paths.worktreeRoot)
  };
}

function uniquePaths(paths: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const uniquePaths: string[] = [];

  for (const candidatePath of paths) {
    const normalizedPath = path.resolve(candidatePath);

    if (!seen.has(normalizedPath)) {
      seen.add(normalizedPath);
      uniquePaths.push(normalizedPath);
    }
  }

  return uniquePaths;
}

function normalizeCandidatePath(candidatePath: string, projectPath: string): string {
  return path.isAbsolute(candidatePath)
    ? path.resolve(candidatePath)
    : path.resolve(projectPath, candidatePath);
}

function isSameOrInside(parentPath: string, candidatePath: string): boolean {
  if (isSamePath(parentPath, candidatePath)) {
    return true;
  }

  const relativePath = path.relative(parentPath, candidatePath);

  return (
    relativePath.length > 0 &&
    !relativePath.startsWith("..") &&
    !path.isAbsolute(relativePath)
  );
}

function isSamePath(leftPath: string, rightPath: string): boolean {
  return path.normalize(leftPath) === path.normalize(rightPath);
}

function pathSegments(candidatePath: string): readonly string[] {
  return candidatePath.split(path.sep).filter((segment) => segment.length > 0);
}

function boundedErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  return message.slice(0, maxErrorMessageLength);
}
