import type { FileDiffStatus, ReviewCommentView } from "@difftray/companion-protocol";
import {
  parseDiffFromFile,
  processFile,
  type DiffLineAnnotation,
  type FileContents,
  type FileDiffMetadata,
  type VirtualFileMetrics
} from "@pierre/diffs";
import type { FileDiffOptions } from "@pierre/diffs/react";

import type { DiffSurfaceDraftRange, DiffSurfaceMode } from "./surface-bridge.js";
import {
  intellijIslandsDiffTheme,
  registerIntellijIslandsDiffThemes
} from "./surface-intellij-theme.js";

export type SurfacePierreRenderModel =
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

export type SurfacePierreRenderModelInput = {
  readonly diffHash: string;
  /** Display only: the review hash stays based on the canonical patch. */
  readonly ignoreWhitespace?: boolean;
  readonly newText?: string;
  readonly oldText?: string;
  readonly patch: string;
  readonly path: string;
  readonly previousPath?: string;
  readonly status: FileDiffStatus;
};

export type SurfaceCommentDraft = DiffSurfaceDraftRange & {
  readonly body: string;
  readonly diffHash: string;
  readonly path: string;
};

export type SurfaceAnnotationMetadata =
  | {
      readonly comment: ReviewCommentView;
      readonly kind: "comment";
    }
  | {
      readonly draft: SurfaceCommentDraft;
      readonly kind: "draft";
    };

export type SurfaceLineAnnotation = DiffLineAnnotation<SurfaceAnnotationMetadata>;

const fallbackTitle = "No textual diff";
const whitespaceOnlyTitle = "Only whitespace changed";
const whitespaceOnlyHint = "Turn off ignoring whitespace to see these changes.";
const ignoreWhitespaceCacheSuffix = ":ignore-whitespace";
const maxLineDiffLength = 20_000;
const maxTokenizedLineLength = 4_000;

registerIntellijIslandsDiffThemes();

export const surfaceVirtualFileMetrics = {
  diffHeaderHeight: 0,
  hunkLineCount: 50,
  lineHeight: 22,
  paddingBottom: 48,
  paddingTop: 0,
  spacing: 8
} as const satisfies VirtualFileMetrics;

const diffSurfaceUnsafeCSS = `
[data-interactive-line-numbers] [data-column-number] {
  touch-action: pan-y !important;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}

:host {
  --diffs-font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  --diffs-header-font-family: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
  --diffs-font-size: var(--diff-surface-code-size, 13px);
  --diffs-line-height: 22px;
  --diffs-font-features: "zero" 1, "ss02" 1;
  --diffs-light: var(--diff-fg, #080808);
  --diffs-light-bg: var(--diff-bg, #ffffff);
  --diffs-dark: var(--diff-fg, #bcbec4);
  --diffs-dark-bg: var(--diff-bg, #191a1c);
  --diffs-bg-context-override: var(--diff-bg-context, #1f2024);
  --diffs-bg-context-gutter-override: var(--diff-bg-gutter, #17181a);
  --diffs-bg-buffer-override: var(--diff-bg-buffer, #202124);
  --diffs-bg-separator-override: var(--diff-bg-separator, #24262a);
  --diffs-fg-number-override: var(--diff-gutter, #4b5059);
  --diffs-fg-conflict-marker-override: var(--diff-fg-muted, #8f939d);
  --diffs-bg-hover-override: var(--diff-hover, #2e436e);
  --diffs-bg-selection-override: var(--diff-selection, #264f78);
  --diffs-bg-selection-number-override: var(--diff-selection, #264f78);
  --diffs-addition-color-override: var(--diff-add-fg, #73bd79);
  --diffs-deletion-color-override: var(--diff-del-fg, #ff7a70);
  --diffs-modified-color-override: var(--diff-modified-fg, #70aeff);
  --diffs-bg-addition-override: var(--diff-add-bg, #73bd79);
  --diffs-bg-addition-emphasis-override: var(--diff-add-bg-strong, rgba(115, 189, 121, 0.18));
  --diffs-bg-deletion-override: var(--diff-del-bg, #c6625b);
  --diffs-bg-deletion-emphasis-override: var(--diff-del-bg-strong, rgba(255, 122, 112, 0.18));
  --diffs-gap-block: 6px;
  --diffs-gap-inline: 8px;
}

/* Syntax colors (a green string on a green highlight) wash out inside changed
   words, so highlighted text uses a high-contrast shade of the change hue. */
[data-line-type="change-addition"] [data-diff-span],
[data-line-type="change-addition"] [data-diff-span] span {
  color: var(--diff-add-fg-strong, #d4f0d6);
}

[data-line-type="change-deletion"] [data-diff-span],
[data-line-type="change-deletion"] [data-diff-span] span {
  color: var(--diff-del-fg-strong, #ffd0cb);
}

/* The theme provides a finished selection tint, not an accent to dilute to 18%. */
[data-selected-line] {
  --mix-selection-light: 15%;
}

[data-overflow="scroll"] {
  --diffs-scrollbar-gutter: 0px;
}

[data-overflow="scroll"] [data-code] {
  scrollbar-width: none;
}

[data-overflow="scroll"] [data-code]::-webkit-scrollbar {
  height: 0;
}

[data-content],
[data-gutter] {
  background-color: var(--diff-bg, #191a1c);
}

[data-gutter] [data-gutter-buffer],
[data-gutter] [data-column-number] {
  border-right-color: var(--diff-bg-separator, #24262a);
}

[data-diff-type="split"][data-overflow="wrap"] [data-additions] [data-gutter],
[data-diff-type="split"][data-overflow="wrap"] [data-deletions] [data-content] {
  border-color: var(--diff-bg-separator, #24262a);
}
`;

export function createSurfacePierreRenderModel(
  input: SurfacePierreRenderModelInput
): SurfacePierreRenderModel {
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

export function createSurfaceFileDiffOptions<LAnnotation = undefined>({
  diffMode,
  onLineNumberClick,
  onLineSelectionStart,
  onLineSelectionChange,
  onLineSelectionEnd,
  resolvedTheme,
  wrapLines
}: {
  readonly diffMode: DiffSurfaceMode;
  readonly onLineNumberClick?: FileDiffOptions<
    LAnnotation,
    undefined
  >["onLineNumberClick"];
  readonly onLineSelectionStart?: FileDiffOptions<
    LAnnotation,
    undefined
  >["onLineSelectionStart"];
  readonly onLineSelectionChange?: FileDiffOptions<
    LAnnotation,
    undefined
  >["onLineSelectionChange"];
  readonly onLineSelectionEnd?: FileDiffOptions<
    LAnnotation,
    undefined
  >["onLineSelectionEnd"];
  readonly resolvedTheme: "dark" | "light";
  readonly wrapLines: boolean;
}): FileDiffOptions<LAnnotation, undefined> {
  return {
    collapsedContextThreshold: 1,
    diffIndicators: "bars",
    diffStyle: diffMode,
    disableBackground: false,
    disableFileHeader: true,
    enableLineSelection: true,
    expansionLineCount: 40,
    expandUnchanged: false,
    hunkSeparators: "line-info-basic",
    lineDiffType: "word-alt",
    lineHoverHighlight: "both",
    maxLineDiffLength,
    ...(onLineNumberClick ? { onLineNumberClick } : {}),
    ...(onLineSelectionStart ? { onLineSelectionStart } : {}),
    ...(onLineSelectionChange ? { onLineSelectionChange } : {}),
    ...(onLineSelectionEnd ? { onLineSelectionEnd } : {}),
    overflow: wrapLines ? "wrap" : "scroll",
    stickyHeader: false,
    theme: intellijIslandsDiffTheme,
    themeType: resolvedTheme,
    tokenizeMaxLineLength: maxTokenizedLineLength,
    unsafeCSS: diffSurfaceUnsafeCSS,
    useTokenTransformer: true
  };
}

/** The whole line range an annotation covers, so a range comment is checked end to end. */
export function surfaceAnnotationAnchor({
  metadata
}: SurfaceLineAnnotation): ReviewLineAnchor {
  const range = metadata.kind === "comment" ? metadata.comment : metadata.draft;
  return { lineNumber: range.lineEnd, lineStart: range.lineStart, side: range.side };
}

export function surfaceCommentAnnotations({
  comments,
  diffHash,
  draft,
  path
}: {
  readonly comments: readonly ReviewCommentView[];
  readonly diffHash: string;
  readonly draft: DiffSurfaceDraftRange | null;
  readonly path: string;
}): SurfaceLineAnnotation[] {
  return [
    ...comments
      .filter((comment) => comment.diffHash === diffHash && comment.path === path)
      .map((comment) => ({
        lineNumber: comment.lineEnd,
        metadata: {
          comment,
          kind: "comment" as const
        },
        side: comment.side
      })),
    ...(draft
      ? [
          {
            lineNumber: draft.lineEnd,
            metadata: {
              draft: {
                body: "",
                diffHash,
                lineEnd: draft.lineEnd,
                lineStart: draft.lineStart,
                path,
                side: draft.side
              },
              kind: "draft" as const
            },
            side: draft.side
          }
        ]
      : [])
  ];
}

export function surfaceAnnotationLocation({
  lineEnd,
  lineStart,
  side
}: {
  readonly lineEnd: number;
  readonly lineStart: number;
  readonly side: "additions" | "deletions";
}): string {
  const sideLabel = side === "additions" ? "New" : "Old";
  const lineLabel = lineStart === lineEnd ? "line" : "lines";
  const lineRange =
    lineStart === lineEnd ? String(lineStart) : `${String(lineStart)}-${String(lineEnd)}`;

  return `${sideLabel} ${lineLabel} ${lineRange}`;
}

function createFullSnapshotModel(
  input: SurfacePierreRenderModelInput
): SurfacePierreRenderModel | undefined {
  if (!hasFullSnapshotPair(input)) {
    return undefined;
  }

  const previousPath = input.previousPath ?? previousPathFromPatch(input.patch);
  const oldFile = fileContents({
    cacheKey: `${input.diffHash}:old`,
    contents: input.oldText ?? "",
    name: previousPath ?? input.path
  });
  const newFile = fileContents({
    cacheKey: `${input.diffHash}:new`,
    contents: input.newText ?? "",
    name: input.path
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
        {
          ...input,
          ...(previousPath ? { previousPath } : {})
        },
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

function hasFullSnapshotPair(input: SurfacePierreRenderModelInput): boolean {
  const hasOldSide = input.oldText !== undefined || input.status === "added";
  const hasNewSide = input.newText !== undefined || input.status === "deleted";

  return hasOldSide && hasNewSide;
}

function fileContents(input: FileContents): FileContents {
  return input;
}

function withDifftrayMetadata(
  fileDiff: FileDiffMetadata,
  input: SurfacePierreRenderModelInput,
  cacheKey: string
): FileDiffMetadata {
  return {
    ...fileDiff,
    cacheKey,
    name: input.path,
    ...(input.previousPath ? { prevName: input.previousPath } : {}),
    type: fileDiff.isPartial ? fileDiff.type : changeTypeForStatus(input.status, fileDiff)
  };
}

function changeTypeForStatus(
  status: FileDiffStatus,
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

function previousPathFromPatch(patch: string): string | undefined {
  return /^rename from (.+)$/m.exec(patch)?.[1];
}

function isNonTextSummary(patch: string): boolean {
  return (
    /^Binary file changed /m.test(patch) ||
    /^Mode changed:/m.test(patch) ||
    /^Submodule changed:/m.test(patch) ||
    /^Symlink changed:/m.test(patch)
  );
}

function fallbackModel(detail: string): SurfacePierreRenderModel {
  return {
    detail,
    kind: "fallback",
    title: fallbackTitle
  };
}

export type ReviewLineAnchor = {
  /** Last line of the comment; a range comment also sets lineStart. */
  readonly lineNumber: number;
  readonly lineStart?: number;
  readonly side: "additions" | "deletions";
};

export type WhitespaceNotice = "comments" | "partial";

export type WhitespaceDisplay = {
  readonly model: SurfacePierreRenderModel;
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
  readonly canonical: () => SurfacePierreRenderModel;
  readonly ignored: SurfacePierreRenderModel;
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
  ignored: SurfacePierreRenderModel,
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
