import type { ReviewCommentView } from "@difftray/companion-protocol";
import { FileDiff, VirtualizerContext } from "@pierre/diffs/react";
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
  createLineRangeSelectedMessage
} from "./surface-outbound.js";
import { createPreviewSnapshot } from "./surface-preview-snapshot.js";
import {
  surfaceVirtualFileMetrics,
  type SurfaceAnnotationMetadata
} from "./surface-pierre-renderer.js";
import { diffSurfaceStyle } from "./surface-style.js";

import { createSurfaceTouchSelection, MOVE_SLOP_PX } from "./surface-touch-selection.js";
import {
  resolveSurfaceTouchTarget,
  type TouchLineTarget
} from "./surface-touch-target.js";

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
  const model = useMemo(
    () =>
      createSurfacePierreRenderModel({
        diffHash: state.diffHash,
        ...(state.newText === undefined ? {} : { newText: state.newText }),
        ...(state.oldText === undefined ? {} : { oldText: state.oldText }),
        patch: state.patch,
        path: state.path,
        status: state.status
      }),
    [state.diffHash, state.newText, state.oldText, state.patch, state.path, state.status]
  );
  const selection = useSurfaceSelection(surfaceNodeRef, state, model, onSurfaceMessage);
  const annotations = useMemo(
    () =>
      surfaceCommentAnnotations({
        comments: state.comments,
        diffHash: state.diffHash,
        draft: state.draft,
        path: state.path
      }),
    [state.comments, state.diffHash, state.draft, state.path]
  );
  const scrollTo = state.scrollTo;
  const options = useMemo(
    () =>
      createSurfaceFileDiffOptions<SurfaceAnnotationMetadata>({
        diffMode: state.diffMode,
        ...selection.options,
        resolvedTheme: state.theme.scheme,
        wrapLines: state.wrapLines
      }),
    [selection.options, state.diffMode, state.theme.scheme, state.wrapLines]
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
          top: Math.max(0, (targetScroll.line - 1) * surfaceVirtualFileMetrics.lineHeight)
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
    <div className="diff-surface-frame" style={diffSurfaceStyle(state.theme)}>
      <main
        className="diff-surface"
        data-bridge-version={DIFF_SURFACE_BRIDGE_VERSION}
        data-diff-mode={state.diffMode}
        data-wrap-lines={String(state.wrapLines)}
        ref={setSurfaceRef}
        style={selection.barHeight ? { paddingBottom: selection.barHeight } : undefined}
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
                selectedLines={selection.lines}
                renderAnnotation={(annotation) => (
                  <SurfaceAnnotation
                    annotation={annotation}
                    onSurfaceMessage={selection.onMessage}
                  />
                )}
              />
            </section>
          </VirtualizerContext.Provider>
        )}
      </main>
      {selection.range ? (
        <div
          className="diff-surface__range-actions"
          ref={selection.barRef}
          role="group"
          aria-label="Comment selection"
        >
          <span role="status">
            {surfaceAnnotationLocation({
              side: selection.range.side ?? "additions",
              lineStart: Math.min(selection.range.start, selection.range.end),
              lineEnd: Math.max(selection.range.start, selection.range.end)
            })}
          </span>
          <button type="button" onClick={() => selection.controller.confirm()}>
            Comment
          </button>
          <button type="button" onClick={() => selection.controller.reset()}>
            Cancel
          </button>
        </div>
      ) : null}
    </div>
  );
}

function scrollTargetSelector({ line, side }: DiffSurfaceScrollTarget): string {
  const sideSelector = side === "additions" ? "[data-additions]" : "[data-deletions]";

  return `${sideSelector} [data-column-number="${String(line)}"], [data-column-number="${String(line)}"]`;
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
    side === "additions" ? model.fileDiff.additionLines : model.fileDiff.deletionLines;

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

type SurfacePointer = {
  id: number;
  target: TouchLineTarget;
  x: number;
  y: number;
  active: boolean;
  released: boolean;
  moved: boolean;
  suppress: boolean;
};

function surfaceTouchTarget(event: Event): TouchLineTarget | null {
  const path = event
    .composedPath()
    .filter((node): node is Element => node instanceof Element);
  const number = path.find((node) => node.hasAttribute("data-column-number"));
  if (!number) return null;
  const column = path.find((node) => node.hasAttribute("data-code"));
  return resolveSurfaceTouchTarget({
    columnNumber: number.getAttribute("data-column-number"),
    lineType: number.getAttribute("data-line-type"),
    columnSide: column?.hasAttribute("data-deletions") ? "deletions" : "additions",
    excluded: path.some(
      (node) =>
        node.hasAttribute("data-line-annotation") ||
        node.hasAttribute("data-expand-button")
    )
  });
}

export function withPreview(
  message: DiffSurfaceMessage,
  model: ReturnType<typeof createSurfacePierreRenderModel>,
  path: string
): DiffSurfaceMessage {
  if (message.kind !== "line_selected" || model.kind !== "diff") return message;
  const source =
    message.side === "additions"
      ? model.fileDiff.additionLines
      : model.fileDiff.deletionLines;
  // Partial patches do not contain an addressable full-file snapshot.
  if (model.fileDiff.isPartial) return message;
  const text = createPreviewSnapshot(source, message.lineStart, message.lineEnd);
  if (text === undefined) return message;
  const previewPath =
    message.side === "deletions" ? (model.fileDiff.prevName ?? path) : path;
  return { ...message, preview: { path: previewPath, text } };
}

function useSurfaceSelection(
  surfaceRef: React.RefObject<HTMLElement | null>,
  state: DiffSurfaceAppState,
  model: ReturnType<typeof createSurfacePierreRenderModel>,
  onSurfaceMessage: ((message: DiffSurfaceMessage) => void) | undefined
) {
  const [range, setRange] = useState<SelectedLineRange | null>(null);
  const [barHeight, setBarHeight] = useState(0);
  const barRef = useRef<HTMLDivElement | null>(null);
  const [, redraw] = useState(0);
  const mouse = useRef<SurfacePointer | undefined>(undefined);
  const touch = useRef<SurfacePointer | undefined>(undefined);
  const preview = useRef<SelectedLineRange | null>(null);
  const latest = useRef({ model, onSurfaceMessage, path: state.path });
  latest.current = { model, onSurfaceMessage, path: state.path };
  const [controller] = useState(() =>
    createSurfaceTouchSelection({
      onRangeChange: setRange,
      onSelect: (selected) => {
        if (!selected.side) return;
        const start = {
          lineNumber: selected.start,
          side: selected.side,
          text: lineTextFromFileDiff(latest.current.model, selected.side, selected.start)
        };
        const end = {
          lineNumber: selected.end,
          side: selected.side,
          text: lineTextFromFileDiff(latest.current.model, selected.side, selected.end)
        };
        const message = createLineRangeSelectedMessage(start, end, (line) =>
          lineTextFromFileDiff(latest.current.model, start.side, line)
        );
        if (message)
          latest.current.onSurfaceMessage?.(
            withPreview(message, latest.current.model, latest.current.path)
          );
      }
    })
  );
  const emitRange = useCallback((selected: SelectedLineRange) => {
    if (!selected.side) return;
    const side = selected.side;
    const message = createLineRangeSelectedMessage(
      {
        lineNumber: selected.start,
        side: selected.side,
        text: lineTextFromFileDiff(latest.current.model, selected.side, selected.start)
      },
      {
        lineNumber: selected.end,
        side: selected.side,
        text: lineTextFromFileDiff(latest.current.model, selected.side, selected.end)
      },
      (line) => lineTextFromFileDiff(latest.current.model, side, line)
    );
    if (message)
      latest.current.onSurfaceMessage?.(
        withPreview(message, latest.current.model, latest.current.path)
      );
  }, []);
  useEffect(() => {
    if (!range || !barRef.current) {
      setBarHeight(0);
      return;
    }
    const bar = barRef.current;
    const measure = () => setBarHeight(bar.getBoundingClientRect().height);
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    measure();
    return () => observer.disconnect();
  }, [range]);
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    controller.reset();
    function reset() {
      controller.reset();
      if (mouse.current) {
        mouse.current.active = false;
        mouse.current.suppress = true;
      }
      if (touch.current) {
        touch.current.active = false;
        touch.current.suppress = true;
      }
      preview.current = null;
      redraw((value) => value + 1);
    }
    function down(event: PointerEvent) {
      const target = surfaceTouchTarget(event);
      if (!target || event.button !== 0) return;
      const currentModel = latest.current.model;
      if (currentModel.kind !== "diff") return;
      const lines =
        target.side === "additions"
          ? currentModel.fileDiff.additionLines
          : currentModel.fileDiff.deletionLines;
      if (lines[target.lineNumber - 1] === undefined) return;
      const record: SurfacePointer = {
        id: event.pointerId,
        target,
        x: event.clientX,
        y: event.clientY,
        active: true,
        released: false,
        moved: false,
        suppress: false
      };
      if (event.pointerType === "touch" || event.pointerType === "pen") {
        event.stopPropagation();
        if (touch.current?.active && touch.current.id !== event.pointerId) {
          controller.cancelPointer();
          touch.current.active = false;
          touch.current.suppress = true;
          return;
        }
        touch.current = record;
        controller.down(event.pointerId, target, event.clientX, event.clientY);
      } else {
        controller.reset();
        mouse.current = record;
      }
    }
    function move(event: PointerEvent) {
      if (touch.current?.id === event.pointerId) {
        controller.move(event.pointerId, event.clientX, event.clientY);
        event.stopPropagation();
      }
      const current = mouse.current;
      if (current?.active && current.id === event.pointerId)
        current.moved ||=
          Math.hypot(event.clientX - current.x, event.clientY - current.y) > MOVE_SLOP_PX;
    }
    function up(event: PointerEvent) {
      move(event);
      if (touch.current?.id === event.pointerId) {
        touch.current.active = false;
        touch.current.suppress = true;
        event.stopPropagation();
        controller.up(event.pointerId);
      }
      if (mouse.current?.id === event.pointerId) mouse.current.released = true;
    }
    function cancel(event: PointerEvent) {
      if (touch.current?.id === event.pointerId) {
        touch.current.active = false;
        touch.current.suppress = true;
        controller.cancelPointer();
      }
      if (mouse.current?.id === event.pointerId) {
        mouse.current.active = false;
        mouse.current.suppress = true;
        preview.current = null;
        redraw((value) => value + 1);
      }
    }
    function click(event: MouseEvent) {
      const target = surfaceTouchTarget(event);
      const owned = touch.current;
      if (
        owned &&
        target &&
        ((event instanceof PointerEvent && event.pointerId === owned.id) ||
          (target.side === owned.target.side &&
            target.lineNumber === owned.target.lineNumber))
      ) {
        event.preventDefault();
        event.stopPropagation();
        touch.current = undefined;
      }
    }
    function scroll() {
      controller.cancelPointer();
    }
    function hidden() {
      if (document.hidden) reset();
    }
    function contextMenu(event: Event) {
      if (surfaceTouchTarget(event)) event.preventDefault();
    }
    surface.addEventListener("pointerdown", down, true);
    surface.addEventListener("click", click, true);
    surface.addEventListener("contextmenu", contextMenu);
    surface.addEventListener("scroll", scroll, true);
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", cancel, true);
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("blur", reset);
    return () => {
      controller.reset();
      mouse.current = undefined;
      touch.current = undefined;
      preview.current = null;
      surface.removeEventListener("pointerdown", down, true);
      surface.removeEventListener("click", click, true);
      surface.removeEventListener("contextmenu", contextMenu);
      surface.removeEventListener("scroll", scroll, true);
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", cancel, true);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("blur", reset);
    };
  }, [controller, state.path, state.diffHash, state.diffMode, surfaceRef]);
  useEffect(() => {
    if (state.draft) controller.reset();
  }, [controller, state.draft]);
  const options = useMemo(() => {
    const updatePreview = (selected: SelectedLineRange | null) => {
      if (!mouse.current?.active) return;
      preview.current = selected;
      redraw((value) => value + 1);
    };
    return {
      onLineSelectionStart: updatePreview,
      onLineSelectionChange: updatePreview,
      onLineSelectionEnd: (selected: SelectedLineRange | null) => {
        const current = mouse.current;
        if (!current?.active || !current.released) return;
        current.active = false;
        preview.current = null;
        const multiple = selected !== null && selected.start !== selected.end;
        const sameSide =
          selected?.side && (!selected.endSide || selected.endSide === selected.side);
        current.suppress =
          current.moved || multiple || Boolean(selected?.endSide && !sameSide);
        if (multiple && sameSide) emitRange(selected);
        redraw((value) => value + 1);
      },
      onLineNumberClick: (line: OnDiffLineClickProps) => {
        if (line.event.detail !== 0 && mouse.current?.suppress) return;
        emitRange({
          start: line.lineNumber,
          end: line.lineNumber,
          side: line.annotationSide
        });
      }
    };
  }, [emitRange]);
  const onMessage = (message: DiffSurfaceMessage) => {
    if (message.kind === "comment_tapped") controller.reset();
    onSurfaceMessage?.(message);
  };
  return {
    controller,
    range,
    barRef,
    barHeight,
    options,
    onMessage,
    lines:
      range ??
      (mouse.current?.active
        ? preview.current
        : state.draft
          ? {
              start: state.draft.lineStart,
              end: state.draft.lineEnd,
              side: state.draft.side
            }
          : null)
  };
}
