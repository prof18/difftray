import type { ReviewCommentView } from "@difftray/companion-protocol";
import {
  FileDiff,
  VirtualizerContext
} from "@pierre/diffs/react";
import {
  Virtualizer as DiffsVirtualizer,
  type DiffLineAnnotation,
  type OnDiffLineClickProps,
  type SelectedLineRange
} from "@pierre/diffs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  DIFF_SURFACE_BRIDGE_VERSION,
  type DiffSurfaceMessage,
  type DiffSurfaceDraftRange,
  type DiffSurfaceMode,
  type DiffSurfaceScrollTarget,
  type DiffSurfaceThemeTokens
} from "./surface-bridge.js";
import {
  createSurfaceFileDiffOptions,
  createSurfacePierreRenderModel,
  surfaceAnnotationLocation,
  surfaceCommentAnnotations
} from "./surface-pierre-renderer.js";
import {
  createCommentTappedMessage,
  createLineRangeSelectedMessage,
  createLineSelectedMessageFromTarget
} from "./surface-outbound.js";
import {
  surfaceVirtualFileMetrics,
  type SurfaceAnnotationMetadata
} from "./surface-pierre-renderer.js";
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
  readonly showFileHeader: boolean;
  readonly status: "added" | "deleted" | "mode_changed" | "modified" | "renamed";
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
  const surfaceNodeRef = useRef<HTMLElement | null>(null);
  const [virtualizer] = useState(
    () =>
      new DiffsVirtualizer({
        intersectionObserverMargin: 600,
        overscrollSize: 1_200,
        resizeDebugging: false
      })
  );
  const setSurfaceRef = useCallback(
    (node: HTMLElement | null) => {
      surfaceNodeRef.current = node;

      if (node) {
        virtualizer.setup(node);
        return;
      }

      virtualizer.cleanUp();
    },
    [virtualizer]
  );
  const model = createSurfacePierreRenderModel({
    diffHash: state.diffHash,
    ...(state.newText === undefined ? {} : { newText: state.newText }),
    ...(state.oldText === undefined ? {} : { oldText: state.oldText }),
    patch: state.patch,
    path: state.path,
    status: state.status
  });
  const annotations = surfaceCommentAnnotations({
    comments: state.comments,
    diffHash: state.diffHash,
    draft: state.draft,
    path: state.path
  });
  const scrollTo = state.scrollTo;
  const options = useMemo(
    () =>
      createSurfaceFileDiffOptions<SurfaceAnnotationMetadata>({
        diffMode: state.diffMode,
        onLineNumberClick: (line: OnDiffLineClickProps) => {
          onSurfaceMessage?.(
            createLineSelectedMessageFromTarget({
              lineNumber: line.lineNumber,
              side: line.annotationSide,
              text: lineTextFromElement(line.lineElement)
            })
          );
        },
        onLineSelected: (range: SelectedLineRange | null) => {
          if (!range || !range.side || (range.endSide && range.endSide !== range.side)) {
            return;
          }

          const lineStart = Math.min(range.start, range.end);
          const lineEnd = Math.max(range.start, range.end);
          const message = createLineRangeSelectedMessage(
            {
              lineNumber: lineStart,
              side: range.side,
              text: lineTextFromFileDiff(model, range.side, lineStart)
            },
            {
              lineNumber: lineEnd,
              side: range.side,
              text: lineTextFromFileDiff(model, range.side, lineEnd)
            }
          );

          if (message) {
            onSurfaceMessage?.(message);
          }
        },
        resolvedTheme: state.theme.scheme,
        wrapLines: state.wrapLines
      }),
    [model, onSurfaceMessage, state.diffMode, state.theme.scheme, state.wrapLines]
  );

  useEffect(() => {
    if (!scrollTo) {
      return undefined;
    }

    const targetScroll = scrollTo;
    let animationFrameId: number | undefined;
    let attempts = 0;

    function revealScrollTarget(): void {
      const target = document.querySelector<HTMLElement>(
        scrollTargetSelector(targetScroll)
      );

      if (target) {
        target.scrollIntoView({ block: "center", inline: "nearest" });
        return;
      }

      const surface = surfaceNodeRef.current;

      if (surface && surface.scrollHeight > surface.clientHeight) {
        surface.scrollTo({
          behavior: "instant",
          top: Math.max(
            0,
            (targetScroll.line - 1) * surfaceVirtualFileMetrics.lineHeight
          )
        });
      }

      attempts += 1;

      if (attempts < 30) {
        animationFrameId = window.requestAnimationFrame(revealScrollTarget);
      }
    }

    revealScrollTarget();

    return () => {
      if (animationFrameId !== undefined) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, [state.diffHash, state.diffMode, state.path, scrollTo?.line, scrollTo?.side]);

  return (
    <main
      className="diff-surface"
      data-bridge-version={DIFF_SURFACE_BRIDGE_VERSION}
      data-diff-mode={state.diffMode}
      data-wrap-lines={String(state.wrapLines)}
      ref={setSurfaceRef}
      style={diffSurfaceStyle(state.theme)}
    >
      {state.showFileHeader ? (
        <header className="diff-surface__header">
          <div className="diff-surface__path">{state.path}</div>
        </header>
      ) : null}
      {model.kind === "fallback" ? (
        <section className="diff-surface__fallback" role="status">
          <strong>{model.title}</strong>
          <pre>{model.detail}</pre>
        </section>
      ) : (
        <VirtualizerContext.Provider value={virtualizer}>
          <section
            className="diff-surface__diff"
            data-diff-layout={state.diffMode}
            data-renderer="pierre"
            data-visual-theme={state.theme.scheme}
            key={`${state.path}:${state.diffHash}:${state.diffMode}`}
          >
            <FileDiff
              className="diff-surface__pierre-file"
              disableWorkerPool
              fileDiff={model.fileDiff}
              key={model.fileDiff.cacheKey ?? `${state.path}:${state.diffMode}`}
              lineAnnotations={annotations}
              metrics={surfaceVirtualFileMetrics}
              options={options}
              renderAnnotation={(annotation) => (
                <SurfaceAnnotation
                  annotation={annotation}
                  {...(onSurfaceMessage ? { onSurfaceMessage } : {})}
                />
              )}
            />
          </section>
        </VirtualizerContext.Provider>
      )}
    </main>
  );
}

function scrollTargetSelector({ line, side }: DiffSurfaceScrollTarget): string {
  const sideSelector = side === "additions" ? "[data-additions]" : "[data-deletions]";

  return `${sideSelector} [data-column-number="${String(line)}"], [data-column-number="${String(line)}"]`;
}

function lineTextFromElement(element: HTMLElement): string {
  return element.textContent?.replace(/\n+/g, "\n").trimEnd() ?? "";
}

function lineTextFromFileDiff(
  model: ReturnType<typeof createSurfacePierreRenderModel>,
  side: "additions" | "deletions",
  lineNumber: number
): string {
  if (model.kind !== "diff") {
    return "";
  }

  const lines =
    side === "additions"
      ? model.fileDiff.additionLines
      : model.fileDiff.deletionLines;

  return lines[lineNumber - 1] ?? "";
}

type SurfaceAnnotationProps = {
  readonly annotation: DiffLineAnnotation<SurfaceAnnotationMetadata>;
  readonly onSurfaceMessage?: (message: DiffSurfaceMessage) => void;
};

function SurfaceAnnotation({
  annotation,
  onSurfaceMessage
}: SurfaceAnnotationProps): React.JSX.Element {
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
