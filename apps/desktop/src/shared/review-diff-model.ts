import {
  parseDiffFromFile,
  processFile,
  type FileContents,
  type FileDiffMetadata
} from "@pierre/diffs";
import type { FileDiffStatus } from "@difftray/core";

export type CreateDiffsRenderModelInput = {
  readonly diffHash: string;
  readonly filePath: string;
  readonly newText?: string;
  readonly oldText?: string;
  readonly patch: string;
  readonly previousPath?: string;
  readonly status: FileDiffStatus;
};

export type DiffsRenderModel =
  | {
      readonly fileDiff: FileDiffMetadata;
      readonly kind: "diff";
    }
  | {
      readonly detail: string;
      readonly kind: "fallback";
      readonly title: string;
    };

const fallbackTitle = "No textual diff";

export function createDiffsRenderModel(
  input: CreateDiffsRenderModelInput
): DiffsRenderModel {
  if (isNonTextSummary(input.patch)) {
    return fallbackModel(input.patch);
  }

  const fullSnapshotModel = createFullSnapshotModel(input);

  if (fullSnapshotModel) {
    return fullSnapshotModel;
  }

  try {
    const fileDiff = processFile(input.patch, {
      cacheKey: input.diffHash,
      isGitDiff: input.patch.startsWith("diff --git "),
      throwOnError: true
    });

    if (fileDiff) {
      return {
        fileDiff: withDifftrayMetadata(fileDiff, input),
        kind: "diff"
      };
    }
  } catch {
    return fallbackModel(input.patch);
  }

  return fallbackModel(input.patch);
}

function createFullSnapshotModel(
  input: CreateDiffsRenderModelInput
): DiffsRenderModel | undefined {
  if (!hasFullSnapshotPair(input)) {
    return undefined;
  }

  const oldFile = fileContents({
    cacheKey: `${input.diffHash}:old`,
    contents: input.oldText ?? "",
    name: input.previousPath ?? input.filePath
  });
  const newFile = fileContents({
    cacheKey: `${input.diffHash}:new`,
    contents: input.newText ?? "",
    name: input.filePath
  });

  try {
    return {
      fileDiff: withDifftrayMetadata(
        parseDiffFromFile(oldFile, newFile, undefined, true),
        input
      ),
      kind: "diff"
    };
  } catch {
    return undefined;
  }
}

function hasFullSnapshotPair(input: CreateDiffsRenderModelInput): boolean {
  const hasOldSide = input.oldText !== undefined || input.status === "added";
  const hasNewSide = input.newText !== undefined || input.status === "deleted";

  return hasOldSide && hasNewSide;
}

function fileContents(input: FileContents): FileContents {
  return input;
}

function withDifftrayMetadata(
  fileDiff: FileDiffMetadata,
  input: CreateDiffsRenderModelInput
): FileDiffMetadata {
  return {
    ...fileDiff,
    cacheKey: input.diffHash,
    name: input.filePath,
    ...(input.previousPath ? { prevName: input.previousPath } : {}),
    type: changeTypeForStatus(input.status, fileDiff)
  };
}

function changeTypeForStatus(
  status: CreateDiffsRenderModelInput["status"],
  fileDiff: FileDiffMetadata
): FileDiffMetadata["type"] {
  switch (status) {
    case "added":
      return "new";
    case "deleted":
      return "deleted";
    case "renamed":
      return fileDiff.hunks.length === 0 ? "rename-pure" : "rename-changed";
    case "mode_changed":
    case "modified":
      return "change";
  }
}

function isNonTextSummary(patch: string): boolean {
  return (
    /^Binary file changed /m.test(patch) ||
    /^Mode changed:/m.test(patch) ||
    /^Submodule changed:/m.test(patch) ||
    /^Symlink changed:/m.test(patch)
  );
}

function fallbackModel(detail: string): DiffsRenderModel {
  return {
    detail,
    kind: "fallback",
    title: fallbackTitle
  };
}

export type ReviewLineRange = { readonly start: number; readonly end: number };
export type SelectableReviewLineRanges = {
  readonly additions: readonly ReviewLineRange[];
  readonly deletions: readonly ReviewLineRange[];
};

/** Source line anchors, including context that a full snapshot can expand. */
export function selectableReviewLineRanges(
  model: DiffsRenderModel
): SelectableReviewLineRanges {
  if (model.kind === "fallback") return { additions: [], deletions: [] };
  const { fileDiff } = model;
  if (!fileDiff.isPartial) {
    return {
      additions: fullLineRange(fileDiff.additionLines.length),
      deletions: fullLineRange(fileDiff.deletionLines.length)
    };
  }
  return {
    additions: mergeLineRanges(
      fileDiff.hunks
        .filter((hunk) => hunk.additionCount > 0)
        .map((hunk) => ({
          start: hunk.additionStart,
          end: hunk.additionStart + hunk.additionCount - 1
        }))
    ),
    deletions: mergeLineRanges(
      fileDiff.hunks
        .filter((hunk) => hunk.deletionCount > 0)
        .map((hunk) => ({
          start: hunk.deletionStart,
          end: hunk.deletionStart + hunk.deletionCount - 1
        }))
    )
  };
}

function fullLineRange(count: number): ReviewLineRange[] {
  return count > 0 ? [{ start: 1, end: count }] : [];
}

function mergeLineRanges(ranges: ReviewLineRange[]): ReviewLineRange[] {
  const merged: ReviewLineRange[] = [];
  for (const range of ranges.sort((a, b) => a.start - b.start)) {
    const last = merged.at(-1);
    if (last && range.start <= last.end + 1) {
      merged[merged.length - 1] = {
        start: last.start,
        end: Math.max(last.end, range.end)
      };
    } else {
      merged.push(range);
    }
  }
  return merged;
}
