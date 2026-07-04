import type { DiffSurfaceMessage, DiffSurfaceSide } from "./surface-bridge.js";
import type { SurfaceDiffRow } from "./surface-render-model.js";

type SelectableSurfaceDiffRow = Exclude<
  SurfaceDiffRow,
  { readonly kind: "context_expander" }
>;

export function serializeSurfaceMessage(message: DiffSurfaceMessage): string {
  return JSON.stringify(message);
}

export function createRenderedMessage({
  endMs,
  path,
  startMs
}: {
  readonly endMs: number;
  readonly path: string;
  readonly startMs: number;
}): DiffSurfaceMessage {
  return {
    kind: "rendered",
    path,
    renderMs: Math.max(0, Math.round((endMs - startMs) * 10) / 10)
  };
}

export function createCommentTappedMessage(commentId: string): DiffSurfaceMessage {
  return {
    commentId,
    kind: "comment_tapped"
  };
}

export function createLineSelectedMessage(
  row: SelectableSurfaceDiffRow
): DiffSurfaceMessage | null {
  const selection = lineSelectionForRow(row);

  if (!selection) {
    return null;
  }

  return {
    kind: "line_selected",
    lineEnd: selection.lineNumber,
    lineStart: selection.lineNumber,
    side: selection.side,
    snippet: [{ lineNumber: selection.lineNumber, text: row.text }]
  };
}

export function createLineSelectedMessageForSide(
  row: SelectableSurfaceDiffRow,
  side: DiffSurfaceSide
): DiffSurfaceMessage | null {
  const selection = lineSelectionForRowSide(row, side);

  if (!selection) {
    return null;
  }

  return {
    kind: "line_selected",
    lineEnd: selection.lineNumber,
    lineStart: selection.lineNumber,
    side: selection.side,
    snippet: [{ lineNumber: selection.lineNumber, text: row.text }]
  };
}

function lineSelectionForRow(
  row: SelectableSurfaceDiffRow
): { readonly lineNumber: number; readonly side: DiffSurfaceSide } | null {
  switch (row.kind) {
    case "addition":
      return { lineNumber: row.newLineNumber, side: "additions" };
    case "context":
      return { lineNumber: row.newLineNumber, side: "additions" };
    case "deletion":
      return { lineNumber: row.oldLineNumber, side: "deletions" };
    case "hunk":
      return null;
  }
}

function lineSelectionForRowSide(
  row: SelectableSurfaceDiffRow,
  side: DiffSurfaceSide
): { readonly lineNumber: number; readonly side: DiffSurfaceSide } | null {
  switch (row.kind) {
    case "addition":
      return side === "additions"
        ? { lineNumber: row.newLineNumber, side: "additions" }
        : null;
    case "context":
      return side === "additions"
        ? { lineNumber: row.newLineNumber, side: "additions" }
        : { lineNumber: row.oldLineNumber, side: "deletions" };
    case "deletion":
      return side === "deletions"
        ? { lineNumber: row.oldLineNumber, side: "deletions" }
        : null;
    case "hunk":
      return null;
  }
}
