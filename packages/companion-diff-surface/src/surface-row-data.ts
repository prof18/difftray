import type { DiffSurfaceMessage, DiffSurfaceSide } from "./surface-bridge.js";
import type { SurfaceContextRow, SurfaceDiffRow } from "./surface-render-model.js";

export type SurfaceLineRow = Exclude<
  SurfaceDiffRow,
  { readonly kind: "context_expander" } | { readonly kind: "hunk" }
>;

export function contextRowKey(row: SurfaceContextRow): string {
  return `context:${String(row.oldLineNumber)}:${String(row.newLineNumber)}`;
}

export function lineSelectionTargetProps(message: DiffSurfaceMessage | null):
  | {
      readonly target: {
        readonly lineNumber: number;
        readonly side: DiffSurfaceSide;
        readonly text: string;
      };
    }
  | Record<string, never> {
  return message?.kind === "line_selected"
    ? {
        target: {
          lineNumber: message.lineStart,
          side: message.side,
          text: message.snippet[0]?.text ?? ""
        }
      }
    : {};
}

export function splitCellForRow(
  row: SurfaceLineRow,
  side: DiffSurfaceSide
): { readonly glyph: string; readonly lineNumber: number } | null {
  switch (row.kind) {
    case "addition":
      return side === "additions" ? { glyph: "+", lineNumber: row.newLineNumber } : null;
    case "context":
      return side === "additions"
        ? { glyph: " ", lineNumber: row.newLineNumber }
        : { glyph: " ", lineNumber: row.oldLineNumber };
    case "deletion":
      return side === "deletions" ? { glyph: "-", lineNumber: row.oldLineNumber } : null;
  }
}

export function lineDataAttributesForRow(row: SurfaceLineRow): {
  readonly "data-diff-additions-line"?: number;
  readonly "data-diff-deletions-line"?: number;
} {
  switch (row.kind) {
    case "addition":
      return { "data-diff-additions-line": row.newLineNumber };
    case "context":
      return {
        "data-diff-additions-line": row.newLineNumber,
        "data-diff-deletions-line": row.oldLineNumber
      };
    case "deletion":
      return { "data-diff-deletions-line": row.oldLineNumber };
  }
}

export function lineDataAttributeForSide(
  side: DiffSurfaceSide,
  lineNumber: number
): {
  readonly "data-diff-additions-line"?: number;
  readonly "data-diff-deletions-line"?: number;
} {
  return side === "additions"
    ? { "data-diff-additions-line": lineNumber }
    : { "data-diff-deletions-line": lineNumber };
}
