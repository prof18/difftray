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
  /** Display only. Agent services never set it, so they keep the canonical diff. */
  readonly ignoreWhitespace?: boolean;
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
      readonly whitespaceIgnored?: true;
    }
  | {
      readonly detail: string;
      readonly hint?: string;
      readonly kind: "fallback";
      readonly title: string;
      readonly whitespaceOnly?: true;
    };

const fallbackTitle = "No textual diff";
const whitespaceOnlyTitle = "Only whitespace changed";
const whitespaceOnlyHint = "Turn off ignoring whitespace to see these changes.";
const ignoreWhitespaceCacheSuffix = ":ignore-whitespace";

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
        fileDiff: withDifftrayMetadata(fileDiff, input, input.diffHash),
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

  const ignoreWhitespace = input.ignoreWhitespace === true;
  try {
    const fileDiff = parseDiffFromFile(
      oldFile,
      newFile,
      ignoreWhitespace ? { ignoreWhitespace: true } : undefined,
      true
    );
    if (
      ignoreWhitespace &&
      fileDiff.hunks.length === 0 &&
      (input.oldText ?? "") !== (input.newText ?? "")
    ) {
      return {
        detail: "",
        hint: whitespaceOnlyHint,
        kind: "fallback",
        title: whitespaceOnlyTitle,
        whitespaceOnly: true
      };
    }
    return {
      fileDiff: withDifftrayMetadata(
        fileDiff,
        input,
        ignoreWhitespace
          ? `${input.diffHash}${ignoreWhitespaceCacheSuffix}`
          : input.diffHash
      ),
      kind: "diff",
      ...(ignoreWhitespace ? { whitespaceIgnored: true as const } : {})
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
  input: CreateDiffsRenderModelInput,
  cacheKey: string
): FileDiffMetadata {
  return {
    ...fileDiff,
    cacheKey,
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

export type ReviewLineAnchor = {
  /** Last line of the comment; a range comment also sets lineStart. */
  readonly lineNumber: number;
  readonly lineStart?: number;
  readonly side: "additions" | "deletions";
};

export type WhitespaceNotice = "comments" | "partial";

export type WhitespaceDisplay = {
  readonly model: DiffsRenderModel;
  readonly notice?: WhitespaceNotice;
};

/**
 * What to draw when the viewer ignores whitespace. Comments must stay visible, so a
 * comment on a line that only changed whitespace, or a range comment that covers one,
 * brings the canonical diff back when it shows a commented line the ignored diff leaves
 * out. A comment the canonical diff would not show either (unchanged lines in an
 * expanded gap) keeps the ignored diff.
 */
export function resolveWhitespaceDisplay({
  anchors,
  canonical,
  ignored
}: {
  readonly anchors: readonly ReviewLineAnchor[];
  readonly canonical: () => DiffsRenderModel;
  readonly ignored: DiffsRenderModel;
}): WhitespaceDisplay {
  if (ignored.kind === "diff" && ignored.whitespaceIgnored !== true) {
    return { model: ignored, notice: "partial" };
  }
  if (ignored.kind === "fallback" && ignored.whitespaceOnly !== true) {
    return { model: ignored };
  }
  const hidden = anchors.filter(
    (anchor) => ignored.kind === "fallback" || !anchorInHunks(ignored.fileDiff, anchor)
  );
  if (hidden.length === 0) {
    return { model: ignored };
  }
  const canonicalModel = canonical();
  return canonicalModel.kind === "diff" &&
    hidden.some((anchor) => revealsHiddenLine(canonicalModel.fileDiff, ignored, anchor))
    ? { model: canonicalModel, notice: "comments" }
    : { model: ignored };
}

/** Whether every line of the anchor, from lineStart to lineNumber, sits in a hunk. */
function anchorInHunks(fileDiff: FileDiffMetadata, anchor: ReviewLineAnchor): boolean {
  return linesInHunks(fileDiff, anchor.side, anchorFirstLine(anchor), anchor.lineNumber);
}

/** Whether fileDiff shows a line of the anchor that the ignored model leaves out. */
function revealsHiddenLine(
  fileDiff: FileDiffMetadata,
  ignored: DiffsRenderModel,
  anchor: ReviewLineAnchor
): boolean {
  const first = anchorFirstLine(anchor);
  return fileDiff.hunks.some((hunk) => {
    const start = anchor.side === "additions" ? hunk.additionStart : hunk.deletionStart;
    const count = anchor.side === "additions" ? hunk.additionCount : hunk.deletionCount;
    const from = Math.max(start, first);
    const to = Math.min(start + count - 1, anchor.lineNumber);
    return (
      count > 0 &&
      from <= to &&
      (ignored.kind === "fallback" ||
        !linesInHunks(ignored.fileDiff, anchor.side, from, to))
    );
  });
}

function anchorFirstLine(anchor: ReviewLineAnchor): number {
  return Math.min(anchor.lineStart ?? anchor.lineNumber, anchor.lineNumber);
}

function linesInHunks(
  fileDiff: FileDiffMetadata,
  side: ReviewLineAnchor["side"],
  from: number,
  to: number
): boolean {
  let line = from;
  while (line <= to) {
    const hunkEnd = hunkEndContaining(fileDiff, side, line);
    if (hunkEnd === undefined) return false;
    line = hunkEnd;
  }
  return true;
}

/** The first line after the hunk that contains line on side, if any hunk does. */
function hunkEndContaining(
  fileDiff: FileDiffMetadata,
  side: ReviewLineAnchor["side"],
  line: number
): number | undefined {
  for (const hunk of fileDiff.hunks) {
    const start = side === "additions" ? hunk.additionStart : hunk.deletionStart;
    const count = side === "additions" ? hunk.additionCount : hunk.deletionCount;
    if (count > 0 && line >= start && line < start + count) return start + count;
  }
  return undefined;
}
