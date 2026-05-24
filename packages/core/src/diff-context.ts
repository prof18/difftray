export type ParsedDiffLine = {
  readonly key: string;
  readonly kind: "added" | "context" | "deleted";
  readonly newNumber: number | undefined;
  readonly oldNumber: number | undefined;
  readonly text: string;
};

export type ParsedDiffHunkSegment = {
  readonly header: string;
  readonly key: string;
  readonly kind: "hunk";
  readonly lines: readonly ParsedDiffLine[];
};

export type CollapsedDiffContextSegment = {
  readonly key: string;
  readonly kind: "collapsed_context";
  readonly lineCount: number;
  readonly lines: readonly ParsedDiffLine[];
  readonly newStart: number | undefined;
  readonly oldStart: number | undefined;
};

export type ParsedDiffSegment = CollapsedDiffContextSegment | ParsedDiffHunkSegment;

export type ParseDiffSegmentsInput = {
  readonly newText?: string;
  readonly oldText?: string;
  readonly patch: string;
};

export function parseDiffSegments(
  input: ParseDiffSegmentsInput
): readonly ParsedDiffSegment[] {
  const hunks = parsePatchHunks(input.patch);

  if (hunks.length === 0) {
    return [{ header: "No textual diff", key: "empty", kind: "hunk", lines: [] }];
  }

  const oldLines = input.oldText ? splitTextLines(input.oldText) : undefined;
  const newLines = input.newText ? splitTextLines(input.newText) : undefined;

  if (!oldLines && !newLines) {
    return hunks.map(publicHunkSegment);
  }

  const segments: ParsedDiffSegment[] = [];
  let nextOldLine = 1;
  let nextNewLine = 1;

  for (const hunk of hunks) {
    const collapsedContext = createCollapsedContextSegment({
      key: `context-before-${hunk.key}`,
      newEnd: hunk.newStart,
      newLines,
      newStart: nextNewLine,
      oldEnd: hunk.oldStart,
      oldLines,
      oldStart: nextOldLine
    });

    if (collapsedContext) {
      segments.push(collapsedContext);
    }

    segments.push(publicHunkSegment(hunk));
    nextOldLine = hunk.oldEnd ?? nextOldLine;
    nextNewLine = hunk.newEnd ?? nextNewLine;
  }

  const trailingContext = createCollapsedContextSegment({
    key: "context-after-last-hunk",
    newEnd: newLines ? newLines.length + 1 : undefined,
    newLines,
    newStart: nextNewLine,
    oldEnd: oldLines ? oldLines.length + 1 : undefined,
    oldLines,
    oldStart: nextOldLine
  });

  if (trailingContext) {
    segments.push(trailingContext);
  }

  return segments;
}

type InternalParsedDiffHunk = ParsedDiffHunkSegment & {
  readonly newEnd: number | undefined;
  readonly newStart: number | undefined;
  readonly oldEnd: number | undefined;
  readonly oldStart: number | undefined;
};

function parsePatchHunks(patch: string): readonly InternalParsedDiffHunk[] {
  const hunks: InternalParsedDiffHunk[] = [];
  let current:
    | {
        header: string;
        lines: ParsedDiffLine[];
        newStart: number | undefined;
        oldStart: number | undefined;
      }
    | undefined;
  let oldLine: number | undefined;
  let newLine: number | undefined;

  function pushCurrent(): void {
    if (!current) {
      return;
    }

    hunks.push({
      header: current.header,
      key: `${String(hunks.length)}-${current.header}`,
      kind: "hunk",
      lines: current.lines,
      newEnd: newLine,
      newStart: current.newStart,
      oldEnd: oldLine,
      oldStart: current.oldStart
    });
  }

  for (const [index, line] of patch.split("\n").entries()) {
    if (line.startsWith("diff --git") || line.startsWith("index ")) {
      continue;
    }

    if (line.startsWith("@@")) {
      pushCurrent();

      const parsedHeader =
        /^@@ -(?<oldStart>\d+)(?:,\d+)? \+(?<newStart>\d+)(?:,\d+)? @@/.exec(line);
      const oldStart = parsedHeader?.groups?.oldStart
        ? Number(parsedHeader.groups.oldStart)
        : undefined;
      const newStart = parsedHeader?.groups?.newStart
        ? Number(parsedHeader.groups.newStart)
        : undefined;
      oldLine = oldStart && oldStart > 0 ? oldStart : undefined;
      newLine = newStart && newStart > 0 ? newStart : undefined;
      current = {
        header: line,
        lines: [],
        newStart: newLine,
        oldStart: oldLine
      };
      continue;
    }

    if (
      line.startsWith("---") ||
      line.startsWith("+++") ||
      line.startsWith("\\ No newline at end of file")
    ) {
      continue;
    }

    current ??= {
      header: "File summary",
      lines: [],
      newStart: undefined,
      oldStart: undefined
    };

    if (line.startsWith("+")) {
      current.lines.push({
        key: `${String(index)}-${line}`,
        kind: "added",
        newNumber: newLine,
        oldNumber: undefined,
        text: line.slice(1)
      });
      newLine = incrementLine(newLine);
      continue;
    }

    if (line.startsWith("-")) {
      current.lines.push({
        key: `${String(index)}-${line}`,
        kind: "deleted",
        newNumber: undefined,
        oldNumber: oldLine,
        text: line.slice(1)
      });
      oldLine = incrementLine(oldLine);
      continue;
    }

    current.lines.push({
      key: `${String(index)}-${line}`,
      kind: "context",
      newNumber: newLine,
      oldNumber: oldLine,
      text: line.startsWith(" ") ? line.slice(1) : line
    });
    oldLine = incrementLine(oldLine);
    newLine = incrementLine(newLine);
  }

  pushCurrent();

  return hunks;
}

function publicHunkSegment(hunk: InternalParsedDiffHunk): ParsedDiffHunkSegment {
  return {
    header: hunk.header,
    key: hunk.key,
    kind: "hunk",
    lines: hunk.lines
  };
}

function createCollapsedContextSegment({
  key,
  newEnd,
  newLines,
  newStart,
  oldEnd,
  oldLines,
  oldStart
}: {
  readonly key: string;
  readonly newEnd: number | undefined;
  readonly newLines: readonly string[] | undefined;
  readonly newStart: number | undefined;
  readonly oldEnd: number | undefined;
  readonly oldLines: readonly string[] | undefined;
  readonly oldStart: number | undefined;
}): CollapsedDiffContextSegment | undefined {
  const oldLineCount =
    oldLines && oldEnd !== undefined && oldStart !== undefined
      ? oldEnd - oldStart
      : undefined;
  const newLineCount =
    newLines && newEnd !== undefined && newStart !== undefined
      ? newEnd - newStart
      : undefined;
  const lineCount = Math.max(
    0,
    Math.min(oldLineCount ?? newLineCount ?? 0, newLineCount ?? oldLineCount ?? 0)
  );

  if (lineCount <= 0) {
    return undefined;
  }

  const lines = Array.from({ length: lineCount }, (_, index) => {
    const oldNumber = oldLines && oldStart !== undefined ? oldStart + index : undefined;
    const newNumber = newLines && newStart !== undefined ? newStart + index : undefined;

    return {
      key: `context-${String(oldNumber ?? "none")}-${String(newNumber ?? "none")}`,
      kind: "context" as const,
      newNumber,
      oldNumber,
      text:
        (newNumber ? newLines?.[newNumber - 1] : undefined) ??
        (oldNumber ? oldLines?.[oldNumber - 1] : undefined) ??
        ""
    };
  });

  return {
    key,
    kind: "collapsed_context",
    lineCount,
    lines,
    newStart,
    oldStart
  };
}

function splitTextLines(text: string): readonly string[] {
  const lines = text.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");

  return lines.at(-1) === "" ? lines.slice(0, -1) : lines;
}

function incrementLine(line: number | undefined): number | undefined {
  return line === undefined ? undefined : line + 1;
}
