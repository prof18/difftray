/** @vitest-environment jsdom */

import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDialogFocusTrap } from "./dialog-focus.js";

describe("useDialogFocusTrap", () => {
  let container: HTMLDivElement;
  let opener: HTMLButtonElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    opener.remove();
  });

  it("marks pointer-focused controls while restoring focus", () => {
    vi.spyOn(opener, "matches").mockReturnValue(false);
    act(() => root.render(<Dialog />));

    act(() => root.unmount());

    expect(document.activeElement).toBe(opener);
    expect(opener.hasAttribute("data-dialog-focus-restored")).toBe(true);

    opener.blur();
    expect(opener.hasAttribute("data-dialog-focus-restored")).toBe(false);
  });

  // Opening a dialog with the mouse (or the app menu) moved focus to its first
  // control with a full focus ring before any keyboard use.
  it("hides the ring on the first control when the dialog opened without the keyboard", () => {
    vi.spyOn(opener, "matches").mockReturnValue(false);
    act(() => root.render(<Dialog />));
    const inside = container.querySelector("button");

    expect(document.activeElement).toBe(inside);
    expect(inside?.hasAttribute("data-dialog-pointer-focus")).toBe(true);

    act(() => {
      inside?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Tab" }));
    });
    expect(inside?.hasAttribute("data-dialog-pointer-focus")).toBe(false);
  });

  it("keeps the ring on the first control when the dialog opened from the keyboard", () => {
    vi.spyOn(opener, "matches").mockReturnValue(true);
    act(() => root.render(<Dialog />));

    expect(
      container.querySelector("button")?.hasAttribute("data-dialog-pointer-focus")
    ).toBe(false);
  });

  it("keeps the normal focus indicator for keyboard-focused controls", () => {
    vi.spyOn(opener, "matches").mockReturnValue(true);
    act(() => root.render(<Dialog />));

    act(() => root.unmount());

    expect(document.activeElement).toBe(opener);
    expect(opener.hasAttribute("data-dialog-focus-restored")).toBe(false);
  });
});

function Dialog(): React.JSX.Element {
  const ref = useRef<HTMLElement>(null);
  useDialogFocusTrap(ref);
  return (
    <section ref={ref}>
      <button type="button">Inside</button>
    </section>
  );
}
