import type { ReviewCommentView } from "@difftray/companion-protocol";

import {
  DIFF_SURFACE_BRIDGE_VERSION,
  type DiffSurfaceDraftRange,
  type DiffSurfaceMode,
  type DiffSurfaceThemeTokens
} from "./surface-bridge.js";
import {
  createSurfaceFileDiffOptions,
  createSurfaceRenderModel,
  surfaceAnnotationLocation,
  surfaceCommentAnnotations,
  type SurfaceDiffRow,
  type SurfaceLineAnnotation
} from "./surface-render-model.js";

export type DiffSurfaceAppState = {
  readonly comments: readonly ReviewCommentView[];
  readonly diffHash: string;
  readonly diffMode: DiffSurfaceMode;
  readonly draft: DiffSurfaceDraftRange | null;
  readonly newText?: string;
  readonly oldText?: string;
  readonly patch: string;
  readonly path: string;
  readonly theme: DiffSurfaceThemeTokens;
  readonly wrapLines: boolean;
};

export function DiffSurfaceApp({
  state
}: {
  readonly state: DiffSurfaceAppState;
}): React.JSX.Element {
  const model = createSurfaceRenderModel({
    diffHash: state.diffHash,
    ...(state.newText === undefined ? {} : { newText: state.newText }),
    ...(state.oldText === undefined ? {} : { oldText: state.oldText }),
    patch: state.patch,
    path: state.path
  });
  const options = createSurfaceFileDiffOptions({
    diffMode: state.diffMode,
    resolvedTheme: state.theme.scheme,
    wrapLines: state.wrapLines
  });
  const annotations = surfaceCommentAnnotations({
    comments: state.comments,
    diffHash: state.diffHash,
    draft: state.draft,
    path: state.path
  });

  return (
    <main
      className="diff-surface"
      data-bridge-version={DIFF_SURFACE_BRIDGE_VERSION}
      data-diff-mode={state.diffMode}
      data-wrap-lines={String(state.wrapLines)}
      style={surfaceStyle(state.theme)}
    >
      <header className="diff-surface__header">
        <div className="diff-surface__path">{state.path}</div>
        <div className="diff-surface__meta">{state.diffHash}</div>
      </header>
      {model.kind === "fallback" ? (
        <section className="diff-surface__fallback" role="status">
          <strong>{model.title}</strong>
          <pre>{model.detail}</pre>
        </section>
      ) : (
        <section
          className="diff-surface__diff"
          data-renderer="parsed"
          data-visual-theme={options.resolvedTheme}
        >
          {model.fileDiff.rows.map((row, index) => (
            <DiffRow
              annotations={annotationsForRow(row, annotations)}
              key={`${row.kind}:${String(index)}`}
              row={row}
            />
          ))}
        </section>
      )}
    </main>
  );
}

function DiffRow({
  annotations,
  row
}: {
  readonly annotations: readonly SurfaceLineAnnotation[];
  readonly row: SurfaceDiffRow;
}): React.JSX.Element {
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
      <div className="diff-surface__row" data-row-kind={row.kind}>
        <span className="diff-surface__line-number">{lineNumber}</span>
        <span className="diff-surface__glyph">{glyph}</span>
        <code>{row.text}</code>
      </div>
      {annotations.map((annotation) => (
        <SurfaceAnnotation annotation={annotation} key={annotationKey(annotation)} />
      ))}
    </>
  );
}

function SurfaceAnnotation({
  annotation
}: {
  readonly annotation: SurfaceLineAnnotation;
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

function annotationKey(annotation: SurfaceLineAnnotation): string {
  const id =
    annotation.metadata.kind === "comment"
      ? annotation.metadata.comment.id
      : `${String(annotation.metadata.draft.lineStart)}:${String(annotation.metadata.draft.lineEnd)}`;

  return `${annotation.metadata.kind}:${annotation.side}:${String(annotation.lineNumber)}:${id}`;
}

function surfaceStyle(theme: DiffSurfaceThemeTokens): React.CSSProperties {
  return {
    "--diff-surface-accent": theme.accent,
    "--diff-surface-bg": theme.background,
    "--diff-surface-fg": theme.foreground,
    "--diff-surface-muted": theme.foregroundMuted,
    "--diff-add-bg": theme.addedBackground,
    "--diff-add-bg-strong": theme.addedBackground,
    "--diff-add-fg": theme.addedForeground,
    "--diff-bg": theme.background,
    "--diff-bg-buffer": theme.background,
    "--diff-bg-context": theme.background,
    "--diff-bg-gutter": theme.background,
    "--diff-bg-separator": theme.foregroundMuted,
    "--diff-del-bg": theme.removedBackground,
    "--diff-del-bg-strong": theme.removedBackground,
    "--diff-del-fg": theme.removedForeground,
    "--diff-fg": theme.foreground,
    "--diff-fg-muted": theme.foregroundMuted,
    "--diff-gutter": theme.foregroundMuted,
    "--diff-hover": theme.draftHighlight,
    "--diff-selection": theme.draftHighlight,
    color: theme.foreground,
    backgroundColor: theme.background,
    fontSize: theme.fontSizePx
  } as React.CSSProperties;
}
