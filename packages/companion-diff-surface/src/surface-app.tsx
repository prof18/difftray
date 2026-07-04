import type { ReviewCommentView } from "@difftray/companion-protocol";

import {
  DIFF_SURFACE_BRIDGE_VERSION,
  type DiffSurfaceDraftRange,
  type DiffSurfaceMode,
  type DiffSurfaceThemeTokens
} from "./surface-bridge.js";

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
      <pre className="diff-surface__patch">{state.patch}</pre>
    </main>
  );
}

function surfaceStyle(theme: DiffSurfaceThemeTokens): React.CSSProperties {
  return {
    "--diff-surface-accent": theme.accent,
    "--diff-surface-bg": theme.background,
    "--diff-surface-fg": theme.foreground,
    "--diff-surface-muted": theme.foregroundMuted,
    color: theme.foreground,
    backgroundColor: theme.background,
    fontSize: theme.fontSizePx
  } as React.CSSProperties;
}
