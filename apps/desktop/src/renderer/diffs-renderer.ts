import {
  parseDiffFromFile,
  processFile,
  type FileContents,
  type FileDiffMetadata,
  type FileDiffOptions,
  type VirtualFileMetrics
} from "@pierre/diffs";
import {
  type WorkerInitializationRenderOptions,
  type WorkerPoolOptions
} from "@pierre/diffs/worker";

import {
  intellijIslandsDiffTheme,
  registerIntellijIslandsDiffThemes
} from "./intellij-islands-diff-theme.js";

export { intellijIslandsDiffTheme };

export type CreateDiffsRenderModelInput = {
  readonly diffHash: string;
  readonly filePath: string;
  readonly newText?: string;
  readonly oldText?: string;
  readonly patch: string;
  readonly previousPath?: string;
  readonly status: ReviewFileView["status"];
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

export type CreateDiffsFileDiffOptionsInput = {
  readonly diffMode: "split" | "unified";
  readonly resolvedTheme: "dark" | "light";
  readonly wrapLines: boolean;
};

const fallbackTitle = "No textual diff";
const maxTokenizedLineLength = 4_000;
const maxLineDiffLength = 20_000;
const workerPoolSize = 2;

registerIntellijIslandsDiffThemes();

export const diffsVirtualFileMetrics = {
  diffHeaderHeight: 0,
  hunkLineCount: 50,
  lineHeight: 22,
  paddingBottom: 48,
  paddingTop: 0,
  spacing: 8
} as const satisfies VirtualFileMetrics;

export const diffsWorkerHighlighterOptions = {
  lineDiffType: "word-alt",
  maxLineDiffLength,
  preferredHighlighter: "shiki-js",
  theme: intellijIslandsDiffTheme,
  tokenizeMaxLineLength: maxTokenizedLineLength,
  useTokenTransformer: true
} as const satisfies WorkerInitializationRenderOptions;

const difftrayDiffUnsafeCSS = `
:host {
  --diffs-font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  --diffs-header-font-family: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
  --diffs-font-size: 13px;
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

export function createDiffsFileDiffOptions({
  diffMode,
  resolvedTheme,
  wrapLines
}: CreateDiffsFileDiffOptionsInput): FileDiffOptions<undefined> {
  return {
    collapsedContextThreshold: 1,
    diffIndicators: "bars",
    diffStyle: diffMode,
    disableBackground: false,
    disableFileHeader: true,
    expansionLineCount: 40,
    expandUnchanged: false,
    hunkSeparators: "line-info-basic",
    lineDiffType: "word-alt",
    maxLineDiffLength,
    overflow: wrapLines ? "wrap" : "scroll",
    stickyHeader: false,
    theme: intellijIslandsDiffTheme,
    themeType: resolvedTheme,
    tokenizeMaxLineLength: maxTokenizedLineLength,
    unsafeCSS: difftrayDiffUnsafeCSS,
    useTokenTransformer: true
  };
}

export function createDiffsWorkerPoolOptions(): WorkerPoolOptions {
  return {
    poolSize: workerPoolSize,
    workerFactory: () =>
      new Worker(new URL("@pierre/diffs/worker/worker.js", import.meta.url), {
        type: "module"
      })
  };
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
