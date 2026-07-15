import path from "node:path";

import { mapWithConcurrency } from "./concurrency.js";
import {
  gitLines,
  gitOutput,
  gitOutputOrMaxBuffer,
  gitOutputOrNull,
  requiredGitOutput
} from "./git-command.js";
import {
  isDefined,
  loadTrackedDiffContent,
  loadTrackedDiffSummaryContent,
  oversizedPatchMarker,
  summarizeUntrackedDiff,
  synthesizeUntrackedDiff,
  type TrackedDiffSnapshotSource
} from "./git-diff-content.js";

export {
  loadRasterImageSnapshot,
  maxRasterImageBytes,
  maxRasterImagePixels,
  type RasterImageMimeType,
  type RasterImageSnapshot,
  type RasterImageSnapshotSource
} from "./raster-image-snapshot.js";
import {
  parseStatusPorcelainV2,
  shortBranchRefFromFullRef,
  type GitPorcelainStatus
} from "./git-status.js";
import {
  parseDiffStats,
  parseRawDiffs,
  type DiffStat,
  type NameStatusDiff
} from "./git-raw-diff.js";

export {
  parseStatusPorcelainV2,
  type GitFileStatus,
  type GitPorcelainStatus,
  type GitStatusCode
} from "./git-status.js";

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

export type GitCommitSummary = {
  readonly authoredAt: string;
  readonly sha: string;
  readonly shortSha: string;
  readonly subject: string;
};

export type GitCommitReviewTarget = {
  readonly commitSha: string;
  readonly commitShortSha: string;
  readonly commitSubject?: string;
  readonly headSha: string;
  readonly kind: "commit";
  readonly parentSha: string;
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

export type CommitDiffResult = {
  readonly files: readonly GitLoadedFileDiff[];
  readonly reviewTarget: GitCommitReviewTarget;
};

export type WorkingTreeDiffSummaryResult = {
  readonly files: readonly GitFileDiffSummary[];
  readonly reviewTarget: GitWorkingTreeReviewTarget;
};

export type BranchDiffSummaryResult = {
  readonly files: readonly GitFileDiffSummary[];
  readonly reviewTarget: GitBranchReviewTarget;
};

export type CommitDiffSummaryResult = {
  readonly files: readonly GitFileDiffSummary[];
  readonly reviewTarget: GitCommitReviewTarget;
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
  const output = await gitOutput(repoPath, [
    "status",
    "--porcelain=v2",
    "-z",
    "--untracked-files=all"
  ]);

  return parseStatusPorcelainV2(output);
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

export async function listRecentCommits(
  repoPath: string,
  options: { readonly limit?: number } = {}
): Promise<readonly GitCommitSummary[]> {
  const limit = clampRecentCommitLimit(options.limit ?? 25);
  const output = await gitOutputOrNull(repoPath, [
    "log",
    `-${String(limit)}`,
    "--date-order",
    "--abbrev=12",
    "--format=%H%x1f%h%x1f%s%x1f%aI"
  ]);

  return (output ?? "")
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      const [sha, shortSha, subject, authoredAt] = line.split("\x1f");

      return {
        authoredAt: authoredAt ?? "",
        sha: sha ?? "",
        shortSha: shortSha ?? "",
        subject: subject ?? ""
      };
    })
    .filter((commit) => commit.sha.length > 0);
}

export async function loadWorkingTreeReviewTarget(repoPath: string): Promise<{
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

export async function loadBranchReviewTarget(
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

export async function loadCommitReviewTarget(
  repoPath: string,
  commitRef: string
): Promise<GitCommitReviewTarget> {
  const commitSha = await gitOutputOrNull(repoPath, [
    "rev-parse",
    "--verify",
    `${commitRef}^{commit}`
  ]);

  if (!commitSha) {
    throw new Error(`Unable to resolve commit "${commitRef}"`);
  }

  const parentSha =
    (await gitOutputOrNull(repoPath, ["rev-parse", "--verify", `${commitSha}^`])) ??
    emptyTreeObjectId;
  const [commitShortSha, commitSubject] = await gitLines(repoPath, [
    "show",
    "-s",
    "--abbrev=12",
    "--format=%h%n%s",
    commitSha
  ]);

  return {
    commitSha,
    commitShortSha: commitShortSha ?? commitSha.slice(0, 12),
    ...(commitSubject ? { commitSubject } : {}),
    headSha: commitSha,
    kind: "commit",
    parentSha,
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
  const trackedDiff = await loadSingleTrackedDiff(
    repoPath,
    [diffBaseRef],
    {
      oldRef: diffBaseRef
    },
    filePath
  );

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
  const trackedSummary = await loadSingleTrackedDiffSummary(
    repoPath,
    [diffBaseRef],
    {
      oldRef: diffBaseRef
    },
    filePath
  );

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

export async function loadCommitDiffs(
  repoPath: string,
  commitRef: string,
  options: DiffLoadOptions = {}
): Promise<CommitDiffResult> {
  reportDiffLoadProgress(options, { phase: "resolving_target" });
  const reviewTarget = await loadCommitReviewTarget(repoPath, commitRef);

  reportDiffLoadProgress(options, { phase: "scanning_files" });
  return {
    files: await loadTrackedDiffs(
      repoPath,
      [reviewTarget.parentSha, reviewTarget.commitSha],
      {
        newRef: reviewTarget.commitSha,
        oldRef: reviewTarget.parentSha
      },
      options
    ),
    reviewTarget
  };
}

export async function loadCommitDiffSummaries(
  repoPath: string,
  commitRef: string,
  options: DiffLoadOptions = {}
): Promise<CommitDiffSummaryResult> {
  reportDiffLoadProgress(options, { phase: "resolving_target" });
  const reviewTarget = await loadCommitReviewTarget(repoPath, commitRef);

  reportDiffLoadProgress(options, { phase: "scanning_files" });
  return {
    files: await loadTrackedDiffSummaries(
      repoPath,
      [reviewTarget.parentSha, reviewTarget.commitSha],
      {
        newRef: reviewTarget.commitSha,
        oldRef: reviewTarget.parentSha
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
  return loadSingleTrackedDiff(
    repoPath,
    [reviewTarget.mergeBaseSha, "HEAD"],
    {
      newRef: reviewTarget.headSha,
      oldRef: reviewTarget.mergeBaseSha
    },
    filePath
  );
}

export async function loadBranchFileDiffSummary(
  repoPath: string,
  baseRefName: string,
  filePath: string
): Promise<GitFileDiffSummary | null> {
  const reviewTarget = await loadBranchReviewTarget(repoPath, baseRefName);
  return loadSingleTrackedDiffSummary(
    repoPath,
    [reviewTarget.mergeBaseSha, "HEAD"],
    {
      newRef: reviewTarget.headSha,
      oldRef: reviewTarget.mergeBaseSha
    },
    filePath
  );
}

export async function loadCommitFileDiff(
  repoPath: string,
  commitRef: string,
  filePath: string
): Promise<GitLoadedFileDiff | null> {
  const reviewTarget = await loadCommitReviewTarget(repoPath, commitRef);
  return loadSingleTrackedDiff(
    repoPath,
    [reviewTarget.parentSha, reviewTarget.commitSha],
    {
      newRef: reviewTarget.commitSha,
      oldRef: reviewTarget.parentSha
    },
    filePath
  );
}

export async function loadCommitFileDiffSummary(
  repoPath: string,
  commitRef: string,
  filePath: string
): Promise<GitFileDiffSummary | null> {
  const reviewTarget = await loadCommitReviewTarget(repoPath, commitRef);
  return loadSingleTrackedDiffSummary(
    repoPath,
    [reviewTarget.parentSha, reviewTarget.commitSha],
    {
      newRef: reviewTarget.commitSha,
      oldRef: reviewTarget.parentSha
    },
    filePath
  );
}

async function loadSingleTrackedDiff(
  repoPath: string,
  diffArgs: readonly string[],
  snapshotSource: TrackedDiffSnapshotSource,
  filePath: string
): Promise<GitLoadedFileDiff | null> {
  const narrowed = await loadTrackedDiffs(repoPath, diffArgs, snapshotSource, {}, [
    filePath
  ]);
  const narrowedMatch = narrowed.find((diff) => diff.newPath === filePath);

  if (narrowedMatch?.status !== "added") {
    return narrowedMatch ?? null;
  }

  const renamedMatch = (await loadTrackedDiffs(repoPath, diffArgs, snapshotSource)).find(
    (diff) => diff.newPath === filePath && diff.status === "renamed"
  );

  return renamedMatch ?? narrowedMatch;
}

async function loadSingleTrackedDiffSummary(
  repoPath: string,
  diffArgs: readonly string[],
  snapshotSource: TrackedDiffSnapshotSource,
  filePath: string
): Promise<GitFileDiffSummary | null> {
  const narrowed = await loadTrackedDiffSummaries(
    repoPath,
    diffArgs,
    snapshotSource,
    {},
    [filePath]
  );
  const narrowedMatch = narrowed.find((diff) => diff.newPath === filePath);

  if (narrowedMatch?.status !== "added") {
    return narrowedMatch ?? null;
  }

  const renamedMatch = (
    await loadTrackedDiffSummaries(repoPath, diffArgs, snapshotSource)
  ).find((diff) => diff.newPath === filePath && diff.status === "renamed");

  return renamedMatch ?? narrowedMatch;
}

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
): Promise<ReadonlyMap<string, DiffStat>> {
  const output = await gitOutput(repoPath, [
    "diff",
    "--numstat",
    "--find-renames",
    ...diffArgs,
    ...(pathspecs.length > 0 ? ["--", ...pathspecs] : [])
  ]);
  return parseDiffStats(output);
}

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

function clampRecentCommitLimit(limit: number): number {
  if (!Number.isSafeInteger(limit)) {
    return 25;
  }

  return Math.min(100, Math.max(1, limit));
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

function absolutizeGitPath(root: string, gitPath: string): string {
  if (path.isAbsolute(gitPath)) {
    return path.normalize(gitPath);
  }

  return path.resolve(root, gitPath);
}
