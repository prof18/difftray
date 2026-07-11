import type { FileDiffStatus, ReviewCommentView } from "@difftray/companion-protocol";
import {
  parseDiffFromFile,
  processFile,
  type DiffLineAnnotation,
  type FileContents,
  type FileDiffMetadata,
  type FileDiffOptions,
  type VirtualFileMetrics
} from "@pierre/diffs";

import type { DiffSurfaceDraftRange, DiffSurfaceMode } from "./surface-bridge.js";
import {
  intellijIslandsDiffTheme,
  registerIntellijIslandsDiffThemes
} from "./surface-intellij-theme.js";

export type SurfacePierreRenderModel =
  | {
      readonly fileDiff: FileDiffMetadata;
      readonly kind: "diff";
    }
  | {
      readonly detail: string;
      readonly kind: "fallback";
      readonly title: string;
    };

export type SurfacePierreRenderModelInput = {
  readonly diffHash: string;
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
  --diffs-deletion-color-override: var(--diff-del-fg, #cd3131);
  --diffs-modified-color-override: var(--diff-modified-fg, #70aeff);
  --diffs-bg-addition-override: var(--diff-add-bg, rgba(115, 189, 121, 0.14));
  --diffs-bg-addition-emphasis-override: var(--diff-add-bg-strong, rgba(115, 189, 121, 0.24));
  --diffs-bg-deletion-override: var(--diff-del-bg, rgba(205, 49, 49, 0.14));
  --diffs-bg-deletion-emphasis-override: var(--diff-del-bg-strong, rgba(205, 49, 49, 0.24));
  --diffs-gap-block: 6px;
  --diffs-gap-inline: 8px;
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
        fileDiff: withDifftrayMetadata(fileDiff, input),
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
  onLineSelected,
  resolvedTheme,
  wrapLines
}: {
  readonly diffMode: DiffSurfaceMode;
  readonly onLineNumberClick?: FileDiffOptions<LAnnotation>["onLineNumberClick"];
  readonly onLineSelected?: FileDiffOptions<LAnnotation>["onLineSelected"];
  readonly resolvedTheme: "dark" | "light";
  readonly wrapLines: boolean;
}): FileDiffOptions<LAnnotation> {
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
    ...(onLineSelected ? { onLineSelected } : {}),
    overflow: wrapLines ? "wrap" : "scroll",
    stickyHeader: false,
    theme: intellijIslandsDiffTheme,
    themeType: resolvedTheme,
    tokenizeMaxLineLength: maxTokenizedLineLength,
    unsafeCSS: diffSurfaceUnsafeCSS,
    useTokenTransformer: true
  };
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

  try {
    return {
      fileDiff: withDifftrayMetadata(
        parseDiffFromFile(oldFile, newFile, undefined, true),
        {
          ...input,
          ...(previousPath ? { previousPath } : {})
        }
      ),
      kind: "diff"
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
  input: SurfacePierreRenderModelInput
): FileDiffMetadata {
  return {
    ...fileDiff,
    cacheKey: input.diffHash,
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
