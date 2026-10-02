/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { FileDiffOptions } from "@pierre/diffs/react";
import type { DiffLineAnnotation, SelectedLineRange } from "@pierre/diffs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DiffSurface } from "./diff-surface.js";
import type {
  ReviewCommentAnnotationMetadata,
  ReviewCommentDraft
} from "./review-comments.js";

let options: FileDiffOptions<undefined, undefined> | undefined;
let selectedLines: SelectedLineRange | null | undefined;
let lineAnnotations: DiffLineAnnotation<ReviewCommentAnnotationMetadata>[] | undefined;
vi.mock("@pierre/diffs/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@pierre/diffs/react")>()),
  WorkerPoolContextProvider: ({ children }: { children: React.ReactNode }) => children,
  FileDiff: (props: {
    options: FileDiffOptions<undefined, undefined>;
    selectedLines?: SelectedLineRange | null;
    lineAnnotations: DiffLineAnnotation<ReviewCommentAnnotationMetadata>[];
    renderAnnotation: (
      annotation: DiffLineAnnotation<ReviewCommentAnnotationMetadata>
    ) => React.ReactNode;
  }) => {
    options = props.options;
    selectedLines = props.selectedLines;
    lineAnnotations = props.lineAnnotations;
    return (
      <>
        <div data-column-number="10">10</div>
        {props.lineAnnotations.map((annotation) => (
          <div key={`${annotation.side}:${String(annotation.lineNumber)}`}>
            {props.renderAnnotation(annotation)}
          </div>
        ))}
      </>
    );
  }
}));
vi.mock("@pierre/diffs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@pierre/diffs")>()),
  Virtualizer: class {
    setup() {
      return undefined;
    }
    cleanUp() {
      return undefined;
    }
  }
}));

describe("desktop comment selection", () => {
  let root: Root;
  let container: HTMLDivElement;
  let props: React.ComponentProps<typeof DiffSurface>;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {
          return undefined;
        }
        disconnect() {
          return undefined;
        }
      }
    );
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    props = {
      commentDraft: undefined,
      comments: [],
      diffHash: "hash",
      diffMode: "unified",
      diffSideFocus: "both",
      filePath: "a.ts",
      newText: undefined,
      oldText: undefined,
      onCancelComment: vi.fn(),
      onCommentDraftBodyChange: vi.fn(),
      onDeleteComment: vi.fn(),
      onRenderModelReady: vi.fn(),
      onSaveComment: vi.fn(() => Promise.resolve(true)),
      onScrollPositionChange: vi.fn(),
      onStartComment: vi.fn(),
      onUpdateComment: vi.fn(() => Promise.resolve(true)),
      patch: "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-a\n+b",
      pendingCommentSave: undefined,
      previousPath: undefined,
      refObject: { current: null },
      resolvedTheme: "dark",
      scrollKey: "a",
      scrollPosition: undefined,
      status: "modified",
      visiblePendingCommentSave: undefined,
      wrapLines: true
    };
    render();
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  function render() {
    act(() => root.render(<DiffSurface {...props} />));
  }
  function pointer(type: string, y = 10) {
    const event = new MouseEvent(type, { bubbles: true, clientY: y, button: 0 });
    Object.defineProperties(event, {
      pointerId: { value: 1 },
      pointerType: { value: "mouse" }
    });
    act(() => {
      container.querySelector("[data-column-number]")?.dispatchEvent(event);
    });
  }
  function click(lineNumber: number) {
    const element = container.querySelector<HTMLElement>("[data-column-number]");
    if (!element) throw new Error("Missing gutter");
    act(() => {
      options?.onLineNumberClick?.({
        annotationSide: "additions",
        event: new MouseEvent("click", { detail: 1 }) as PointerEvent,
        lineElement: element,
        numberElement: element,
        lineNumber,
        numberColumn: true,
        type: "diff-line",
        lineType: "change-addition"
      });
    });
  }

  it("updates draft text without invalidating the diff layout or selection callbacks", () => {
    const draft: ReviewCommentDraft = {
      body: "",
      diffHash: "hash",
      lineEnd: 1,
      lineStart: 1,
      path: "a.ts",
      side: "additions"
    };
    props = {
      ...props,
      commentDraft: draft
    };
    render();
    const initialAnnotations = lineAnnotations;
    const initialOptions = options;
    const onStartComment = vi.fn();
    const typedDraft = { ...draft, body: "Keep this clear." };
    props = {
      ...props,
      commentDraft: typedDraft,
      onStartComment
    };
    render();

    expect(lineAnnotations).toBe(initialAnnotations);
    expect(options).toBe(initialOptions);
    expect(container.querySelector("textarea")?.value).toBe("Keep this clear.");
    pointer("pointerdown");
    pointer("pointerup");
    click(1);
    expect(onStartComment).toHaveBeenCalledOnce();

    props = { ...props, commentDraft: { ...typedDraft, lineEnd: 2 } };
    render();
    expect(lineAnnotations).not.toBe(initialAnnotations);
    expect(container.textContent).toContain("New lines 1-2");
    expect(container.querySelector("textarea")?.value).toBe("Keep this clear.");
  });

  it("dispatches a click once and never creates a comment from a controlled highlight", () => {
    pointer("pointerdown");
    pointer("pointerup");
    act(() => options?.onLineSelectionEnd?.({ start: 10, end: 10, side: "additions" }));
    click(10);
    expect(props.onStartComment).toHaveBeenCalledExactlyOnceWith({
      kind: "click",
      side: "additions",
      start: 10,
      end: 10
    });
    expect(options?.onLineSelected).toBeUndefined();
  });

  it("commits the raw reverse range only at release and consumes its click", () => {
    pointer("pointerdown");
    act(() => options?.onLineSelectionStart?.({ start: 15, end: 15, side: "additions" }));
    pointer("pointermove", 50);
    const range: SelectedLineRange = { start: 15, end: 10, side: "additions" };
    act(() => options?.onLineSelectionChange?.(range));
    render();
    expect(selectedLines).toEqual(range);
    expect(props.onStartComment).not.toHaveBeenCalled();
    pointer("pointerup", 50);
    act(() => options?.onLineSelectionEnd?.(range));
    click(10);
    expect(props.onStartComment).toHaveBeenCalledExactlyOnceWith({
      kind: "range",
      side: "additions",
      start: 15,
      end: 10
    });
  });

  it("does not turn a canceled or cross-side drag into a single-line comment", () => {
    pointer("pointerdown");
    pointer("pointermove", 50);
    pointer("pointerup", 50);
    act(() =>
      options?.onLineSelectionEnd?.({
        start: 10,
        end: 12,
        side: "additions",
        endSide: "deletions"
      })
    );
    click(12);
    expect(props.onStartComment).not.toHaveBeenCalled();
    pointer("pointerdown");
    pointer("pointercancel");
    click(10);
    expect(props.onStartComment).not.toHaveBeenCalled();
  });
});
