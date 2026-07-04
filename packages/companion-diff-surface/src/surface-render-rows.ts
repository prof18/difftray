import { parsePatch } from "diff";

export type SurfaceContextRow = {
  readonly kind: "context";
  readonly newLineNumber: number;
  readonly oldLineNumber: number;
  readonly text: string;
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
  | SurfaceContextRow
  | {
      readonly kind: "hunk";
      readonly text: string;
    }
  | {
      readonly key: string;
      readonly kind: "context_expander";
      readonly lineCount: number;
      readonly rows: readonly SurfaceContextRow[];
    };

export function parsePatchRows({
  newText,
  oldText,
  patch
}: {
  readonly newText?: string;
  readonly oldText?: string;
  readonly patch: string;
}): {
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

  const oldLines = oldText === undefined ? null : splitTextLines(oldText);
  const newLines = newText === undefined ? null : splitTextLines(newText);

  for (const filePatch of filePatches) {
    let oldContextCursor = 1;
    let newContextCursor = 1;

    for (const hunk of filePatch.hunks) {
      const omittedContext = contextExpander({
        newLineStart: newContextCursor,
        newLines,
        newUntil: hunk.newStart,
        oldLines,
        oldLineStart: oldContextCursor,
        oldUntil: hunk.oldStart
      });

      if (omittedContext) {
        rows.push(omittedContext);
      }

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

      oldContextCursor = oldLineNumber;
      newContextCursor = newLineNumber;
    }

    const trailingContext = contextExpander({
      newLineStart: newContextCursor,
      newLines,
      newUntil: (newLines?.length ?? 0) + 1,
      oldLines,
      oldLineStart: oldContextCursor,
      oldUntil: (oldLines?.length ?? 0) + 1
    });

    if (trailingContext) {
      rows.push(trailingContext);
    }
  }

  return { additions, deletions, rows };
}

export function splitTextLines(text: string): readonly string[] {
  return text.length === 0 ? [] : (text.match(/[^\n]*\n|[^\n]+$/g) ?? []);
}

function contextExpander({
  newLines,
  newLineStart,
  newUntil,
  oldLines,
  oldLineStart,
  oldUntil
}: {
  readonly newLines: readonly string[] | null;
  readonly newLineStart: number;
  readonly newUntil: number;
  readonly oldLines: readonly string[] | null;
  readonly oldLineStart: number;
  readonly oldUntil: number;
}): SurfaceDiffRow | null {
  if (!oldLines || !newLines) {
    return null;
  }

  const oldLineCount = oldUntil - oldLineStart;
  const newLineCount = newUntil - newLineStart;
  const lineCount = Math.min(oldLineCount, newLineCount);

  if (lineCount <= 0) {
    return null;
  }

  const rows = Array.from({ length: lineCount }, (_, index) => ({
    kind: "context" as const,
    newLineNumber: newLineStart + index,
    oldLineNumber: oldLineStart + index,
    text: lineText(newLines[newLineStart + index - 1] ?? "")
  }));

  return {
    key: `${String(oldLineStart)}:${String(newLineStart)}:${String(lineCount)}`,
    kind: "context_expander",
    lineCount,
    rows
  };
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

function lineText(line: string): string {
  return line.endsWith("\n") ? line.slice(0, -1) : line;
}
