import { type DiffSurfaceMessage, type DiffSurfaceSide } from "./surface-bridge.js";
import { CodeLine } from "./surface-syntax.js";

export function LineNumberButton({
  lineNumber,
  message,
  onSurfaceMessage,
  side
}: {
  readonly lineNumber: number;
  readonly message: DiffSurfaceMessage | null;
  readonly onSurfaceMessage?: (message: DiffSurfaceMessage) => void;
  readonly side?: DiffSurfaceSide;
}): React.JSX.Element {
  const selectionSide =
    side ?? (message?.kind === "line_selected" ? message.side : undefined);

  return (
    <button
      aria-label={
        selectionSide
          ? `Select ${selectionSide} line ${String(lineNumber)}`
          : `Select line ${String(lineNumber)}`
      }
      className="diff-surface__line-number"
      data-line-select-side={selectionSide}
      data-line-select-target="gutter"
      onClick={() => {
        if (message) {
          onSurfaceMessage?.(message);
        }
      }}
      type="button"
    >
      {lineNumber}
    </button>
  );
}

export function LineContentButton({
  filePath,
  glyph,
  message,
  onSurfaceMessage,
  text
}: {
  readonly filePath: string;
  readonly glyph: string;
  readonly message: DiffSurfaceMessage | null;
  readonly onSurfaceMessage?: (message: DiffSurfaceMessage) => void;
  readonly text: string;
}): React.JSX.Element {
  return (
    <button
      className="diff-surface__line-content"
      onClick={() => {
        if (message) {
          onSurfaceMessage?.(message);
        }
      }}
      type="button"
    >
      <span className="diff-surface__glyph">{glyph}</span>
      <CodeLine path={filePath} text={text} />
    </button>
  );
}
