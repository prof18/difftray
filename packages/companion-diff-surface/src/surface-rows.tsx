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
import { LineContentButton, LineNumberButton } from "./surface-row-controls.js";
import {
  contextRowKey,
  lineDataAttributeForSide,
  lineDataAttributesForRow,
  lineSelectionTargetProps,
  splitCellForRow,
  type SurfaceLineRow
} from "./surface-row-data.js";

type InlineChangeRow = Extract<
  SurfaceDiffRow,
  { readonly kind: "addition" | "deletion" }
>;

export type SurfaceDiffDisplayRow =
  | {
      readonly kind: "paired_inline_change";
      readonly addition: Extract<SurfaceDiffRow, { readonly kind: "addition" }>;
      readonly deletion: Extract<SurfaceDiffRow, { readonly kind: "deletion" }>;
    }
  | {
      readonly kind: "single";
      readonly row: SurfaceDiffRow;
    };

export function surfaceDiffDisplayRows(
  rows: readonly SurfaceDiffRow[],
  diffMode: DiffSurfaceMode
): readonly SurfaceDiffDisplayRow[] {
  if (diffMode !== "split") {
    return rows.map((row) => ({ kind: "single", row }));
  }

  const displayRows: SurfaceDiffDisplayRow[] = [];
  let index = 0;

  while (index < rows.length) {
    const row = rows[index];
    const nextRow = rows[index + 1];

    if (
      row?.kind === "deletion" &&
      nextRow?.kind === "addition" &&
      isInlineChangeRow(row) &&
      isInlineChangeRow(nextRow)
    ) {
      displayRows.push({
        addition: nextRow,
        deletion: row,
        kind: "paired_inline_change"
      });
      index += 2;
      continue;
    }

    if (row) {
      displayRows.push({ kind: "single", row });
    }
    index += 1;
  }

  return displayRows;
}

export function SurfaceDiffRowView({
  annotations,
  diffMode,
  filePath,
  onSurfaceMessage,
  row,
  syntaxHighlight
}: {
  readonly annotations: readonly SurfaceLineAnnotation[];
  readonly diffMode: DiffSurfaceMode;
  readonly filePath: string;
  readonly onSurfaceMessage?: (message: DiffSurfaceMessage) => void;
  readonly row: SurfaceDiffDisplayRow;
  readonly syntaxHighlight: boolean;
}): React.JSX.Element {
  if (row.kind === "paired_inline_change") {
    return (
      <SplitPairedInlineChangeRow
        annotations={[
          ...annotationsForRow(row.deletion, annotations),
          ...annotationsForRow(row.addition, annotations)
        ]}
        addition={row.addition}
        deletion={row.deletion}
        filePath={filePath}
        highlightAnnotations={annotations}
        {...(onSurfaceMessage ? { onSurfaceMessage } : {})}
        syntaxHighlight={syntaxHighlight}
      />
    );
  }

  const rowAnnotations = annotationsForDisplayRow(row.row, annotations);

  return diffMode === "split" ? (
    <SplitDiffRow
      annotations={rowAnnotations}
      filePath={filePath}
      highlightAnnotations={annotations}
      {...(onSurfaceMessage ? { onSurfaceMessage } : {})}
      row={row.row}
      syntaxHighlight={syntaxHighlight}
    />
  ) : (
    <DiffRow
      annotations={rowAnnotations}
      filePath={filePath}
      highlightAnnotations={annotations}
      {...(onSurfaceMessage ? { onSurfaceMessage } : {})}
      row={row.row}
      syntaxHighlight={syntaxHighlight}
    />
  );
}

function DiffRow({
  annotations,
  filePath,
  highlightAnnotations,
  onSurfaceMessage,
  row,
  syntaxHighlight
}: {
  readonly annotations: readonly SurfaceLineAnnotation[];
  readonly filePath: string;
  readonly highlightAnnotations: readonly SurfaceLineAnnotation[];
  readonly onSurfaceMessage?: (message: DiffSurfaceMessage) => void;
  readonly row: SurfaceDiffRow;
  readonly syntaxHighlight: boolean;
}): React.JSX.Element {
  if (row.kind === "context_expander") {
    return (
      <ContextExpander
        annotations={annotations}
        filePath={filePath}
        highlightAnnotations={highlightAnnotations}
        {...(onSurfaceMessage ? { onSurfaceMessage } : {})}
        row={row}
        syntaxHighlight={syntaxHighlight}
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
  const inlineChange = rowHasInlineChange(row);

  const message = createLineSelectedMessage(row);

  return (
    <>
      <div
        className="diff-surface__row"
        data-draft-highlight={draftHighlighted ? "true" : undefined}
        data-inline-change={inlineChange ? "true" : undefined}
        data-row-kind={row.kind}
        {...lineDataAttributesForRow(row)}
      >
        <LineNumberButton
          lineNumber={lineNumber}
          message={message}
          {...(onSurfaceMessage ? { onSurfaceMessage } : {})}
          {...lineSelectionTargetProps(message)}
        />
        <LineContentButton
          changedRanges={changedRangesForRow(row)}
          filePath={filePath}
          glyph={glyph}
          message={message}
          {...(onSurfaceMessage ? { onSurfaceMessage } : {})}
          syntaxHighlight={syntaxHighlight}
          text={row.text}
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

function SplitPairedInlineChangeRow({
  addition,
  annotations,
  deletion,
  filePath,
  highlightAnnotations,
  onSurfaceMessage,
  syntaxHighlight
}: {
  readonly addition: Extract<SurfaceDiffRow, { readonly kind: "addition" }>;
  readonly annotations: readonly SurfaceLineAnnotation[];
  readonly deletion: Extract<SurfaceDiffRow, { readonly kind: "deletion" }>;
  readonly filePath: string;
  readonly highlightAnnotations: readonly SurfaceLineAnnotation[];
  readonly onSurfaceMessage?: (message: DiffSurfaceMessage) => void;
  readonly syntaxHighlight: boolean;
}): React.JSX.Element {
  return (
    <>
      <div
        className="diff-surface__split-row"
        data-inline-change="true"
        data-row-kind="paired_inline_change"
      >
        <SplitLineCell
          filePath={filePath}
          highlightAnnotations={highlightAnnotations}
          {...(onSurfaceMessage ? { onSurfaceMessage } : {})}
          row={deletion}
          side="deletions"
          syntaxHighlight={syntaxHighlight}
        />
        <SplitLineCell
          filePath={filePath}
          highlightAnnotations={highlightAnnotations}
          {...(onSurfaceMessage ? { onSurfaceMessage } : {})}
          row={addition}
          side="additions"
          syntaxHighlight={syntaxHighlight}
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

function SplitDiffRow({
  annotations,
  filePath,
  highlightAnnotations,
  onSurfaceMessage,
  row,
  syntaxHighlight
}: {
  readonly annotations: readonly SurfaceLineAnnotation[];
  readonly filePath: string;
  readonly highlightAnnotations: readonly SurfaceLineAnnotation[];
  readonly onSurfaceMessage?: (message: DiffSurfaceMessage) => void;
  readonly row: SurfaceDiffRow;
  readonly syntaxHighlight: boolean;
}): React.JSX.Element {
  if (row.kind === "context_expander") {
    return (
      <ContextExpander
        annotations={annotations}
        filePath={filePath}
        highlightAnnotations={highlightAnnotations}
        {...(onSurfaceMessage ? { onSurfaceMessage } : {})}
        row={row}
        syntaxHighlight={syntaxHighlight}
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
      <div
        className="diff-surface__split-row"
        data-inline-change={rowHasInlineChange(row) ? "true" : undefined}
        data-row-kind={row.kind}
      >
        <SplitCell
          filePath={filePath}
          highlightAnnotations={highlightAnnotations}
          {...(onSurfaceMessage ? { onSurfaceMessage } : {})}
          row={row}
          side="deletions"
          syntaxHighlight={syntaxHighlight}
        />
        <SplitCell
          filePath={filePath}
          highlightAnnotations={highlightAnnotations}
          {...(onSurfaceMessage ? { onSurfaceMessage } : {})}
          row={row}
          side="additions"
          syntaxHighlight={syntaxHighlight}
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
  side,
  syntaxHighlight
}: {
  readonly filePath: string;
  readonly highlightAnnotations: readonly SurfaceLineAnnotation[];
  readonly onSurfaceMessage?: (message: DiffSurfaceMessage) => void;
  readonly row: SurfaceLineRow;
  readonly side: DiffSurfaceSide;
  readonly syntaxHighlight: boolean;
}): React.JSX.Element {
  const cell = splitCellForRow(row, side);

  if (!cell) {
    return <div className="diff-surface__split-cell" data-split-side={side} />;
  }

  return (
    <SplitLineCell
      filePath={filePath}
      highlightAnnotations={highlightAnnotations}
      {...(onSurfaceMessage ? { onSurfaceMessage } : {})}
      row={row}
      side={side}
      syntaxHighlight={syntaxHighlight}
    />
  );
}

function SplitLineCell({
  filePath,
  highlightAnnotations,
  onSurfaceMessage,
  row,
  side,
  syntaxHighlight
}: {
  readonly filePath: string;
  readonly highlightAnnotations: readonly SurfaceLineAnnotation[];
  readonly onSurfaceMessage?: (message: DiffSurfaceMessage) => void;
  readonly row: SurfaceLineRow;
  readonly side: DiffSurfaceSide;
  readonly syntaxHighlight: boolean;
}): React.JSX.Element {
  const cell = splitCellForRow(row, side);

  if (!cell) {
    return <div className="diff-surface__split-cell" data-split-side={side} />;
  }

  const message = createLineSelectedMessageForSide(row, side);

  return (
    <div
      className="diff-surface__split-cell"
      data-draft-highlight={
        rowSideHasDraftHighlight(row, side, highlightAnnotations) ? "true" : undefined
      }
      {...lineDataAttributeForSide(side, cell.lineNumber)}
      data-split-side={side}
    >
      <LineNumberButton
        lineNumber={cell.lineNumber}
        message={message}
        {...(onSurfaceMessage ? { onSurfaceMessage } : {})}
        side={side}
        {...lineSelectionTargetProps(message)}
      />
      <LineContentButton
        changedRanges={changedRangesForRow(row)}
        filePath={filePath}
        glyph={cell.glyph}
        message={message}
        {...(onSurfaceMessage ? { onSurfaceMessage } : {})}
        syntaxHighlight={syntaxHighlight}
        text={row.text}
      />
    </div>
  );
}

function changedRangesForRow(row: SurfaceLineRow) {
  return row.kind === "addition" || row.kind === "deletion"
    ? row.changedRanges
    : undefined;
}

function rowHasInlineChange(row: SurfaceLineRow): boolean {
  return row.kind === "addition" || row.kind === "deletion"
    ? row.inlineChange === true
    : false;
}

function isInlineChangeRow(row: InlineChangeRow): boolean {
  return row.inlineChange === true;
}

function ContextExpander({
  annotations,
  filePath,
  highlightAnnotations,
  onSurfaceMessage,
  row,
  syntaxHighlight,
  variant
}: {
  readonly annotations: readonly SurfaceLineAnnotation[];
  readonly filePath: string;
  readonly highlightAnnotations: readonly SurfaceLineAnnotation[];
  readonly onSurfaceMessage?: (message: DiffSurfaceMessage) => void;
  readonly row: Extract<SurfaceDiffRow, { readonly kind: "context_expander" }>;
  readonly syntaxHighlight: boolean;
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
              syntaxHighlight={syntaxHighlight}
            />
          ) : (
            <DiffRow
              annotations={annotationsForRow(contextRow, annotations)}
              filePath={filePath}
              highlightAnnotations={highlightAnnotations}
              key={contextRowKey(contextRow)}
              {...(onSurfaceMessage ? { onSurfaceMessage } : {})}
              row={contextRow}
              syntaxHighlight={syntaxHighlight}
            />
          )
        )}
      </div>
    </details>
  );
}
