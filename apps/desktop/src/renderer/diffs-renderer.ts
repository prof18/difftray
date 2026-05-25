import {
  parseDiffFromFile,
  processFile,
  type FileContents,
  type FileDiffMetadata,
  type FileDiffOptions,
  type ThemesType,
  type VirtualFileMetrics
} from "@pierre/diffs";
import {
  type WorkerInitializationRenderOptions,
  type WorkerPoolOptions
} from "@pierre/diffs/worker";

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
};

const fallbackTitle = "No textual diff";
const maxTokenizedLineLength = 4_000;
const maxLineDiffLength = 20_000;
const workerPoolSize = 2;

const diffsThemes: ThemesType = {
  dark: "github-dark",
  light: "github-light"
};

export const diffsVirtualFileMetrics = {
  diffHeaderHeight: 0,
  hunkLineCount: 50,
  lineHeight: 20,
  paddingBottom: 48,
  paddingTop: 0,
  spacing: 8
} as const satisfies VirtualFileMetrics;

export const diffsWorkerHighlighterOptions = {
  lineDiffType: "word",
  maxLineDiffLength,
  preferredHighlighter: "shiki-js",
  theme: diffsThemes,
  tokenizeMaxLineLength: maxTokenizedLineLength,
  useTokenTransformer: true
} as const satisfies WorkerInitializationRenderOptions;

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
  resolvedTheme
}: CreateDiffsFileDiffOptionsInput): FileDiffOptions<undefined> {
  return {
    collapsedContextThreshold: 1,
    diffIndicators: "classic",
    diffStyle: diffMode,
    disableBackground: false,
    disableFileHeader: true,
    expansionLineCount: 40,
    expandUnchanged: false,
    hunkSeparators: "line-info-basic",
    lineDiffType: "word",
    maxLineDiffLength,
    overflow: "scroll",
    stickyHeader: false,
    theme: diffsThemes,
    themeType: resolvedTheme,
    tokenizeMaxLineLength: maxTokenizedLineLength,
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
