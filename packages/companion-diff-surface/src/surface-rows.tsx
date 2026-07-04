import {
  type DiffSurfaceMessage,
  type DiffSurfaceMode,
  type DiffSurfaceSide
} from "./surface-bridge.js";
import {
  createLineSelectedMessage,
  createLineSelectedMessageForSide
} from "./surface-outbound.js";
import {
  type SurfaceContextRow,
  type SurfaceDiffRow,
  type SurfaceLineAnnotation
} from "./surface-render-model.js";
import {
  SurfaceAnnotation,
  annotationKey,
  annotationsForDisplayRow,
  annotationsForRow,
  rowHasDraftHighlight,
  rowSideHasDraftHighlight
} from "./surface-row-annotations.js";
import { CodeLine } from "./surface-syntax.js";

type SurfaceLineRow = Exclude<
  SurfaceDiffRow,
  { readonly kind: "context_expander" } | { readonly kind: "hunk" }
>;

export function SurfaceDiffRowView({
  annotations,
  diffMode,
  filePath,
  onSurfaceMessage,
  row
}: {
  readonly annotations: readonly SurfaceLineAnnotation[];
  readonly diffMode: DiffSurfaceMode;
  readonly filePath: string;
  readonly onSurfaceMessage?: (message: DiffSurfaceMessage) => void;
  readonly row: SurfaceDiffRow;
}): React.JSX.Element {
  const rowAnnotations = annotationsForDisplayRow(row, annotations);

  return diffMode === "split" ? (
    <SplitDiffRow
      annotations={rowAnnotations}
      filePath={filePath}
      highlightAnnotations={annotations}
      {...(onSurfaceMessage ? { onSurfaceMessage } : {})}
      row={row}
    />
  ) : (
    <DiffRow
      annotations={rowAnnotations}
      filePath={filePath}
      highlightAnnotations={annotations}
      {...(onSurfaceMessage ? { onSurfaceMessage } : {})}
      row={row}
    />
  );
}

function DiffRow({
  annotations,
  filePath,
  highlightAnnotations,
  onSurfaceMessage,
  row
}: {
  readonly annotations: readonly SurfaceLineAnnotation[];
  readonly filePath: string;
  readonly highlightAnnotations: readonly SurfaceLineAnnotation[];
  readonly onSurfaceMessage?: (message: DiffSurfaceMessage) => void;
  readonly row: SurfaceDiffRow;
}): React.JSX.Element {
  if (row.kind === "context_expander") {
    return (
      <ContextExpander
        annotations={annotations}
        filePath={filePath}
        highlightAnnotations={highlightAnnotations}
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
  const draftHighlighted = rowHasDraftHighlight(row, highlightAnnotations);

  return (
    <>
      <button
        className="diff-surface__row"
        data-draft-highlight={draftHighlighted ? "true" : undefined}
        data-row-kind={row.kind}
        {...lineDataAttributesForRow(row)}
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
        <CodeLine path={filePath} text={row.text} />
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
  filePath,
  highlightAnnotations,
  onSurfaceMessage,
  row
}: {
  readonly annotations: readonly SurfaceLineAnnotation[];
  readonly filePath: string;
  readonly highlightAnnotations: readonly SurfaceLineAnnotation[];
  readonly onSurfaceMessage?: (message: DiffSurfaceMessage) => void;
  readonly row: SurfaceDiffRow;
}): React.JSX.Element {
  if (row.kind === "context_expander") {
    return (
      <ContextExpander
        annotations={annotations}
        filePath={filePath}
        highlightAnnotations={highlightAnnotations}
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
          filePath={filePath}
          highlightAnnotations={highlightAnnotations}
          {...(onSurfaceMessage ? { onSurfaceMessage } : {})}
          row={row}
          side="deletions"
        />
        <SplitCell
          filePath={filePath}
          highlightAnnotations={highlightAnnotations}
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
  filePath,
  highlightAnnotations,
  onSurfaceMessage,
  row,
  side
}: {
  readonly filePath: string;
  readonly highlightAnnotations: readonly SurfaceLineAnnotation[];
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
      data-draft-highlight={
        rowSideHasDraftHighlight(row, side, highlightAnnotations) ? "true" : undefined
      }
      {...lineDataAttributeForSide(side, cell.lineNumber)}
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
      <CodeLine path={filePath} text={row.text} />
    </button>
  );
}

function ContextExpander({
  annotations,
  filePath,
  highlightAnnotations,
  onSurfaceMessage,
  row,
  variant
}: {
  readonly annotations: readonly SurfaceLineAnnotation[];
  readonly filePath: string;
  readonly highlightAnnotations: readonly SurfaceLineAnnotation[];
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
              filePath={filePath}
              highlightAnnotations={highlightAnnotations}
              key={contextRowKey(contextRow)}
              {...(onSurfaceMessage ? { onSurfaceMessage } : {})}
              row={contextRow}
            />
          ) : (
            <DiffRow
              annotations={annotationsForRow(contextRow, annotations)}
              filePath={filePath}
              highlightAnnotations={highlightAnnotations}
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

function contextRowKey(row: SurfaceContextRow): string {
  return `context:${String(row.oldLineNumber)}:${String(row.newLineNumber)}`;
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

function lineDataAttributesForRow(row: SurfaceLineRow): {
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

function lineDataAttributeForSide(
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
