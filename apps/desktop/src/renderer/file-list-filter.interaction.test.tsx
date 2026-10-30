/** @vitest-environment jsdom */

import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FileFilterEmpty, FileFilterField } from "./file-list.js";

describe("FileFilterField", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("reports typed text", () => {
    const onQueryChange = vi.fn();
    renderField({ onQueryChange });

    act(() => {
      setInputValue(input(), "list");
    });

    expect(onQueryChange).toHaveBeenCalledWith("list");
  });

  it("shows the match count and a clear button only while filtering", () => {
    renderField({ query: "" });
    expect(container.textContent).not.toContain("of 40");
    expect(clearButton()).toBeUndefined();

    const onQueryChange = vi.fn();
    renderField({ matchCount: 3, onQueryChange, query: "list" });
    expect(container.textContent).toContain("3 of 40");

    act(() => {
      clearButton()?.click();
    });

    expect(onQueryChange).toHaveBeenCalledWith("");
    expect(document.activeElement).toBe(input());
  });

  it("clears on Escape, then leaves the field on a second Escape", () => {
    const onQueryChange = vi.fn();
    renderField({ onQueryChange, query: "list" });
    input().focus();

    const firstEscape = pressKey("Escape");
    expect(firstEscape.defaultPrevented).toBe(true);
    expect(onQueryChange).toHaveBeenCalledWith("");
    expect(document.activeElement).toBe(input());

    renderField({ onQueryChange, query: "" });
    input().focus();
    pressKey("Escape");
    expect(document.activeElement).not.toBe(input());
  });

  it("opens the first match on Enter", () => {
    const onSubmit = vi.fn();
    renderField({ onSubmit, query: "list" });
    input().focus();

    pressKey("Enter");

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("exposes the input through a ref", () => {
    const inputRef = createRef<HTMLInputElement>();
    renderField({ inputRef });

    expect(inputRef.current).toBe(input());
  });

  function renderField(
    props: Partial<React.ComponentProps<typeof FileFilterField>> = {}
  ): void {
    act(() => {
      root.render(
        <FileFilterField
          inputRef={createRef<HTMLInputElement>()}
          matchCount={40}
          onQueryChange={vi.fn()}
          onSubmit={vi.fn()}
          query=""
          totalCount={40}
          {...props}
        />
      );
    });
  }

  function input(): HTMLInputElement {
    const element = container.querySelector<HTMLInputElement>("input");

    if (!element) {
      throw new Error("Missing filter input");
    }

    return element;
  }

  function clearButton(): HTMLButtonElement | undefined {
    return (
      container.querySelector<HTMLButtonElement>('button[aria-label="Clear filter"]') ??
      undefined
    );
  }

  function pressKey(key: string): KeyboardEvent {
    const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key });

    act(() => {
      input().dispatchEvent(event);
    });

    return event;
  }
});

describe("FileFilterEmpty", () => {
  it("says nothing matches and clears the filter", () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const onClear = vi.fn();

    act(() => {
      root.render(<FileFilterEmpty onClear={onClear} query="zzz" />);
    });

    expect(container.textContent).toContain("No files match “zzz”");

    act(() => {
      container.querySelector("button")?.click();
    });

    expect(onClear).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});

function setInputValue(element: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set?.bind(element);
  if (!setter) throw new Error("Missing input value setter");
  setter(value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}
