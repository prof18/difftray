import type { ReviewCommentView } from "@difftray/companion-protocol";

import {
  DIFF_SURFACE_BRIDGE_VERSION,
  type DiffSurfaceMessage,
  type DiffSurfaceDraftRange,
  type DiffSurfaceMode,
  type DiffSurfaceThemeTokens
} from "./surface-bridge.js";
import { SurfaceDiffRowView } from "./surface-rows.js";
import {
  createSurfaceFileDiffOptions,
  createSurfaceRenderModel,
  surfaceCommentAnnotations
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
  onSurfaceMessage,
  state
}: {
  readonly onSurfaceMessage?: (message: DiffSurfaceMessage) => void;
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
          data-diff-layout={state.diffMode}
          data-renderer="parsed"
          data-visual-theme={options.resolvedTheme}
        >
          {model.fileDiff.rows.map((row, index) => (
            <SurfaceDiffRowView
              annotations={annotations}
              diffMode={state.diffMode}
              key={`${row.kind}:${state.diffMode}:${String(index)}`}
              {...(onSurfaceMessage ? { onSurfaceMessage } : {})}
              row={row}
            />
          ))}
        </section>
      )}
    </main>
  );
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
