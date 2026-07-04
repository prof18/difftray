import type {
  FileDiffStatus,
  ReviewCommentSide,
  ReviewCommentView
} from "@difftray/companion-protocol";
import { parsePatch } from "diff";

import type { DiffSurfaceDraftRange, DiffSurfaceMode } from "./surface-bridge.js";

export type SurfaceRenderModelInput = {
  readonly diffHash: string;
  readonly newText?: string;
  readonly oldText?: string;
  readonly patch: string;
  readonly path: string;
};

export type SurfaceDiffRow =
  | {
      readonly kind: "addition";
      readonly newLineNumber: number;
      readonly text: string;
    }
  | {
      readonly kind: "deletion";
      readonly oldLineNumber: number;
      readonly text: string;
    }
  | {
      readonly kind: "context";
      readonly newLineNumber: number;
      readonly oldLineNumber: number;
      readonly text: string;
    }
  | {
      readonly kind: "hunk";
      readonly text: string;
    };

export type SurfaceFileDiff = {
  readonly additionLines: readonly string[];
  readonly cacheKey: string;
  readonly deletionLines: readonly string[];
  readonly isPartial: boolean;
  readonly name: string;
  readonly rows: readonly SurfaceDiffRow[];
  readonly type: "change" | "deleted" | "new" | "rename-changed" | "rename-pure";
};

export type SurfaceRenderModel =
  | {
      readonly fileDiff: SurfaceFileDiff;
      readonly kind: "diff";
    }
  | {
      readonly detail: string;
      readonly kind: "fallback";
      readonly title: string;
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

export type SurfaceLineAnnotation = {
  readonly lineNumber: number;
  readonly metadata: SurfaceAnnotationMetadata;
  readonly side: ReviewCommentSide;
};

export function createSurfaceRenderModel(
  input: SurfaceRenderModelInput
): SurfaceRenderModel {
  if (isNonTextSummary(input.patch)) {
    return fallbackModel(input.patch);
  }

  const parsedRows = parsePatchRows(input.patch);

  if (parsedRows.rows.length === 0) {
    return fallbackModel(input.patch);
  }

  const status = statusFromPatch(input.patch);

  return {
    fileDiff: {
      additionLines: input.newText ? splitTextLines(input.newText) : parsedRows.additions,
      cacheKey: input.diffHash,
      deletionLines: input.oldText ? splitTextLines(input.oldText) : parsedRows.deletions,
      isPartial: input.newText === undefined || input.oldText === undefined,
      name: input.path,
      rows: parsedRows.rows,
      type: changeTypeForStatus(status, parsedRows.rows)
    },
    kind: "diff"
  };
}

export function createSurfaceFileDiffOptions({
  diffMode,
  resolvedTheme,
  wrapLines
}: {
  readonly diffMode: DiffSurfaceMode;
  readonly resolvedTheme: "dark" | "light";
  readonly wrapLines: boolean;
}): {
  readonly diffMode: DiffSurfaceMode;
  readonly resolvedTheme: "dark" | "light";
  readonly wrapLines: boolean;
} {
  return { diffMode, resolvedTheme, wrapLines };
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
  readonly side: ReviewCommentSide;
}): string {
  const sideLabel = side === "additions" ? "New" : "Old";
  const lineLabel = lineStart === lineEnd ? "line" : "lines";
  const lineRange =
    lineStart === lineEnd ? String(lineStart) : `${String(lineStart)}-${String(lineEnd)}`;

  return `${sideLabel} ${lineLabel} ${lineRange}`;
}

function parsePatchRows(patch: string): {
  readonly additions: readonly string[];
  readonly deletions: readonly string[];
  readonly rows: readonly SurfaceDiffRow[];
} {
  const additions: string[] = [];
  const deletions: string[] = [];
  const rows: SurfaceDiffRow[] = [];

  let filePatches: ReturnType<typeof parsePatch>;

  try {
    filePatches = parsePatch(patch);
  } catch {
    return { additions, deletions, rows };
  }

  for (const filePatch of filePatches) {
    for (const hunk of filePatch.hunks) {
      let oldLineNumber = hunk.oldStart;
      let newLineNumber = hunk.newStart;

      rows.push({ kind: "hunk", text: hunkHeaderText(hunk) });

      for (const line of hunk.lines) {
        if (line.startsWith("+")) {
          rows.push({ kind: "addition", newLineNumber, text: line.slice(1) });
          additions.push(`${line.slice(1)}\n`);
          newLineNumber += 1;
          continue;
        }

        if (line.startsWith("-")) {
          rows.push({ kind: "deletion", oldLineNumber, text: line.slice(1) });
          deletions.push(`${line.slice(1)}\n`);
          oldLineNumber += 1;
          continue;
        }

        if (line.startsWith(" ")) {
          rows.push({
            kind: "context",
            newLineNumber,
            oldLineNumber,
            text: line.slice(1)
          });
          additions.push(`${line.slice(1)}\n`);
          deletions.push(`${line.slice(1)}\n`);
          oldLineNumber += 1;
          newLineNumber += 1;
        }
      }
    }
  }

  return { additions, deletions, rows };
}

function hunkHeaderText({
  newLines,
  newStart,
  oldLines,
  oldStart
}: {
  readonly newLines: number;
  readonly newStart: number;
  readonly oldLines: number;
  readonly oldStart: number;
}): string {
  return `@@ -${hunkRange(oldStart, oldLines)} +${hunkRange(newStart, newLines)} @@`;
}

function hunkRange(start: number, lineCount: number): string {
  return lineCount === 1 ? String(start) : `${String(start)},${String(lineCount)}`;
}

function splitTextLines(text: string): readonly string[] {
  return text.length === 0 ? [] : (text.match(/[^\n]*\n|[^\n]+$/g) ?? []);
}

function statusFromPatch(patch: string): FileDiffStatus {
  if (/^(?:new file mode|--- \/dev\/null$)/m.test(patch)) {
    return "added";
  }

  if (/^(?:deleted file mode|\+\+\+ \/dev\/null$)/m.test(patch)) {
    return "deleted";
  }

  if (/^rename from /m.test(patch) || /^rename to /m.test(patch)) {
    return "renamed";
  }

  if (/^old mode /m.test(patch) || /^new mode /m.test(patch)) {
    return "mode_changed";
  }

  return "modified";
}

function changeTypeForStatus(
  status: FileDiffStatus,
  rows: readonly SurfaceDiffRow[]
): SurfaceFileDiff["type"] {
  switch (status) {
    case "added":
      return "new";
    case "deleted":
      return "deleted";
    case "renamed":
      return rows.some((row) => row.kind === "addition" || row.kind === "deletion")
        ? "rename-changed"
        : "rename-pure";
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

function fallbackModel(detail: string): SurfaceRenderModel {
  return {
    detail,
    kind: "fallback",
    title: "No textual diff"
  };
}
