/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { FileDiffOptions } from "@pierre/diffs/react";
import type { SelectedLineRange } from "@pierre/diffs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DiffSurface } from "./diff-surface.js";

let options: FileDiffOptions<undefined, undefined> | undefined;
let selectedLines: SelectedLineRange | null | undefined;
vi.mock("@pierre/diffs/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@pierre/diffs/react")>()),
  WorkerPoolContextProvider: ({ children }: { children: React.ReactNode }) => children,
  FileDiff: (props: {
    options: FileDiffOptions<undefined, undefined>;
    selectedLines?: SelectedLineRange | null;
  }) => {
    options = props.options;
    selectedLines = props.selectedLines;
    return <div data-column-number="10">10</div>;
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
