import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile, readlink } from "node:fs/promises";
import path from "node:path";

import {
  gitBuffer,
  gitOutputOrNull,
  maxPatchBytesPerFile,
  sha256Command
} from "./git-command.js";
import type { NameStatusDiff } from "./git-raw-diff.js";
import type { GitFileDiffSummary, GitLoadedFileDiff } from "./index.js";

export const maxTextSnapshotBytes = 2 * 1024 * 1024;
export const oversizedPatchMarker = "__difftray_patch_too_large__";

export type TrackedDiffSnapshotSource = {
  readonly newRef?: string;
  readonly oldRef: string;
};

export async function loadTrackedDiffContent(
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

export async function loadTrackedDiffSummaryContent(
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

export async function synthesizeUntrackedDiff(
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

export async function summarizeUntrackedDiff(
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

export function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
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
