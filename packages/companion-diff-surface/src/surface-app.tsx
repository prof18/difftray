import type { ReviewCommentView } from "@difftray/companion-protocol";
import { useEffect } from "react";

import {
  DIFF_SURFACE_BRIDGE_VERSION,
  type DiffSurfaceMessage,
  type DiffSurfaceDraftRange,
  type DiffSurfaceMode,
  type DiffSurfaceScrollTarget,
  type DiffSurfaceThemeTokens
} from "./surface-bridge.js";
import { SurfaceDiffRowView } from "./surface-rows.js";
import {
  createSurfaceFileDiffOptions,
  createSurfaceRenderModel,
  surfaceCommentAnnotations
} from "./surface-render-model.js";
import { diffSurfaceStyle } from "./surface-style.js";

export type DiffSurfaceAppState = {
  readonly comments: readonly ReviewCommentView[];
  readonly diffHash: string;
  readonly diffMode: DiffSurfaceMode;
  readonly draft: DiffSurfaceDraftRange | null;
  readonly newText?: string;
  readonly oldText?: string;
  readonly patch: string;
  readonly path: string;
  readonly scrollTo?: DiffSurfaceScrollTarget;
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
  const scrollTo = state.scrollTo;

  useEffect(() => {
    if (!scrollTo) {
      return;
    }

    document
      .querySelector<HTMLElement>(scrollTargetSelector(scrollTo))
      ?.scrollIntoView({ block: "center", inline: "nearest" });
  }, [state.diffHash, state.diffMode, state.path, scrollTo?.line, scrollTo?.side]);

  return (
    <main
      className="diff-surface"
      data-bridge-version={DIFF_SURFACE_BRIDGE_VERSION}
      data-diff-mode={state.diffMode}
      data-wrap-lines={String(state.wrapLines)}
      style={diffSurfaceStyle(state.theme)}
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
              filePath={state.path}
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

function scrollTargetSelector({ line, side }: DiffSurfaceScrollTarget): string {
  const attribute =
    side === "additions" ? "data-diff-additions-line" : "data-diff-deletions-line";

  return `[${attribute}="${String(line)}"]`;
}
