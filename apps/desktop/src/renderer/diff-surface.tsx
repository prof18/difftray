import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  FileDiff,
  VirtualizerContext,
  WorkerPoolContextProvider
} from "@pierre/diffs/react";
import {
  Virtualizer as DiffsVirtualizer,
  type OnDiffLineClickProps
} from "@pierre/diffs";

import styles from "./diff-surface.module.css";
import {
  normalizeDiffScrollPosition,
  topDiffScrollPosition,
  type DiffScrollPosition
} from "./diff-scroll-state.js";
import { createReadyDiffParseState, type DiffParseState } from "./diff-parse-state.js";
import {
  createDiffsFileDiffOptions,
  createDiffsFocusedFileDiff,
  createDiffsWorkerPoolOptions,
  diffFocusClassName,
  diffsVirtualFileMetrics,
  diffsWorkerHighlighterOptions,
  type DiffSideFocus
} from "./diffs-renderer.js";
import { ReviewCommentAnnotation } from "./review-comment-annotation.js";
import { ImageDiff } from "./image-diff.js";
import {
  commentSavePendingMatchesAnnotation,
  reviewCommentAnnotations,
  type CommentSavePending,
  type ReviewCommentAnnotationMetadata,
  type ReviewCommentDraft
} from "./review-comments.js";
import { classList, type DiffMode } from "./review-view-model.js";

export function DiffSurface({
  commentDraft,
  comments,
  diffHash,
  diffMode,
  diffSideFocus,
  filePath,
  newText,
  oldText,
  loadImage,
  onCancelComment,
  onCommentDraftBodyChange,
  onDeleteComment,
  onRenderModelReady,
  onSaveComment,
  onScrollPositionChange,
  onStartComment,
  onUpdateComment,
  patch,
  pendingCommentSave,
  previousPath,
  resolvedTheme,
  refObject,
  scrollKey,
  scrollPosition,
  status,
  visiblePendingCommentSave,
  wrapLines
}: {
  readonly commentDraft: ReviewCommentDraft | undefined;
  readonly comments: readonly ReviewCommentView[];
  readonly diffHash: string;
  readonly diffMode: DiffMode;
  readonly diffSideFocus: DiffSideFocus;
  readonly filePath: string;
  readonly newText: string | undefined;
  readonly oldText: string | undefined;
  readonly loadImage?: (side: FileImageSide) => Promise<FileImageView | null>;
  readonly onCancelComment: () => void;
  readonly onCommentDraftBodyChange: (body: string) => void;
  readonly onDeleteComment: (commentId: string) => void;
  readonly onRenderModelReady: (filePath: string, parseMs: number) => void;
  readonly onSaveComment: () => Promise<boolean>;
  readonly onScrollPositionChange: (
    scrollKey: string,
    position: DiffScrollPosition
  ) => void;
  readonly onStartComment: (side: ReviewCommentSide, lineNumber: number) => void;
  readonly onUpdateComment: (commentId: string, body: string) => Promise<boolean>;
  readonly patch: string;
  readonly pendingCommentSave: CommentSavePending | undefined;
  readonly previousPath: string | undefined;
  readonly resolvedTheme: "dark" | "light";
  readonly refObject: React.RefObject<HTMLDivElement | null>;
  readonly scrollKey: string;
  readonly scrollPosition: DiffScrollPosition | undefined;
  readonly status: ReviewFileView["status"];
  readonly visiblePendingCommentSave: CommentSavePending | undefined;
  readonly wrapLines: boolean;
}): React.JSX.Element {
  const parseKey = `${filePath}:${diffHash}`;
  const effectiveDiffMode = status === "added" ? "unified" : diffMode;
  const visualDiffLayout =
    status === "added" || status === "deleted" || diffSideFocus !== "both"
      ? "single"
      : diffMode;
  const [parseState, setParseState] = useState<DiffParseState>(() =>
    createReadyDiffParseState({
      diffHash,
      filePath,
      newText,
      oldText,
      parseKey,
      patch,
      previousPath,
      status
    })
  );
  const model =
    parseState.key === parseKey && parseState.status === "ready"
      ? parseState.model
      : undefined;
  const focusedFileDiff = useMemo(
    () =>
      model?.kind === "diff"
        ? createDiffsFocusedFileDiff(model.fileDiff, diffSideFocus)
        : undefined,
    [diffSideFocus, model]
  );
  const fileDiffOptions = useMemo(
    () => ({
      ...createDiffsFileDiffOptions<ReviewCommentAnnotationMetadata>({
        diffMode: effectiveDiffMode,
        resolvedTheme,
        wrapLines
      }),
      enableLineSelection: true,
      lineHoverHighlight: "both" as const,
      onLineNumberClick: (line: OnDiffLineClickProps) => {
        onStartComment(line.annotationSide, line.lineNumber);
      }
    }),
    [effectiveDiffMode, onStartComment, resolvedTheme, wrapLines]
  );
  const lineAnnotations = useMemo(
    () =>
      reviewCommentAnnotations({
        comments,
        draft: commentDraft
      }),
    [commentDraft, comments]
  );
  const workerPoolOptions = useMemo(() => createDiffsWorkerPoolOptions(), []);

  useLayoutEffect(() => {
    if (parseState.key === parseKey && parseState.status === "ready") {
      return;
    }

    setParseState(
      createReadyDiffParseState({
        diffHash,
        filePath,
        newText,
        oldText,
        parseKey,
        patch,
        previousPath,
        status
      })
    );
  }, [
    diffHash,
    filePath,
    newText,
    oldText,
    parseKey,
    parseState.key,
    parseState.status,
    patch,
    previousPath,
    status
  ]);

  useEffect(() => {
    if (parseState.key === parseKey && parseState.status === "ready") {
      onRenderModelReady(filePath, parseState.parseMs);
    }
  }, [diffHash, filePath, onRenderModelReady, parseKey, parseState, status]);

  return (
    <DiffsVirtualizedSurface
      contentReady={Boolean(model)}
      diffLayout={visualDiffLayout}
      horizontalScrollbarsEnabled={Boolean(focusedFileDiff) && !wrapLines}
      refObject={refObject}
      onScrollPositionChange={onScrollPositionChange}
      scrollKey={scrollKey}
      scrollPosition={scrollPosition}
    >
      {!model ? (
        <div className={styles.diffPreparingState} role="status">
          <span className={styles.loadingMiniMark} aria-hidden />
          <span>Preparing diff</span>
        </div>
      ) : null}
      {model?.kind === "fallback" ? (
        loadImage && binaryPatch(patch) ? (
          <ImageDiff
            diffHash={diffHash}
            diffSideFocus={diffSideFocus}
            fallback={<DiffFallback title={model.title} detail={model.detail} />}
            loadImage={loadImage}
            status={status}
          />
        ) : (
          <DiffFallback title={model.title} detail={model.detail} />
        )
      ) : null}
      {focusedFileDiff ? (
        <WorkerPoolContextProvider
          highlighterOptions={diffsWorkerHighlighterOptions}
          poolOptions={workerPoolOptions}
        >
          <FileDiff
            className={classList(styles.diffsFileDiff, diffFocusClassName(diffSideFocus))}
            fileDiff={focusedFileDiff}
            key={focusedFileDiff.cacheKey ?? `${focusedFileDiff.name}:${diffSideFocus}`}
            lineAnnotations={lineAnnotations}
            metrics={diffsVirtualFileMetrics}
            options={fileDiffOptions}
            renderAnnotation={(annotation) => (
              <ReviewCommentAnnotation
                annotation={annotation}
                onCancelDraft={onCancelComment}
                onDeleteComment={onDeleteComment}
                onDraftBodyChange={onCommentDraftBodyChange}
                onSaveDraft={onSaveComment}
                onUpdateComment={onUpdateComment}
                saving={commentSavePendingMatchesAnnotation(
                  pendingCommentSave,
                  annotation
                )}
                showSaving={commentSavePendingMatchesAnnotation(
                  visiblePendingCommentSave,
                  annotation
                )}
              />
            )}
          />
        </WorkerPoolContextProvider>
      ) : null}
    </DiffsVirtualizedSurface>
  );
}

function DiffsVirtualizedSurface({
  children,
  contentReady,
  diffLayout,
  horizontalScrollbarsEnabled,
  onScrollPositionChange,
  scrollKey,
  scrollPosition,
  refObject
}: {
  readonly children: React.ReactNode;
  readonly contentReady: boolean;
  readonly diffLayout: DiffMode | "single";
  readonly horizontalScrollbarsEnabled: boolean;
  readonly onScrollPositionChange: (
    scrollKey: string,
    position: DiffScrollPosition
  ) => void;
  readonly refObject: React.RefObject<HTMLDivElement | null>;
  readonly scrollKey: string;
  readonly scrollPosition: DiffScrollPosition | undefined;
}): React.JSX.Element {
  const [virtualizer] = useState(
    () =>
      new DiffsVirtualizer({
        intersectionObserverMargin: 600,
        overscrollSize: 1_200,
        resizeDebugging: false
      })
  );
  const lastRestoreTokenRef = useRef<string | undefined>(undefined);
  const restoreRunIdRef = useRef(0);
  const scrollPersistenceEnabledRef = useRef(false);
  const surfaceNodeRef = useRef<HTMLDivElement | null>(null);
  const [surfaceNode, setSurfaceNode] = useState<HTMLDivElement | null>(null);
  const setDiffSurfaceRef = useCallback(
    (node: HTMLDivElement | null) => {
      refObject.current = node;
      surfaceNodeRef.current = node;
      setSurfaceNode(node);

      if (node) {
        virtualizer.setup(node);
      } else {
        virtualizer.cleanUp();
      }
    },
    [refObject, virtualizer]
  );
  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      if (!scrollPersistenceEnabledRef.current) {
        return;
      }

      onScrollPositionChange(
        scrollKey,
        normalizeDiffScrollPosition({
          left: event.currentTarget.scrollLeft,
          top: event.currentTarget.scrollTop
        })
      );
    },
    [onScrollPositionChange, scrollKey]
  );

  useLayoutEffect(() => {
    const surfaceNode = surfaceNodeRef.current;

    if (!surfaceNode) {
      return undefined;
    }

    const restoreToken = `${scrollKey}:${contentReady ? "ready" : "pending"}`;

    if (lastRestoreTokenRef.current === restoreToken) {
      return undefined;
    }

    lastRestoreTokenRef.current = restoreToken;
    const restoreRunId = restoreRunIdRef.current + 1;
    restoreRunIdRef.current = restoreRunId;
    scrollPersistenceEnabledRef.current = false;

    const restoreSurfaceNode = surfaceNode;
    const nextScrollPosition = scrollPosition ?? topDiffScrollPosition;
    const hasSavedScrollPosition = scrollPosition !== undefined;
    let animationFrameId: number | undefined;
    let frameCount = 0;
    let lastClientHeight = -1;
    let lastScrollHeight = -1;
    let lastScrollWidth = -1;
    const resizeObservedElements = new Set<Element>();
    let restoreActive = true;
    let stableFrameCount = 0;
    const requiredStableFrames = hasSavedScrollPosition && contentReady ? 120 : 12;
    const maximumRestoreFrames = hasSavedScrollPosition && contentReady ? 900 : 120;

    function stopRestoreWatchers(): void {
      restoreActive = false;
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      if (animationFrameId !== undefined) {
        window.cancelAnimationFrame(animationFrameId);
        animationFrameId = undefined;
      }
    }

    function cancelRestore(): void {
      if (restoreRunIdRef.current !== restoreRunId) {
        return;
      }

      restoreRunIdRef.current += 1;
      stopRestoreWatchers();
      scrollPersistenceEnabledRef.current = true;
    }

    function restoreScrollPosition(node: HTMLDivElement): void {
      node.scrollLeft = nextScrollPosition.left;
      node.scrollTop = nextScrollPosition.top;
    }

    function scheduleRestore(): void {
      if (!restoreActive || animationFrameId !== undefined) {
        return;
      }

      animationFrameId = window.requestAnimationFrame(restoreUntilStable);
    }

    function resetStability(): void {
      if (!restoreActive || restoreRunIdRef.current !== restoreRunId) {
        return;
      }

      stableFrameCount = 0;
      observeResizeTargets();
      scheduleRestore();
    }

    function observeResizeTarget(element: Element): void {
      if (resizeObservedElements.has(element)) {
        return;
      }

      resizeObservedElements.add(element);
      resizeObserver.observe(element);
    }

    function observeResizeTargets(): void {
      observeResizeTarget(restoreSurfaceNode);
      for (const child of restoreSurfaceNode.children) {
        observeResizeTarget(child);
      }
    }

    function restoreUntilStable(): void {
      animationFrameId = undefined;

      if (!restoreActive || restoreRunIdRef.current !== restoreRunId) {
        return;
      }

      frameCount += 1;
      restoreScrollPosition(restoreSurfaceNode);

      const restored =
        Math.abs(restoreSurfaceNode.scrollLeft - nextScrollPosition.left) <= 1 &&
        Math.abs(restoreSurfaceNode.scrollTop - nextScrollPosition.top) <= 1;
      const clientHeightStable = restoreSurfaceNode.clientHeight === lastClientHeight;
      const scrollHeightStable = restoreSurfaceNode.scrollHeight === lastScrollHeight;
      const scrollWidthStable = restoreSurfaceNode.scrollWidth === lastScrollWidth;

      stableFrameCount =
        restored && clientHeightStable && scrollHeightStable && scrollWidthStable
          ? stableFrameCount + 1
          : 0;
      lastClientHeight = restoreSurfaceNode.clientHeight;
      lastScrollHeight = restoreSurfaceNode.scrollHeight;
      lastScrollWidth = restoreSurfaceNode.scrollWidth;

      if (frameCount < maximumRestoreFrames && stableFrameCount < requiredStableFrames) {
        scheduleRestore();
        return;
      }

      stopRestoreWatchers();
      scrollPersistenceEnabledRef.current = true;
      onScrollPositionChange(
        scrollKey,
        normalizeDiffScrollPosition({
          left: restoreSurfaceNode.scrollLeft,
          top: restoreSurfaceNode.scrollTop
        })
      );
    }

    const resizeObserver = new ResizeObserver(resetStability);
    const mutationObserver = new MutationObserver(resetStability);
    observeResizeTargets();
    mutationObserver.observe(restoreSurfaceNode, {
      childList: true,
      subtree: true
    });
    restoreSurfaceNode.addEventListener("pointerdown", cancelRestore);
    restoreSurfaceNode.addEventListener("touchstart", cancelRestore, {
      passive: true
    });
    restoreSurfaceNode.addEventListener("wheel", cancelRestore, { passive: true });
    scheduleRestore();

    return () => {
      restoreRunIdRef.current += 1;
      stopRestoreWatchers();
      restoreSurfaceNode.removeEventListener("pointerdown", cancelRestore);
      restoreSurfaceNode.removeEventListener("touchstart", cancelRestore);
      restoreSurfaceNode.removeEventListener("wheel", cancelRestore);
    };
  }, [contentReady, onScrollPositionChange, scrollKey, scrollPosition]);

  return (
    <VirtualizerContext.Provider value={virtualizer}>
      <div
        className={styles.diffSurface}
        data-diff-layout={diffLayout}
        onScroll={handleScroll}
        ref={setDiffSurfaceRef}
      >
        {children}
        <DiffHorizontalScrollbars
          enabled={horizontalScrollbarsEnabled}
          refreshKey={scrollKey}
          surface={surfaceNode}
        />
        <div className={styles.diffEndSpacer} aria-hidden />
      </div>
    </VirtualizerContext.Provider>
  );
}

function DiffHorizontalScrollbars({
  enabled,
  refreshKey,
  surface
}: {
  readonly enabled: boolean;
  readonly refreshKey: string;
  readonly surface: HTMLDivElement | null;
}): React.JSX.Element | null {
  const [scrollers, setScrollers] = useState<readonly HTMLElement[]>([]);

  useLayoutEffect(() => {
    if (!enabled || !surface) {
      setScrollers([]);
      return undefined;
    }

    const activeSurface = surface;
    let animationFrameId: number | undefined;
    let retryFrames = 0;
    const resizeObserver = new ResizeObserver(scheduleDiscovery);

    function scheduleDiscovery(): void {
      if (animationFrameId !== undefined) {
        return;
      }

      animationFrameId = window.requestAnimationFrame(discoverScrollers);
    }

    function discoverScrollers(): void {
      animationFrameId = undefined;
      resizeObserver.disconnect();

      const candidates = Array.from(activeSurface.querySelectorAll("diffs-container"))
        .flatMap((host) =>
          Array.from(host.shadowRoot?.querySelectorAll("[data-code]") ?? [])
        )
        .filter(
          (candidate): candidate is HTMLElement => candidate instanceof HTMLElement
        );
      const nextScrollers = candidates.filter(
        (candidate) =>
          candidate.getBoundingClientRect().width > 0 &&
          candidate.scrollWidth - candidate.clientWidth > 1
      );

      setScrollers((current) =>
        sameElements(current, nextScrollers) ? current : nextScrollers
      );

      resizeObserver.observe(activeSurface);
      for (const candidate of candidates) {
        resizeObserver.observe(candidate);
      }

      retryFrames += 1;
      if (retryFrames < 120 && nextScrollers.length === 0) {
        scheduleDiscovery();
      }
    }

    const mutationObserver = new MutationObserver(scheduleDiscovery);
    mutationObserver.observe(activeSurface, { childList: true, subtree: true });
    discoverScrollers();

    return () => {
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      if (animationFrameId !== undefined) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, [enabled, refreshKey, surface]);

  if (scrollers.length === 0) {
    return null;
  }

  return (
    <div
      className={styles.horizontalScrollbars}
      data-diff-horizontal-scrollbars
      style={{
        gridTemplateColumns: `repeat(${String(scrollers.length)}, minmax(0, 1fr))`
      }}
    >
      {scrollers.map((scroller, index) => (
        <DiffHorizontalScrollbar
          key={`${refreshKey}:${String(index)}`}
          label={`Horizontal diff scrollbar ${String(index + 1)} of ${String(scrollers.length)}`}
          scroller={scroller}
        />
      ))}
    </div>
  );
}

function DiffHorizontalScrollbar({
  label,
  scroller
}: {
  readonly label: string;
  readonly scroller: HTMLElement;
}): React.JSX.Element {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLDivElement | null>(null);
  const dragOffsetRef = useRef<number | undefined>(undefined);
  const [metrics, setMetrics] = useState(() => horizontalScrollbarMetrics(scroller, 0));

  const updateMetrics = useCallback(() => {
    setMetrics(horizontalScrollbarMetrics(scroller, trackRef.current?.clientWidth ?? 0));
  }, [scroller]);

  useLayoutEffect(() => {
    const resizeObserver = new ResizeObserver(updateMetrics);
    const track = trackRef.current;

    if (track) {
      resizeObserver.observe(track);
    }
    resizeObserver.observe(scroller);
    scroller.addEventListener("scroll", updateMetrics, { passive: true });
    updateMetrics();

    return () => {
      resizeObserver.disconnect();
      scroller.removeEventListener("scroll", updateMetrics);
    };
  }, [scroller, updateMetrics]);

  const setScrollFromPointer = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      const dragOffset = dragOffsetRef.current;

      if (!track || dragOffset === undefined || metrics.maxScrollLeft <= 0) {
        return;
      }

      const trackRect = track.getBoundingClientRect();
      const travel = Math.max(1, trackRect.width - metrics.thumbWidth);
      const thumbLeft = Math.min(
        travel,
        Math.max(0, clientX - trackRect.left - dragOffset)
      );

      scroller.scrollLeft = (thumbLeft / travel) * metrics.maxScrollLeft;
    },
    [metrics.maxScrollLeft, metrics.thumbWidth, scroller]
  );

  return (
    <div
      aria-label={label}
      aria-orientation="horizontal"
      aria-valuemax={Math.round(metrics.maxScrollLeft)}
      aria-valuemin={0}
      aria-valuenow={Math.round(metrics.scrollLeft)}
      className={styles.horizontalScrollbarTrack}
      onKeyDown={(event) => {
        const increment = event.shiftKey ? 160 : 40;

        switch (event.key) {
          case "ArrowLeft":
            scroller.scrollLeft -= increment;
            break;
          case "ArrowRight":
            scroller.scrollLeft += increment;
            break;
          case "Home":
            scroller.scrollLeft = 0;
            break;
          case "End":
            scroller.scrollLeft = metrics.maxScrollLeft;
            break;
          default:
            return;
        }

        event.preventDefault();
      }}
      onPointerDown={(event) => {
        const thumb = thumbRef.current;
        const thumbRect = thumb?.getBoundingClientRect();
        const pointerInsideThumb =
          thumbRect !== undefined &&
          event.clientX >= thumbRect.left &&
          event.clientX <= thumbRect.right;

        dragOffsetRef.current = pointerInsideThumb
          ? event.clientX - thumbRect.left
          : metrics.thumbWidth / 2;
        event.currentTarget.setPointerCapture(event.pointerId);
        setScrollFromPointer(event.clientX);
        event.preventDefault();
      }}
      onPointerMove={(event) => {
        if (dragOffsetRef.current !== undefined) {
          setScrollFromPointer(event.clientX);
        }
      }}
      onPointerUp={(event) => {
        dragOffsetRef.current = undefined;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onWheel={(event) => {
        scroller.scrollLeft += event.deltaX || event.deltaY;
        event.preventDefault();
      }}
      ref={trackRef}
      role="scrollbar"
      tabIndex={0}
    >
      <div
        className={styles.horizontalScrollbarThumb}
        ref={thumbRef}
        style={{
          transform: `translateX(${String(metrics.thumbLeft)}px)`,
          width: `${String(metrics.thumbWidth)}px`
        }}
      />
    </div>
  );
}

function horizontalScrollbarMetrics(
  scroller: HTMLElement,
  trackWidth: number
): {
  readonly maxScrollLeft: number;
  readonly scrollLeft: number;
  readonly thumbLeft: number;
  readonly thumbWidth: number;
} {
  const maxScrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
  const minimumThumbWidth = Math.min(44, trackWidth);
  const proportionalWidth =
    scroller.scrollWidth > 0
      ? (scroller.clientWidth / scroller.scrollWidth) * trackWidth
      : 0;
  const thumbWidth = Math.max(minimumThumbWidth, Math.min(trackWidth, proportionalWidth));
  const travel = Math.max(0, trackWidth - thumbWidth);
  const scrollLeft = Math.min(maxScrollLeft, Math.max(0, scroller.scrollLeft));
  const thumbLeft = maxScrollLeft > 0 ? (scrollLeft / maxScrollLeft) * travel : 0;

  return { maxScrollLeft, scrollLeft, thumbLeft, thumbWidth };
}

function sameElements(
  current: readonly HTMLElement[],
  next: readonly HTMLElement[]
): boolean {
  return (
    current.length === next.length &&
    current.every((element, index) => element === next[index])
  );
}

function DiffFallback({
  detail,
  title
}: {
  readonly detail: string;
  readonly title: string;
}): React.JSX.Element {
  return (
    <section className={styles.diffFallback}>
      <div className={styles.diffFallbackTitle}>{title}</div>
      {detail.length > 0 ? <pre>{detail}</pre> : null}
    </section>
  );
}

function binaryPatch(patch: string): boolean {
  return /^Binary file changed /m.test(patch);
}
