import {
  type DiffSurfaceMessage,
  type DiffSurfaceMode,
  type DiffSurfaceSide
} from "./surface-bridge.js";
import {
  createCommentTappedMessage,
  createLineSelectedMessage,
  createLineSelectedMessageForSide
} from "./surface-outbound.js";
import {
  surfaceAnnotationLocation,
  type SurfaceContextRow,
  type SurfaceDiffRow,
  type SurfaceLineAnnotation
} from "./surface-render-model.js";

type SurfaceLineRow = Exclude<
  SurfaceDiffRow,
  { readonly kind: "context_expander" } | { readonly kind: "hunk" }
>;

export function SurfaceDiffRowView({
  annotations,
  diffMode,
  onSurfaceMessage,
  row
}: {
  readonly annotations: readonly SurfaceLineAnnotation[];
  readonly diffMode: DiffSurfaceMode;
  readonly onSurfaceMessage?: (message: DiffSurfaceMessage) => void;
  readonly row: SurfaceDiffRow;
}): React.JSX.Element {
  const rowAnnotations = annotationsForDisplayRow(row, annotations);

  return diffMode === "split" ? (
    <SplitDiffRow
      annotations={rowAnnotations}
      {...(onSurfaceMessage ? { onSurfaceMessage } : {})}
      row={row}
    />
  ) : (
    <DiffRow
      annotations={rowAnnotations}
      {...(onSurfaceMessage ? { onSurfaceMessage } : {})}
      row={row}
    />
  );
}

function DiffRow({
  annotations,
  onSurfaceMessage,
  row
}: {
  readonly annotations: readonly SurfaceLineAnnotation[];
  readonly onSurfaceMessage?: (message: DiffSurfaceMessage) => void;
  readonly row: SurfaceDiffRow;
}): React.JSX.Element {
  if (row.kind === "context_expander") {
    return (
      <ContextExpander
        annotations={annotations}
        {...(onSurfaceMessage ? { onSurfaceMessage } : {})}
        row={row}
        variant="unified"
      />
    );
  }

  if (row.kind === "hunk") {
    return (
      <div className="diff-surface__row" data-row-kind="hunk">
        <span className="diff-surface__line-number" />
        <span className="diff-surface__glyph" />
        <code>{row.text}</code>
      </div>
    );
  }

  const lineNumber = row.kind === "deletion" ? row.oldLineNumber : row.newLineNumber;
  const glyph = row.kind === "addition" ? "+" : row.kind === "deletion" ? "-" : " ";

  return (
    <>
      <button
        className="diff-surface__row"
        data-row-kind={row.kind}
        onClick={() => {
          const message = createLineSelectedMessage(row);

          if (message) {
            onSurfaceMessage?.(message);
          }
        }}
        type="button"
      >
        <span className="diff-surface__line-number">{lineNumber}</span>
        <span className="diff-surface__glyph">{glyph}</span>
        <code>{row.text}</code>
      </button>
      {annotations.map((annotation) => (
        <SurfaceAnnotation
          annotation={annotation}
          key={annotationKey(annotation)}
          {...(onSurfaceMessage ? { onSurfaceMessage } : {})}
        />
      ))}
    </>
  );
}

function SplitDiffRow({
  annotations,
  onSurfaceMessage,
  row
}: {
  readonly annotations: readonly SurfaceLineAnnotation[];
  readonly onSurfaceMessage?: (message: DiffSurfaceMessage) => void;
  readonly row: SurfaceDiffRow;
}): React.JSX.Element {
  if (row.kind === "context_expander") {
    return (
      <ContextExpander
        annotations={annotations}
        {...(onSurfaceMessage ? { onSurfaceMessage } : {})}
        row={row}
        variant="split"
      />
    );
  }

  if (row.kind === "hunk") {
    return (
      <div className="diff-surface__split-row" data-row-kind="hunk">
        <div className="diff-surface__split-hunk">
          <code>{row.text}</code>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="diff-surface__split-row" data-row-kind={row.kind}>
        <SplitCell
          {...(onSurfaceMessage ? { onSurfaceMessage } : {})}
          row={row}
          side="deletions"
        />
        <SplitCell
          {...(onSurfaceMessage ? { onSurfaceMessage } : {})}
          row={row}
          side="additions"
        />
      </div>
      {annotations.map((annotation) => (
        <SurfaceAnnotation
          annotation={annotation}
          key={annotationKey(annotation)}
          {...(onSurfaceMessage ? { onSurfaceMessage } : {})}
        />
      ))}
    </>
  );
}

function SplitCell({
  onSurfaceMessage,
  row,
  side
}: {
  readonly onSurfaceMessage?: (message: DiffSurfaceMessage) => void;
  readonly row: SurfaceLineRow;
  readonly side: DiffSurfaceSide;
}): React.JSX.Element {
  const cell = splitCellForRow(row, side);

  if (!cell) {
    return <div className="diff-surface__split-cell" data-split-side={side} />;
  }

  return (
    <button
      className="diff-surface__split-cell"
      data-split-side={side}
      onClick={() => {
        const message = createLineSelectedMessageForSide(row, side);

        if (message) {
          onSurfaceMessage?.(message);
        }
      }}
      type="button"
    >
      <span className="diff-surface__line-number">{cell.lineNumber}</span>
      <span className="diff-surface__glyph">{cell.glyph}</span>
      <code>{row.text}</code>
    </button>
  );
}

function ContextExpander({
  annotations,
  onSurfaceMessage,
  row,
  variant
}: {
  readonly annotations: readonly SurfaceLineAnnotation[];
  readonly onSurfaceMessage?: (message: DiffSurfaceMessage) => void;
  readonly row: Extract<SurfaceDiffRow, { readonly kind: "context_expander" }>;
  readonly variant: "split" | "unified";
}): React.JSX.Element {
  return (
    <details className="diff-surface__context-expander" data-row-kind="context_expander">
      <summary>
        <span className="diff-surface__line-number" />
        <span className="diff-surface__glyph">...</span>
        <span>Show {row.lineCount} unchanged lines</span>
      </summary>
      <div className="diff-surface__context-expander-rows">
        {row.rows.map((contextRow) =>
          variant === "split" ? (
            <SplitDiffRow
              annotations={annotationsForRow(contextRow, annotations)}
              key={contextRowKey(contextRow)}
              {...(onSurfaceMessage ? { onSurfaceMessage } : {})}
              row={contextRow}
            />
          ) : (
            <DiffRow
              annotations={annotationsForRow(contextRow, annotations)}
              key={contextRowKey(contextRow)}
              {...(onSurfaceMessage ? { onSurfaceMessage } : {})}
              row={contextRow}
            />
          )
        )}
      </div>
    </details>
  );
}

function SurfaceAnnotation({
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

function annotationsForDisplayRow(
  row: SurfaceDiffRow,
  annotations: readonly SurfaceLineAnnotation[]
): readonly SurfaceLineAnnotation[] {
  return row.kind === "context_expander"
    ? annotations
    : annotationsForRow(row, annotations);
}

function annotationsForRow(
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

function contextRowKey(row: SurfaceContextRow): string {
  return `context:${String(row.oldLineNumber)}:${String(row.newLineNumber)}`;
}

function annotationKey(annotation: SurfaceLineAnnotation): string {
  const id =
    annotation.metadata.kind === "comment"
      ? annotation.metadata.comment.id
      : `${String(annotation.metadata.draft.lineStart)}:${String(annotation.metadata.draft.lineEnd)}`;

  return `${annotation.metadata.kind}:${annotation.side}:${String(annotation.lineNumber)}:${id}`;
}

function splitCellForRow(
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
