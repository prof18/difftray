export type UpdatePhase =
  | { readonly kind: "idle" }
  | { readonly kind: "checking" }
  | { readonly kind: "available"; readonly version: string }
  | { readonly kind: "downloading"; readonly percent: number; readonly version: string }
  | { readonly kind: "downloaded"; readonly version: string }
  | { readonly kind: "error"; readonly message: string };

export type UpdatePhaseListener = (phase: UpdatePhase) => void;

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

export function parseProjectChangedEvent(
  payload: unknown
): ProjectChangedEvent | undefined {
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

export function parseProjectLoadProgress(
  payload: unknown
): ProjectLoadProgressView | undefined {
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

export function parseUpdatePhase(payload: unknown): UpdatePhase | undefined {
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

function isProjectWatchReason(value: unknown): value is ProjectWatchReason {
  return (
    value === "deleted" ||
    value === "git_metadata" ||
    value === "watcher_error" ||
    value === "worktree"
  );
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
