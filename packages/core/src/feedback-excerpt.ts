import type { ReviewCommentReportContextLine, ReviewCommentSide } from "./index.js";

export const EXCERPT_VERSION = 1;
export const EXCERPT_CONTEXT_LINES = 3;
export const EXCERPT_MAX_LINES = 40;
export const EXCERPT_MAX_LINE_CHARS = 400;
export const NOTE_EXCERPT_MAX_PATHS = 100;

export const learnStatuses = [
  "active",
  "target_changed",
  "diff_changed",
  "dismissed"
] as const;
export type LearnStatus = (typeof learnStatuses)[number];

export const learnExcerptSources = [
  "saved",
  "recovered",
  "approximate",
  "unavailable",
  "not_looked_up"
] as const;
export type LearnExcerptSource = (typeof learnExcerptSources)[number];

export type FeedbackExcerptFile = {
  readonly path: string;
  readonly additions: number;
  readonly deletions: number;
};

export type FeedbackExcerpt =
  | {
      readonly version: 1;
      readonly kind: "lines";
      readonly side: ReviewCommentSide;
      readonly lines: readonly ReviewCommentReportContextLine[];
      readonly truncated: boolean;
    }
  | {
      readonly version: 1;
      readonly kind: "patch";
      readonly lines: readonly string[];
      readonly truncated: boolean;
    }
  | {
      readonly version: 1;
      readonly kind: "files";
      readonly files: readonly FeedbackExcerptFile[];
      readonly omittedFiles: number;
    };

export type BuildLineExcerptInput = {
  readonly side: ReviewCommentSide;
  readonly lineStart: number;
  readonly lineEnd: number;
  readonly text: string;
  readonly maxLines: number;
  readonly maxLineChars?: number;
};

export function buildLineExcerpt(
  input: BuildLineExcerptInput
): Extract<FeedbackExcerpt, { kind: "lines" }> | null {
  const lines = splitTextLines(input.text);

  if (input.lineStart > lines.length) {
    return null;
  }

  const maxLineChars = input.maxLineChars ?? EXCERPT_MAX_LINE_CHARS;
  const spanStart = Math.max(1, input.lineStart - EXCERPT_CONTEXT_LINES);
  const spanEnd = Math.min(lines.length, input.lineEnd + EXCERPT_CONTEXT_LINES);
  const spanLength = spanEnd - spanStart + 1;
  const keptLength = Math.min(spanLength, input.maxLines);
  let truncated = keptLength < spanLength;
  const excerptLines = Array.from({ length: keptLength }, (_, index) => {
    const lineNumber = spanStart + index;
    const line = cutLine(lines[lineNumber - 1] ?? "", maxLineChars);
    truncated ||= line.cut;

    return {
      kind:
        lineNumber >= input.lineStart && lineNumber <= input.lineEnd
          ? ("commented" as const)
          : ("context" as const),
      lineNumber,
      text: line.text
    };
  });

  return {
    version: EXCERPT_VERSION,
    kind: "lines",
    side: input.side,
    lines: excerptLines,
    truncated
  };
}

export function buildPatchExcerpt(
  patch: string,
  maxLineChars: number = EXCERPT_MAX_LINE_CHARS
): Extract<FeedbackExcerpt, { kind: "patch" }> | null {
  const lines = splitTextLines(patch);
  const firstHunk = lines.findIndex((line) => line.startsWith("@@"));

  if (firstHunk < 0) {
    return null;
  }

  const hunkLines = lines.slice(firstHunk);
  let truncated = hunkLines.length > EXCERPT_MAX_LINES;
  const kept = hunkLines.slice(0, EXCERPT_MAX_LINES).map((line) => {
    const cut = cutLine(line, maxLineChars);
    truncated ||= cut.cut;
    return cut.text;
  });

  return { version: EXCERPT_VERSION, kind: "patch", lines: kept, truncated };
}

export function buildFilesExcerpt(
  files: readonly FeedbackExcerptFile[]
): Extract<FeedbackExcerpt, { kind: "files" }> {
  const sorted = [...files].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0
  );

  return {
    version: EXCERPT_VERSION,
    kind: "files",
    files: sorted.slice(0, NOTE_EXCERPT_MAX_PATHS).map((file) => ({
      path: file.path,
      additions: file.additions,
      deletions: file.deletions
    })),
    omittedFiles: Math.max(0, sorted.length - NOTE_EXCERPT_MAX_PATHS)
  };
}

export function parseFeedbackExcerpt(
  json: string | null | undefined
): FeedbackExcerpt | null {
  if (json === null || json === undefined) {
    return null;
  }

  let value: unknown;

  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }

  if (!isRecord(value) || value.version !== EXCERPT_VERSION) {
    return null;
  }

  switch (value.kind) {
    case "lines": {
      const { lines, side, truncated } = value;
      if (
        (side !== "additions" && side !== "deletions") ||
        typeof truncated !== "boolean" ||
        !Array.isArray(lines) ||
        !lines.every(isContextLine)
      )
        return null;
      return {
        version: EXCERPT_VERSION,
        kind: "lines",
        side,
        lines: lines.map((line) => ({
          kind: line.kind,
          lineNumber: line.lineNumber,
          text: line.text
        })),
        truncated
      };
    }
    case "patch": {
      const { lines, truncated } = value;
      if (
        typeof truncated !== "boolean" ||
        !Array.isArray(lines) ||
        !lines.every((line) => typeof line === "string")
      )
        return null;
      return { version: EXCERPT_VERSION, kind: "patch", lines, truncated };
    }
    case "files": {
      const { files, omittedFiles } = value;
      if (!isCount(omittedFiles) || !Array.isArray(files) || !files.every(isExcerptFile))
        return null;
      return {
        version: EXCERPT_VERSION,
        kind: "files",
        files: files.map((file) => ({
          path: file.path,
          additions: file.additions,
          deletions: file.deletions
        })),
        omittedFiles
      };
    }
    default:
      return null;
  }
}

function splitTextLines(text: string): readonly string[] {
  if (text.length === 0) {
    return [];
  }

  const lines = text.split("\n");

  return lines.at(-1) === "" ? lines.slice(0, -1) : lines;
}

function cutLine(
  line: string,
  maxLineChars: number
): { readonly cut: boolean; readonly text: string } {
  if (line.length <= maxLineChars) {
    return { cut: false, text: line };
  }

  let text = line.slice(0, maxLineChars);
  const last = text.charCodeAt(text.length - 1);

  // Never keep half of a surrogate pair.
  if (last >= 0xd800 && last <= 0xdbff) {
    text = text.slice(0, -1);
  }

  return { cut: true, text };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isContextLine(value: unknown): value is ReviewCommentReportContextLine {
  return (
    isRecord(value) &&
    (value.kind === "commented" || value.kind === "context") &&
    typeof value.lineNumber === "number" &&
    Number.isInteger(value.lineNumber) &&
    value.lineNumber >= 1 &&
    typeof value.text === "string"
  );
}

function isExcerptFile(value: unknown): value is FeedbackExcerptFile {
  return (
    isRecord(value) &&
    typeof value.path === "string" &&
    isCount(value.additions) &&
    isCount(value.deletions)
  );
}
