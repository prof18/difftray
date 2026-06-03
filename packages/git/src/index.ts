import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile, readlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { mapWithConcurrency } from "./concurrency.js";

const execFileAsync = promisify(execFile);
const maxGitOutputBuffer = 20 * 1024 * 1024;
const maxTextSnapshotBytes = 2 * 1024 * 1024;
const maxPatchBytesPerFile = 2 * 1024 * 1024;
const patchReadBufferPadding = 256 * 1024;
const oversizedPatchMarker = "__difftray_patch_too_large__";
const maxConcurrentFileDiffLoads = 4;
const emptyTreeObjectId = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

export type GitRepository = {
  readonly gitDir: string;
  readonly root: string;
};

export type GitWorktreeInfo = {
  readonly commonGitDir: string;
  readonly gitDir: string;
  readonly isLinkedWorktree: boolean;
  readonly root: string;
};

export type GitFileStatus = "added" | "deleted" | "modified" | "renamed" | "untracked";

export type GitPorcelainStatus = {
  readonly indexStatus?: GitStatusCode;
  readonly path: string;
  readonly previousPath?: string;
  readonly status: GitFileStatus;
  readonly workingTreeStatus?: GitStatusCode;
};

export type GitStatusCode = "added" | "deleted" | "modified" | "renamed";

export type GitWorkingTreeReviewTarget = {
  readonly headRefName?: string;
  readonly headSha: string;
  readonly kind: "working_tree";
  readonly projectId: string;
};

export type GitBranchReviewTarget = {
  readonly baseRefName: string;
  readonly baseSha: string;
  readonly headRefName?: string;
  readonly headSha: string;
  readonly kind: "branch";
  readonly mergeBaseSha: string;
  readonly projectId: string;
};

export type GitLoadedFileDiff = {
  readonly content:
    | {
        readonly kind: "text";
        readonly newText?: string;
        readonly oldText?: string;
        readonly patch: string;
      }
    | {
        readonly byteSize: number;
        readonly digest: string;
        readonly kind: "binary";
      }
    | {
        readonly kind: "symlink";
        readonly newTarget?: string;
        readonly oldTarget?: string;
      }
    | {
        readonly kind: "submodule";
        readonly newCommit?: string;
        readonly oldCommit?: string;
      }
    | {
        readonly kind: "mode_only";
      };
  readonly newMode?: string;
  readonly newPath: string;
  readonly oldMode?: string;
  readonly oldPath?: string;
  readonly status: "added" | "deleted" | "mode_changed" | "modified" | "renamed";
};

export type GitFileDiffSummary = Omit<GitLoadedFileDiff, "content"> & {
  readonly additions: number;
  readonly content: GitLoadedFileDiff["content"];
  readonly deletions: number;
};

export type WorkingTreeDiffResult = {
  readonly files: readonly GitLoadedFileDiff[];
  readonly reviewTarget: GitWorkingTreeReviewTarget;
};

export type BranchDiffResult = {
  readonly files: readonly GitLoadedFileDiff[];
  readonly reviewTarget: GitBranchReviewTarget;
};

export type WorkingTreeDiffSummaryResult = {
  readonly files: readonly GitFileDiffSummary[];
  readonly reviewTarget: GitWorkingTreeReviewTarget;
};

export type BranchDiffSummaryResult = {
  readonly files: readonly GitFileDiffSummary[];
  readonly reviewTarget: GitBranchReviewTarget;
};

export type DiffLoadProgress = {
  readonly loadedFiles?: number;
  readonly path?: string;
  readonly phase: "loading_files" | "resolving_target" | "scanning_files";
  readonly totalFiles?: number;
};

export type DiffLoadOptions = {
  readonly onProgress?: (progress: DiffLoadProgress) => void;
};

export async function findGitRepository(
  startPath: string
): Promise<GitRepository | null> {
  try {
    const [root, gitDir] = await gitLines(startPath, [
      "rev-parse",
      "--show-toplevel",
      "--absolute-git-dir"
    ]);

    if (!root || !gitDir) {
      return null;
    }

    return {
      gitDir,
      root
    };
  } catch {
    return null;
  }
}

export async function getWorktreeInfo(startPath: string): Promise<GitWorktreeInfo> {
  const [root, gitDir, commonGitDir] = await gitLines(startPath, [
    "rev-parse",
    "--show-toplevel",
    "--absolute-git-dir",
    "--git-common-dir"
  ]);

  if (!root || !gitDir || !commonGitDir) {
    throw new Error(`Unable to resolve Git worktree information for ${startPath}`);
  }

  const absoluteCommonGitDir = absolutizeGitPath(root, commonGitDir);

  return {
    commonGitDir: absoluteCommonGitDir,
    gitDir,
    isLinkedWorktree: path.normalize(gitDir) !== path.normalize(absoluteCommonGitDir),
    root
  };
}

export async function getGitStatus(
  repoPath: string
): Promise<readonly GitPorcelainStatus[]> {
  const { stdout } = await execFileAsync(
    "git",
    ["-C", repoPath, "status", "--porcelain=v2", "-z", "--untracked-files=all"],
    { encoding: "utf8", maxBuffer: maxGitOutputBuffer }
  );

  return parseStatusPorcelainV2(stdout);
}

export async function listBranchRefs(repoPath: string): Promise<readonly string[]> {
  const output = await gitOutput(repoPath, [
    "for-each-ref",
    "--format=%(refname)",
    "--sort=refname",
    "refs/heads",
    "refs/remotes"
  ]);

  return Array.from(
    new Set(
      output
        .split("\n")
        .map((ref) => ref.trim())
        .map(shortBranchRefFromFullRef)
        .filter((ref): ref is string => ref !== undefined)
    )
  );
}

async function loadWorkingTreeReviewTarget(repoPath: string): Promise<{
  readonly diffBaseRef: string;
  readonly reviewTarget: GitWorkingTreeReviewTarget;
}> {
  const branchName = await currentBranchName(repoPath);
  const headSha =
    (await gitOutputOrNull(repoPath, ["rev-parse", "--verify", "HEAD^{commit}"])) ??
    emptyTreeObjectId;

  return {
    diffBaseRef: headSha,
    reviewTarget: {
      ...(branchName ? { headRefName: branchName } : {}),
      headSha,
      kind: "working_tree",
      projectId: repoPath
    }
  };
}

async function loadBranchReviewTarget(
  repoPath: string,
  baseRefName: string
): Promise<GitBranchReviewTarget> {
  const baseSha = await gitOutputOrNull(repoPath, [
    "rev-parse",
    "--verify",
    `${baseRefName}^{commit}`
  ]);

  if (!baseSha) {
    throw new Error(`Unable to resolve base ref "${baseRefName}"`);
  }

  const headSha = await requiredGitOutput(repoPath, ["rev-parse", "HEAD"]);
  const mergeBaseSha = await requiredGitOutput(repoPath, [
    "merge-base",
    baseRefName,
    "HEAD"
  ]);
  const branchName = await currentBranchName(repoPath);

  return {
    baseRefName,
    baseSha,
    ...(branchName ? { headRefName: branchName } : {}),
    headSha,
    kind: "branch",
    mergeBaseSha,
    projectId: repoPath
  };
}

export async function loadWorkingTreeDiffs(
  repoPath: string,
  options: DiffLoadOptions = {}
): Promise<WorkingTreeDiffResult> {
  reportDiffLoadProgress(options, { phase: "resolving_target" });
  const { diffBaseRef, reviewTarget } = await loadWorkingTreeReviewTarget(repoPath);

  reportDiffLoadProgress(options, { phase: "scanning_files" });
  const status = await getGitStatus(repoPath);
  const trackedDiffs = await loadTrackedDiffs(
    repoPath,
    [diffBaseRef],
    {
      oldRef: diffBaseRef
    },
    options
  );
  const trackedPaths = new Set(trackedDiffs.map((diff) => diff.newPath));
  const untrackedEntries = status.filter(
    (entry) => entry.status === "untracked" && !trackedPaths.has(entry.path)
  );
  let loadedUntrackedFiles = 0;

  if (untrackedEntries.length > 0) {
    reportDiffLoadProgress(options, {
      loadedFiles: loadedUntrackedFiles,
      phase: "loading_files",
      totalFiles: untrackedEntries.length
    });
  }

  const untrackedDiffs = await mapWithConcurrency(
    untrackedEntries,
    maxConcurrentFileDiffLoads,
    async (entry) => {
      const diff = await synthesizeUntrackedDiff(repoPath, entry.path);
      loadedUntrackedFiles += 1;
      reportDiffLoadProgress(options, {
        loadedFiles: loadedUntrackedFiles,
        path: entry.path,
        phase: "loading_files",
        totalFiles: untrackedEntries.length
      });
      return diff;
    }
  );

  return {
    files: [...trackedDiffs, ...untrackedDiffs.filter(isDefined)],
    reviewTarget
  };
}

export async function loadWorkingTreeDiffSummaries(
  repoPath: string,
  options: DiffLoadOptions = {}
): Promise<WorkingTreeDiffSummaryResult> {
  reportDiffLoadProgress(options, { phase: "resolving_target" });
  const { diffBaseRef, reviewTarget } = await loadWorkingTreeReviewTarget(repoPath);

  reportDiffLoadProgress(options, { phase: "scanning_files" });
  const status = await getGitStatus(repoPath);
  const trackedSummaries = await loadTrackedDiffSummaries(
    repoPath,
    [diffBaseRef],
    {
      oldRef: diffBaseRef
    },
    options
  );
  const trackedPaths = new Set(trackedSummaries.map((diff) => diff.newPath));
  const untrackedEntries = status.filter(
    (entry) => entry.status === "untracked" && !trackedPaths.has(entry.path)
  );
  let loadedUntrackedFiles = 0;

  if (untrackedEntries.length > 0) {
    reportDiffLoadProgress(options, {
      loadedFiles: loadedUntrackedFiles,
      phase: "loading_files",
      totalFiles: untrackedEntries.length
    });
  }

  const untrackedSummaries = await mapWithConcurrency(
    untrackedEntries,
    maxConcurrentFileDiffLoads,
    async (entry) => {
      const diff = await summarizeUntrackedDiff(repoPath, entry.path);
      loadedUntrackedFiles += 1;
      reportDiffLoadProgress(options, {
        loadedFiles: loadedUntrackedFiles,
        path: entry.path,
        phase: "loading_files",
        totalFiles: untrackedEntries.length
      });
      return diff;
    }
  );

  return {
    files: [...trackedSummaries, ...untrackedSummaries.filter(isDefined)],
    reviewTarget
  };
}

export async function loadWorkingTreeFileDiff(
  repoPath: string,
  filePath: string
): Promise<GitLoadedFileDiff | null> {
  const { diffBaseRef } = await loadWorkingTreeReviewTarget(repoPath);
  const trackedDiffs = await loadTrackedDiffs(
    repoPath,
    [diffBaseRef],
    {
      oldRef: diffBaseRef
    },
    {},
    [filePath]
  );
  const trackedDiff = trackedDiffs.find((diff) => diff.newPath === filePath);

  if (trackedDiff) {
    return trackedDiff;
  }

  const status = await getGitStatus(repoPath);
  const untracked = status.find(
    (entry) => entry.status === "untracked" && entry.path === filePath
  );

  return untracked ? ((await synthesizeUntrackedDiff(repoPath, filePath)) ?? null) : null;
}

export async function loadWorkingTreeFileDiffSummary(
  repoPath: string,
  filePath: string
): Promise<GitFileDiffSummary | null> {
  const { diffBaseRef } = await loadWorkingTreeReviewTarget(repoPath);
  const trackedSummaries = await loadTrackedDiffSummaries(
    repoPath,
    [diffBaseRef],
    {
      oldRef: diffBaseRef
    },
    {},
    [filePath]
  );
  const trackedSummary = trackedSummaries.find((diff) => diff.newPath === filePath);

  if (trackedSummary) {
    return trackedSummary;
  }

  const status = await getGitStatus(repoPath);
  const untracked = status.find(
    (entry) => entry.status === "untracked" && entry.path === filePath
  );

  return untracked ? ((await summarizeUntrackedDiff(repoPath, filePath)) ?? null) : null;
}

export async function loadBranchDiffs(
  repoPath: string,
  baseRefName: string,
  options: DiffLoadOptions = {}
): Promise<BranchDiffResult> {
  reportDiffLoadProgress(options, { phase: "resolving_target" });
  const reviewTarget = await loadBranchReviewTarget(repoPath, baseRefName);

  reportDiffLoadProgress(options, { phase: "scanning_files" });
  return {
    files: await loadTrackedDiffs(
      repoPath,
      [reviewTarget.mergeBaseSha, "HEAD"],
      {
        newRef: reviewTarget.headSha,
        oldRef: reviewTarget.mergeBaseSha
      },
      options
    ),
    reviewTarget
  };
}

export async function loadBranchDiffSummaries(
  repoPath: string,
  baseRefName: string,
  options: DiffLoadOptions = {}
): Promise<BranchDiffSummaryResult> {
  reportDiffLoadProgress(options, { phase: "resolving_target" });
  const reviewTarget = await loadBranchReviewTarget(repoPath, baseRefName);

  reportDiffLoadProgress(options, { phase: "scanning_files" });
  return {
    files: await loadTrackedDiffSummaries(
      repoPath,
      [reviewTarget.mergeBaseSha, "HEAD"],
      {
        newRef: reviewTarget.headSha,
        oldRef: reviewTarget.mergeBaseSha
      },
      options
    ),
    reviewTarget
  };
}

export async function loadBranchFileDiff(
  repoPath: string,
  baseRefName: string,
  filePath: string
): Promise<GitLoadedFileDiff | null> {
  const reviewTarget = await loadBranchReviewTarget(repoPath, baseRefName);
  const diffs = await loadTrackedDiffs(
    repoPath,
    [reviewTarget.mergeBaseSha, "HEAD"],
    {
      newRef: reviewTarget.headSha,
      oldRef: reviewTarget.mergeBaseSha
    },
    {},
    [filePath]
  );

  return diffs.find((diff) => diff.newPath === filePath) ?? null;
}

export async function loadBranchFileDiffSummary(
  repoPath: string,
  baseRefName: string,
  filePath: string
): Promise<GitFileDiffSummary | null> {
  const reviewTarget = await loadBranchReviewTarget(repoPath, baseRefName);
  const summaries = await loadTrackedDiffSummaries(
    repoPath,
    [reviewTarget.mergeBaseSha, "HEAD"],
    {
      newRef: reviewTarget.headSha,
      oldRef: reviewTarget.mergeBaseSha
    },
    {},
    [filePath]
  );

  return summaries.find((diff) => diff.newPath === filePath) ?? null;
}

export function parseStatusPorcelainV2(output: string): readonly GitPorcelainStatus[] {
  const records = output.split("\0").filter((record) => record.length > 0);
  const statuses: GitPorcelainStatus[] = [];

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];

    if (!record) {
      continue;
    }

    if (record.startsWith("? ")) {
      statuses.push({
        path: record.slice(2),
        status: "untracked"
      });
      continue;
    }

    if (record.startsWith("1 ")) {
      statuses.push(parseOrdinaryRecord(record));
      continue;
    }

    if (record.startsWith("2 ")) {
      const previousPath = records[index + 1];
      if (!previousPath) {
        throw new Error(`Git rename status record is missing previous path: ${record}`);
      }

      statuses.push(parseRenameRecord(record, previousPath));
      index += 1;
    }
  }

  return statuses;
}

function shortBranchRefFromFullRef(ref: string): string | undefined {
  if (ref.startsWith("refs/heads/")) {
    return ref.slice("refs/heads/".length);
  }

  if (ref.startsWith("refs/remotes/") && !ref.endsWith("/HEAD")) {
    return ref.slice("refs/remotes/".length);
  }

  return undefined;
}

function parseOrdinaryRecord(record: string): GitPorcelainStatus {
  const fields = splitStatusFields(record, 8);
  const xy = fields[1] ?? "..";
  const status = statusFromXY(xy);
  const indexStatus = statusCodeFromPorcelainCode(xy[0]);
  const workingTreeStatus = statusCodeFromPorcelainCode(xy[1]);

  return {
    ...(indexStatus ? { indexStatus } : {}),
    path: fields[8] ?? "",
    status,
    ...(workingTreeStatus ? { workingTreeStatus } : {})
  };
}

function parseRenameRecord(record: string, previousPath: string): GitPorcelainStatus {
  const fields = splitStatusFields(record, 9);
  const xy = fields[1] ?? "..";
  const indexStatus = statusCodeFromPorcelainCode(xy[0]);
  const workingTreeStatus = statusCodeFromPorcelainCode(xy[1]);

  return {
    ...(indexStatus ? { indexStatus } : {}),
    path: fields[9] ?? "",
    previousPath,
    status: "renamed" as const,
    ...(workingTreeStatus ? { workingTreeStatus } : {})
  };
}

function splitStatusFields(record: string, spaceCount: number): readonly string[] {
  const fields: string[] = [];
  let start = 0;

  for (let spacesSeen = 0; spacesSeen < spaceCount; spacesSeen += 1) {
    const nextSpace = record.indexOf(" ", start);
    if (nextSpace === -1) {
      throw new Error(`Malformed Git porcelain-v2 status record: ${record}`);
    }

    fields.push(record.slice(start, nextSpace));
    start = nextSpace + 1;
  }

  fields.push(record.slice(start));
  return fields;
}

function statusFromXY(xy: string): GitFileStatus {
  if (xy.includes("A")) {
    return "added";
  }

  if (xy.includes("D")) {
    return "deleted";
  }

  if (xy.includes("R")) {
    return "renamed";
  }

  return "modified";
}

function statusCodeFromPorcelainCode(
  code: string | undefined
): GitStatusCode | undefined {
  switch (code) {
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "M":
      return "modified";
    case "R":
      return "renamed";
    default:
      return undefined;
  }
}

type NameStatusDiff = {
  readonly newMode?: string;
  readonly newObjectId?: string;
  readonly newPath: string;
  readonly oldMode?: string;
  readonly oldObjectId?: string;
  readonly oldPath?: string;
  readonly status: GitLoadedFileDiff["status"];
};

async function loadTrackedDiffs(
  repoPath: string,
  diffArgs: readonly string[],
  snapshotSource: TrackedDiffSnapshotSource,
  options: DiffLoadOptions = {},
  pathspecs: readonly string[] = []
): Promise<readonly GitLoadedFileDiff[]> {
  const nameStatuses = await loadRawDiffs(repoPath, diffArgs, pathspecs);
  let loadedFiles = 0;

  reportDiffLoadProgress(options, {
    loadedFiles,
    phase: "loading_files",
    totalFiles: nameStatuses.length
  });

  return mapWithConcurrency(
    nameStatuses,
    maxConcurrentFileDiffLoads,
    async (nameStatus) => {
      const patch = await loadPatchForDiff(repoPath, diffArgs, nameStatus);
      const content = await loadTrackedDiffContent(
        repoPath,
        nameStatus,
        snapshotSource,
        patch
      );

      const result: GitLoadedFileDiff = {
        content,
        ...(nameStatus.newMode ? { newMode: nameStatus.newMode } : {}),
        newPath: nameStatus.newPath,
        ...(nameStatus.oldMode ? { oldMode: nameStatus.oldMode } : {}),
        ...(nameStatus.oldPath ? { oldPath: nameStatus.oldPath } : {}),
        status: content.kind === "mode_only" ? "mode_changed" : nameStatus.status
      };

      loadedFiles += 1;
      reportDiffLoadProgress(options, {
        loadedFiles,
        path: nameStatus.newPath,
        phase: "loading_files",
        totalFiles: nameStatuses.length
      });

      return result;
    }
  );
}

async function loadTrackedDiffSummaries(
  repoPath: string,
  diffArgs: readonly string[],
  snapshotSource: TrackedDiffSnapshotSource,
  options: DiffLoadOptions = {},
  pathspecs: readonly string[] = []
): Promise<readonly GitFileDiffSummary[]> {
  const nameStatuses = await loadRawDiffs(repoPath, diffArgs, pathspecs);
  const statsByPath = await loadDiffStats(repoPath, diffArgs, pathspecs);
  let loadedFiles = 0;

  reportDiffLoadProgress(options, {
    loadedFiles,
    phase: "loading_files",
    totalFiles: nameStatuses.length
  });

  return mapWithConcurrency(
    nameStatuses,
    maxConcurrentFileDiffLoads,
    async (nameStatus) => {
      const content = await loadTrackedDiffSummaryContent(
        repoPath,
        nameStatus,
        snapshotSource
      );
      const result: GitFileDiffSummary = {
        additions: statsByPath.get(nameStatus.newPath)?.additions ?? 0,
        content,
        deletions: statsByPath.get(nameStatus.newPath)?.deletions ?? 0,
        ...(nameStatus.newMode ? { newMode: nameStatus.newMode } : {}),
        newPath: nameStatus.newPath,
        ...(nameStatus.oldMode ? { oldMode: nameStatus.oldMode } : {}),
        ...(nameStatus.oldPath ? { oldPath: nameStatus.oldPath } : {}),
        status: content.kind === "mode_only" ? "mode_changed" : nameStatus.status
      };

      loadedFiles += 1;
      reportDiffLoadProgress(options, {
        loadedFiles,
        path: nameStatus.newPath,
        phase: "loading_files",
        totalFiles: nameStatuses.length
      });

      return result;
    }
  );
}

function reportDiffLoadProgress(
  options: DiffLoadOptions,
  progress: DiffLoadProgress
): void {
  options.onProgress?.(progress);
}

async function loadRawDiffs(
  repoPath: string,
  diffArgs: readonly string[],
  pathspecs: readonly string[] = []
): Promise<readonly NameStatusDiff[]> {
  const output = await gitOutput(repoPath, [
    "diff",
    "--raw",
    "--full-index",
    "--find-renames",
    "-z",
    ...diffArgs,
    ...(pathspecs.length > 0 ? ["--", ...pathspecs] : [])
  ]);

  return parseRawDiffs(output);
}

async function loadDiffStats(
  repoPath: string,
  diffArgs: readonly string[],
  pathspecs: readonly string[] = []
): Promise<
  ReadonlyMap<string, { readonly additions: number; readonly deletions: number }>
> {
  const output = await gitOutput(repoPath, [
    "diff",
    "--numstat",
    "--find-renames",
    ...diffArgs,
    ...(pathspecs.length > 0 ? ["--", ...pathspecs] : [])
  ]);
  const stats = new Map<
    string,
    { readonly additions: number; readonly deletions: number }
  >();

  for (const line of output.split("\n")) {
    if (line.length === 0) {
      continue;
    }

    const [rawAdditions, rawDeletions, ...pathParts] = line.split("\t");
    const filePath = normalizeNumstatPath(pathParts.join("\t"));

    if (!rawAdditions || !rawDeletions || filePath.length === 0) {
      continue;
    }

    stats.set(filePath, {
      additions: numberStat(rawAdditions),
      deletions: numberStat(rawDeletions)
    });
  }

  return stats;
}

function normalizeNumstatPath(filePath: string): string {
  const braceRename = /^(?<prefix>.*)\{.* => (?<next>.*)\}(?<suffix>.*)$/.exec(filePath);

  if (braceRename?.groups?.next !== undefined) {
    return `${braceRename.groups.prefix ?? ""}${braceRename.groups.next}${braceRename.groups.suffix ?? ""}`;
  }

  const plainRename = /^.* => (?<next>.*)$/.exec(filePath);

  return plainRename?.groups?.next ?? filePath;
}

function numberStat(value: string): number {
  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function parseRawDiffs(output: string): readonly NameStatusDiff[] {
  const records = output.split("\0").filter((record) => record.length > 0);
  const diffs: NameStatusDiff[] = [];

  for (let index = 0; index < records.length; index += 1) {
    const header = records[index];

    if (!header) {
      continue;
    }

    if (!header.startsWith(":")) {
      throw new Error(`Malformed Git raw diff record: ${header}`);
    }

    const [oldMode, newMode, oldObjectId, newObjectId, rawStatus] = header
      .slice(1)
      .split(" ");
    const statusCode = rawStatus?.[0] ?? "M";

    if (statusCode === "R") {
      const oldPath = records[index + 1];
      const newPath = records[index + 2];

      if (!oldPath || !newPath) {
        throw new Error("Git rename diff is missing a path.");
      }

      diffs.push({
        ...(newMode ? { newMode } : {}),
        ...(newObjectId ? { newObjectId } : {}),
        newPath,
        ...(oldMode ? { oldMode } : {}),
        ...(oldObjectId ? { oldObjectId } : {}),
        oldPath,
        status: "renamed"
      });
      index += 2;
      continue;
    }

    const pathRecord = records[index + 1];

    if (!pathRecord) {
      continue;
    }

    diffs.push({
      ...(newMode ? { newMode } : {}),
      ...(newObjectId ? { newObjectId } : {}),
      newPath: pathRecord,
      ...(oldMode ? { oldMode } : {}),
      ...(oldObjectId ? { oldObjectId } : {}),
      status: statusFromRawStatusCode(statusCode)
    });
    index += 1;
  }

  return diffs;
}

type TrackedDiffSnapshotSource = {
  readonly newRef?: string;
  readonly oldRef: string;
};

async function loadPatchForDiff(
  repoPath: string,
  diffArgs: readonly string[],
  diff: NameStatusDiff
): Promise<string> {
  const output = await gitOutputOrMaxBuffer(repoPath, [
    "--literal-pathspecs",
    "diff",
    "--patch",
    "--find-renames",
    "--no-ext-diff",
    ...diffArgs,
    "--",
    ...patchPathspecs(diff)
  ]);

  return output ?? oversizedPatchMarker;
}

function patchPathspecs(diff: NameStatusDiff): readonly string[] {
  return [...new Set([diff.oldPath, diff.newPath].filter(isDefined))];
}

async function loadTrackedDiffContent(
  repoPath: string,
  diff: NameStatusDiff,
  source: TrackedDiffSnapshotSource,
  patch: string
): Promise<GitLoadedFileDiff["content"]> {
  if (isSubmoduleDiff(diff)) {
    return loadSubmoduleContent(repoPath, diff, source);
  }

  if (isModeOnlyDiff(diff, patch)) {
    return { kind: "mode_only" };
  }

  const snapshots = await loadTextSnapshots(repoPath, diff, source);

  if (isSymlinkDiff(diff)) {
    return {
      kind: "symlink",
      ...(snapshots.newText !== undefined ? { newTarget: snapshots.newText } : {}),
      ...(snapshots.oldText !== undefined ? { oldTarget: snapshots.oldText } : {})
    };
  }

  if (patchTooLarge(patch)) {
    return {
      kind: "binary",
      ...(await loadBinaryFingerprint(repoPath, diff, source))
    };
  }

  if (
    snapshots.newText !== undefined ||
    snapshots.oldText !== undefined ||
    !patchLooksBinary(patch)
  ) {
    return {
      kind: "text",
      ...snapshots,
      patch
    };
  }

  return {
    kind: "binary",
    ...(await loadBinaryFingerprint(repoPath, diff, source))
  };
}

async function loadTrackedDiffSummaryContent(
  repoPath: string,
  diff: NameStatusDiff,
  source: TrackedDiffSnapshotSource
): Promise<GitLoadedFileDiff["content"]> {
  if (isSubmoduleDiff(diff)) {
    return loadSubmoduleContent(repoPath, diff, source);
  }

  if (isModeOnlySummaryDiff(diff)) {
    return { kind: "mode_only" };
  }

  if (isSymlinkDiff(diff)) {
    const snapshots = await loadTextSnapshots(repoPath, diff, source);

    return {
      kind: "symlink",
      ...(snapshots.newText !== undefined ? { newTarget: snapshots.newText } : {}),
      ...(snapshots.oldText !== undefined ? { oldTarget: snapshots.oldText } : {})
    };
  }

  return {
    kind: "binary",
    ...(await loadSummaryFingerprint(repoPath, diff, source))
  };
}

function isModeOnlySummaryDiff(diff: NameStatusDiff): boolean {
  return (
    diff.status === "modified" &&
    diff.oldMode !== undefined &&
    diff.newMode !== undefined &&
    diff.oldMode !== diff.newMode &&
    diff.oldObjectId !== undefined &&
    diff.newObjectId !== undefined &&
    diff.oldObjectId === diff.newObjectId
  );
}

async function loadSummaryFingerprint(
  repoPath: string,
  diff: NameStatusDiff,
  source: TrackedDiffSnapshotSource
): Promise<{ readonly byteSize: number; readonly digest: string }> {
  const oldPath = diff.oldPath ?? diff.newPath;
  const oldIdentity =
    diff.status === "added"
      ? undefined
      : await committedSummaryIdentity(
          repoPath,
          source.oldRef,
          oldPath,
          diff.oldObjectId
        );
  const newIdentity =
    diff.status === "deleted"
      ? undefined
      : source.newRef
        ? await committedSummaryIdentity(
            repoPath,
            source.newRef,
            diff.newPath,
            diff.newObjectId
          )
        : await worktreeSummaryIdentity(repoPath, diff.newPath, diff.newObjectId);

  return {
    byteSize: newIdentity?.byteSize ?? oldIdentity?.byteSize ?? 0,
    digest: sha256Json([
      "diff-summary-v1",
      diff.status,
      diff.oldMode ?? null,
      diff.newMode ?? null,
      oldIdentity?.id ?? null,
      newIdentity?.id ?? null
    ])
  };
}

async function committedSummaryIdentity(
  repoPath: string,
  ref: string,
  relativePath: string,
  objectId: string | undefined
): Promise<{ readonly byteSize: number; readonly id: string } | undefined> {
  const byteSize = await committedSnapshotByteSize(repoPath, ref, relativePath);

  if (byteSize === undefined) {
    return undefined;
  }

  return {
    byteSize,
    id: fullNonZeroObjectId(objectId)
      ? `git-object:${objectId}`
      : `git-sha256:${await sha256GitBlob(repoPath, ref, relativePath)}`
  };
}

async function worktreeSummaryIdentity(
  repoPath: string,
  relativePath: string,
  objectId: string | undefined
): Promise<{ readonly byteSize: number; readonly id: string } | undefined> {
  if (fullNonZeroObjectId(objectId)) {
    return {
      byteSize: 0,
      id: `git-object:${objectId}`
    };
  }

  try {
    const fingerprint = await fingerprintFile(path.join(repoPath, relativePath));

    return {
      byteSize: fingerprint.byteSize,
      id: `worktree-sha256:${fingerprint.digest}`
    };
  } catch {
    return undefined;
  }
}

async function loadTextSnapshots(
  repoPath: string,
  diff: NameStatusDiff,
  source: TrackedDiffSnapshotSource
): Promise<{ readonly newText?: string; readonly oldText?: string }> {
  const oldPath = diff.oldPath ?? diff.newPath;
  const [oldText, newText] = await Promise.all([
    readCommittedTextSnapshot(repoPath, source.oldRef, oldPath),
    source.newRef
      ? readCommittedTextSnapshot(repoPath, source.newRef, diff.newPath)
      : readWorktreeTextSnapshot(repoPath, diff.newPath)
  ]);

  return {
    ...(newText !== undefined ? { newText } : {}),
    ...(oldText !== undefined ? { oldText } : {})
  };
}

async function readCommittedTextSnapshot(
  repoPath: string,
  ref: string,
  relativePath: string
): Promise<string | undefined> {
  try {
    const byteSize = await committedSnapshotByteSize(repoPath, ref, relativePath);

    if (byteSize === undefined || byteSize > maxTextSnapshotBytes) {
      return undefined;
    }

    const bytes = await gitBuffer(repoPath, ["show", `${ref}:${relativePath}`]);

    return textFromSnapshotBytes(bytes);
  } catch {
    return undefined;
  }
}

async function readWorktreeTextSnapshot(
  repoPath: string,
  relativePath: string
): Promise<string | undefined> {
  try {
    const absolutePath = path.join(repoPath, relativePath);
    const fileStat = await lstat(absolutePath);

    if (fileStat.isSymbolicLink()) {
      return await readlink(absolutePath);
    }

    if (fileStat.size > maxTextSnapshotBytes) {
      return undefined;
    }

    const bytes = await readFile(absolutePath);

    return textFromSnapshotBytes(bytes);
  } catch {
    return undefined;
  }
}

async function loadBinaryFingerprint(
  repoPath: string,
  diff: NameStatusDiff,
  source: TrackedDiffSnapshotSource
): Promise<{ readonly byteSize: number; readonly digest: string }> {
  const oldPath = diff.oldPath ?? diff.newPath;

  const fingerprint =
    diff.status === "deleted"
      ? await committedBinaryFingerprint(repoPath, source.oldRef, oldPath)
      : ((source.newRef
          ? await committedBinaryFingerprint(repoPath, source.newRef, diff.newPath)
          : await worktreeBinaryFingerprint(repoPath, diff.newPath)) ??
        (await committedBinaryFingerprint(repoPath, source.oldRef, oldPath)));

  if (!fingerprint) {
    throw new Error(`Unable to fingerprint binary diff for ${diff.newPath}`);
  }

  return fingerprint;
}

async function committedBinaryFingerprint(
  repoPath: string,
  ref: string,
  relativePath: string
): Promise<{ readonly byteSize: number; readonly digest: string } | undefined> {
  const byteSize = await committedSnapshotByteSize(repoPath, ref, relativePath);

  if (byteSize === undefined) {
    return undefined;
  }

  return {
    byteSize,
    digest: await sha256GitBlob(repoPath, ref, relativePath)
  };
}

async function worktreeBinaryFingerprint(
  repoPath: string,
  relativePath: string
): Promise<{ readonly byteSize: number; readonly digest: string } | undefined> {
  try {
    return await fingerprintFile(path.join(repoPath, relativePath));
  } catch {
    return undefined;
  }
}

async function committedSnapshotByteSize(
  repoPath: string,
  ref: string,
  relativePath: string
): Promise<number | undefined> {
  const output = await gitOutputOrNull(repoPath, [
    "cat-file",
    "-s",
    `${ref}:${relativePath}`
  ]);
  const byteSize = output ? Number(output) : Number.NaN;

  return Number.isSafeInteger(byteSize) && byteSize >= 0 ? byteSize : undefined;
}

async function sha256GitBlob(
  repoPath: string,
  ref: string,
  relativePath: string
): Promise<string> {
  return sha256Command("git", ["-C", repoPath, "show", `${ref}:${relativePath}`]);
}

async function fingerprintFile(
  filePath: string
): Promise<{ readonly byteSize: number; readonly digest: string }> {
  const fileStat = await lstat(filePath);

  return {
    byteSize: fileStat.size,
    digest: await sha256File(filePath)
  };
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);

  return new Promise<string>((resolve, reject) => {
    stream.on("data", (chunk: Buffer | string) => {
      hash.update(chunk);
    });
    stream.on("error", reject);
    stream.on("end", () => {
      resolve(hash.digest("hex"));
    });
  });
}

async function sha256Command(command: string, args: readonly string[]): Promise<string> {
  const hash = createHash("sha256");
  const child = spawn(command, [...args], {
    stdio: ["ignore", "pipe", "ignore"]
  });

  return new Promise<string>((resolve, reject) => {
    child.stdout.on("data", (chunk: Buffer | string) => {
      hash.update(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(hash.digest("hex"));
        return;
      }

      reject(new Error(`${command} exited with status ${String(code)}`));
    });
  });
}

function binaryFingerprint(bytes: Buffer): {
  readonly byteSize: number;
  readonly digest: string;
} {
  return {
    byteSize: bytes.byteLength,
    digest: createHash("sha256").update(bytes).digest("hex")
  };
}

async function loadSubmoduleContent(
  repoPath: string,
  diff: NameStatusDiff,
  source: TrackedDiffSnapshotSource
): Promise<Extract<GitLoadedFileDiff["content"], { readonly kind: "submodule" }>> {
  const oldPath = diff.oldPath ?? diff.newPath;
  const [oldCommit, newCommit] = await Promise.all([
    diff.status === "added"
      ? Promise.resolve(undefined)
      : fullSubmoduleCommit(repoPath, source.oldRef, oldPath, diff.oldObjectId),
    diff.status === "deleted"
      ? Promise.resolve(undefined)
      : source.newRef
        ? fullSubmoduleCommit(repoPath, source.newRef, diff.newPath, diff.newObjectId)
        : worktreeSubmoduleCommit(repoPath, diff.newPath)
  ]);

  return {
    kind: "submodule",
    ...(newCommit ? { newCommit } : {}),
    ...(oldCommit ? { oldCommit } : {})
  };
}

async function fullSubmoduleCommit(
  repoPath: string,
  ref: string,
  relativePath: string,
  fallbackObjectId: string | undefined
): Promise<string | undefined> {
  const commit = await gitOutputOrNull(repoPath, ["rev-parse", `${ref}:${relativePath}`]);

  return commit ?? (fullObjectId(fallbackObjectId) ? fallbackObjectId : undefined);
}

async function synthesizeUntrackedDiff(
  repoPath: string,
  relativePath: string
): Promise<GitLoadedFileDiff | undefined> {
  const filePath = path.join(repoPath, relativePath);
  const fileStat = await lstat(filePath);

  if (fileStat.isSymbolicLink()) {
    return {
      content: {
        kind: "symlink",
        newTarget: await readlink(filePath)
      },
      newMode: "120000",
      newPath: relativePath,
      status: "added"
    };
  }

  if (!fileStat.isFile()) {
    return undefined;
  }

  if (fileStat.size > maxTextSnapshotBytes) {
    return {
      content: {
        kind: "binary",
        ...(await fingerprintFile(filePath))
      },
      newPath: relativePath,
      status: "added"
    };
  }

  const bytes = await readFile(filePath);

  if (isBinary(bytes)) {
    return {
      content: {
        kind: "binary",
        ...binaryFingerprint(bytes)
      },
      newPath: relativePath,
      status: "added"
    };
  }

  const text = bytes.toString("utf8");

  return {
    content: {
      kind: "text",
      newText: text,
      patch: synthesizeAddedPatch(relativePath, text)
    },
    newPath: relativePath,
    status: "added"
  };
}

async function summarizeUntrackedDiff(
  repoPath: string,
  relativePath: string
): Promise<GitFileDiffSummary | undefined> {
  const filePath = path.join(repoPath, relativePath);
  const fileStat = await lstat(filePath);

  if (fileStat.isSymbolicLink()) {
    return {
      additions: 0,
      content: {
        kind: "symlink",
        newTarget: await readlink(filePath)
      },
      deletions: 0,
      newMode: "120000",
      newPath: relativePath,
      status: "added"
    };
  }

  if (!fileStat.isFile()) {
    return undefined;
  }

  return {
    additions: 0,
    content: {
      kind: "binary",
      ...(await fingerprintFile(filePath))
    },
    deletions: 0,
    newPath: relativePath,
    status: "added"
  };
}

function synthesizeAddedPatch(relativePath: string, text: string): string {
  const lines = text.length === 0 ? [] : text.replaceAll("\r\n", "\n").split("\n");
  const normalizedLines = lines.at(-1) === "" ? lines.slice(0, -1) : lines;

  return [
    `diff --git a/${relativePath} b/${relativePath}`,
    "new file mode 100644",
    "index 0000000..0000000",
    "--- /dev/null",
    `+++ b/${relativePath}`,
    `@@ -0,0 +1,${String(normalizedLines.length)} @@`,
    ...normalizedLines.map((line) => `+${line}`)
  ].join("\n");
}

function isBinary(bytes: Buffer): boolean {
  return bytes.includes(0);
}

function textFromSnapshotBytes(bytes: Buffer): string | undefined {
  return isBinary(bytes) ? undefined : bytes.toString("utf8");
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function statusFromRawStatusCode(code: string): GitLoadedFileDiff["status"] {
  switch (code[0]) {
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "M":
      return "modified";
    default:
      return "modified";
  }
}

function isSubmoduleDiff(diff: NameStatusDiff): boolean {
  return isSubmoduleMode(diff.oldMode) || isSubmoduleMode(diff.newMode);
}

function isSubmoduleMode(mode: string | undefined): boolean {
  return mode === "160000";
}

function isSymlinkDiff(diff: NameStatusDiff): boolean {
  return isSymlinkMode(diff.oldMode) || isSymlinkMode(diff.newMode);
}

function isSymlinkMode(mode: string | undefined): boolean {
  return mode === "120000";
}

function isModeOnlyDiff(diff: NameStatusDiff, patch: string): boolean {
  return (
    diff.status === "modified" &&
    diff.oldMode !== undefined &&
    diff.newMode !== undefined &&
    diff.oldMode !== diff.newMode &&
    !patch.includes("@@") &&
    !patchLooksBinary(patch)
  );
}

function patchLooksBinary(patch: string): boolean {
  return /\bBinary files? .+ differ\b/.test(patch);
}

function patchTooLarge(patch: string): boolean {
  return (
    patch === oversizedPatchMarker ||
    Buffer.byteLength(patch, "utf8") > maxPatchBytesPerFile
  );
}

function fullObjectId(objectId: string | undefined): objectId is string {
  return objectId !== undefined && /^[0-9a-f]{40}$/i.test(objectId);
}

function fullNonZeroObjectId(objectId: string | undefined): objectId is string {
  return fullObjectId(objectId) && !/^0{40}$/.test(objectId);
}

function sha256Json(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

async function worktreeSubmoduleCommit(
  repoPath: string,
  relativePath: string
): Promise<string | undefined> {
  return (
    (await gitOutputOrNull(path.join(repoPath, relativePath), ["rev-parse", "HEAD"])) ??
    undefined
  );
}

async function currentBranchName(repoPath: string): Promise<string | undefined> {
  const branchName = await gitOutputOrNull(repoPath, [
    "symbolic-ref",
    "--quiet",
    "--short",
    "HEAD"
  ]);

  if (!branchName) {
    return undefined;
  }

  return branchName;
}

async function requiredGitOutput(cwd: string, args: readonly string[]): Promise<string> {
  return gitOutput(cwd, args);
}

async function gitOutputOrNull(
  cwd: string,
  args: readonly string[]
): Promise<string | null> {
  try {
    return await gitOutput(cwd, args);
  } catch {
    return null;
  }
}

async function gitOutputOrMaxBuffer(
  cwd: string,
  args: readonly string[]
): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      maxBuffer: maxPatchBytesPerFile + patchReadBufferPadding
    });

    return stdout.trimEnd();
  } catch (error) {
    if (isMaxBufferError(error)) {
      return undefined;
    }

    throw error;
  }
}

async function gitLines(
  cwd: string,
  args: readonly string[]
): Promise<readonly string[]> {
  const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], {
    encoding: "utf8"
  });

  return stdout
    .trimEnd()
    .split("\n")
    .map((line) => line.trim());
}

async function gitOutput(cwd: string, args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    maxBuffer: maxGitOutputBuffer
  });

  return stdout.trimEnd();
}

async function gitBuffer(cwd: string, args: readonly string[]): Promise<Buffer> {
  const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], {
    maxBuffer: maxGitOutputBuffer
  });

  return Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
}

function isMaxBufferError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes("maxBuffer") ||
      ("code" in error &&
        (error as { readonly code?: unknown }).code ===
          "ERR_CHILD_PROCESS_STDIO_MAXBUFFER"))
  );
}

function absolutizeGitPath(root: string, gitPath: string): string {
  if (path.isAbsolute(gitPath)) {
    return path.normalize(gitPath);
  }

  return path.resolve(root, gitPath);
}
