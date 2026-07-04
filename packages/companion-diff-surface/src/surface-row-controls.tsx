import { type DiffSurfaceMessage, type DiffSurfaceSide } from "./surface-bridge.js";
import {
  createLineRangeSelectedMessage,
  type DiffSurfaceLineSelectionTarget
} from "./surface-outbound.js";
import { CodeLine } from "./surface-syntax.js";

let activeGutterSelection: DiffSurfaceLineSelectionTarget | null = null;
let suppressNextGutterClick = false;

export function LineNumberButton({
  lineNumber,
  message,
  onSurfaceMessage,
  side,
  target
}: {
  readonly lineNumber: number;
  readonly message: DiffSurfaceMessage | null;
  readonly onSurfaceMessage?: (message: DiffSurfaceMessage) => void;
  readonly side?: DiffSurfaceSide;
  readonly target?: DiffSurfaceLineSelectionTarget;
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
      onPointerDown={() => {
        if (!target) {
          return;
        }

        activeGutterSelection = target;
        suppressNextGutterClick = false;
      }}
      onPointerUp={() => {
        if (!target || !activeGutterSelection) {
          return;
        }

        const rangeMessage = createLineRangeSelectedMessage(
          activeGutterSelection,
          target
        );
        activeGutterSelection = null;
        suppressNextGutterClick = true;

        if (rangeMessage) {
          onSurfaceMessage?.(rangeMessage);
        }
      }}
      onClick={() => {
        if (suppressNextGutterClick) {
          suppressNextGutterClick = false;
          return;
        }

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
  syntaxHighlight,
  text
}: {
  readonly filePath: string;
  readonly glyph: string;
  readonly message: DiffSurfaceMessage | null;
  readonly onSurfaceMessage?: (message: DiffSurfaceMessage) => void;
  readonly syntaxHighlight: boolean;
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
      <CodeLine highlight={syntaxHighlight} path={filePath} text={text} />
    </button>
  );
}
