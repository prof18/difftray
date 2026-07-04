import { type DiffSurfaceMessage, type DiffSurfaceSide } from "./surface-bridge.js";
import { createCommentTappedMessage } from "./surface-outbound.js";
import {
  surfaceAnnotationLocation,
  type SurfaceDiffRow,
  type SurfaceLineAnnotation
} from "./surface-render-model.js";

type SurfaceLineRow = Exclude<
  SurfaceDiffRow,
  { readonly kind: "context_expander" } | { readonly kind: "hunk" }
>;

export function SurfaceAnnotation({
  annotation,
  onSurfaceMessage
}: {
  readonly annotation: SurfaceLineAnnotation;
  readonly onSurfaceMessage?: (message: DiffSurfaceMessage) => void;
}): React.JSX.Element {
  const { metadata } = annotation;

  if (metadata.kind === "draft") {
    return (
      <div className="diff-surface__annotation" data-draft="true">
        <span>
          {surfaceAnnotationLocation({
            lineEnd: metadata.draft.lineEnd,
            lineStart: metadata.draft.lineStart,
            side: metadata.draft.side
          })}
        </span>
        <p>Draft comment</p>
      </div>
    );
  }

  return (
    <button
      className="diff-surface__annotation"
      data-comment-id={metadata.comment.id}
      onClick={() => {
        onSurfaceMessage?.(createCommentTappedMessage(metadata.comment.id));
      }}
      type="button"
    >
      <span>
        {surfaceAnnotationLocation({
          lineEnd: metadata.comment.lineEnd,
          lineStart: metadata.comment.lineStart,
          side: metadata.comment.side
        })}
      </span>
      <p>{metadata.comment.body}</p>
    </button>
  );
}

export function annotationsForDisplayRow(
  row: SurfaceDiffRow,
  annotations: readonly SurfaceLineAnnotation[]
): readonly SurfaceLineAnnotation[] {
  return row.kind === "context_expander"
    ? annotations
    : annotationsForRow(row, annotations);
}

export function annotationsForRow(
  row: SurfaceDiffRow,
  annotations: readonly SurfaceLineAnnotation[]
): readonly SurfaceLineAnnotation[] {
  if (row.kind === "addition") {
    return annotations.filter(
      (annotation) =>
        annotation.side === "additions" && annotation.lineNumber === row.newLineNumber
    );
  }

  if (row.kind === "deletion") {
    return annotations.filter(
      (annotation) =>
        annotation.side === "deletions" && annotation.lineNumber === row.oldLineNumber
    );
  }

  return [];
}

export function rowHasDraftHighlight(
  row: SurfaceLineRow,
  annotations: readonly SurfaceLineAnnotation[]
): boolean {
  switch (row.kind) {
    case "addition":
      return sideLineHasDraftHighlight("additions", row.newLineNumber, annotations);
    case "context":
      return (
        sideLineHasDraftHighlight("additions", row.newLineNumber, annotations) ||
        sideLineHasDraftHighlight("deletions", row.oldLineNumber, annotations)
      );
    case "deletion":
      return sideLineHasDraftHighlight("deletions", row.oldLineNumber, annotations);
  }
}

export function rowSideHasDraftHighlight(
  row: SurfaceLineRow,
  side: DiffSurfaceSide,
  annotations: readonly SurfaceLineAnnotation[]
): boolean {
  const lineNumber = lineNumberForRowSide(row, side);

  return lineNumber === null
    ? false
    : sideLineHasDraftHighlight(side, lineNumber, annotations);
}

export function annotationKey(annotation: SurfaceLineAnnotation): string {
  const id =
    annotation.metadata.kind === "comment"
      ? annotation.metadata.comment.id
      : `${String(annotation.metadata.draft.lineStart)}:${String(annotation.metadata.draft.lineEnd)}`;

  return `${annotation.metadata.kind}:${annotation.side}:${String(annotation.lineNumber)}:${id}`;
}

function lineNumberForRowSide(row: SurfaceLineRow, side: DiffSurfaceSide): number | null {
  switch (row.kind) {
    case "addition":
      return side === "additions" ? row.newLineNumber : null;
    case "context":
      return side === "additions" ? row.newLineNumber : row.oldLineNumber;
    case "deletion":
      return side === "deletions" ? row.oldLineNumber : null;
  }
}

function sideLineHasDraftHighlight(
  side: DiffSurfaceSide,
  lineNumber: number,
  annotations: readonly SurfaceLineAnnotation[]
): boolean {
  return annotations.some(
    (annotation) =>
      annotation.side === side &&
      annotation.metadata.kind === "draft" &&
      annotation.metadata.draft.lineStart <= lineNumber &&
      annotation.metadata.draft.lineEnd >= lineNumber
  );
}
