/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  WorktreeLabelDialog,
  type WorktreeLabelDialogProps
} from "./worktree-label-dialog.js";

describe("WorktreeLabelDialog", () => {
  let container: HTMLDivElement;
  let root: Root;
  let trigger: HTMLButtonElement;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    trigger = document.createElement("button");
    trigger.textContent = "Trigger";
    document.body.appendChild(trigger);
    trigger.focus();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    trigger.remove();
  });

  it("starts from the current override and saves the edited draft", async () => {
    const onSave = vi.fn(() => Promise.resolve());
    render({ initialLabel: "Checkout rework", onSave });

    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute("aria-label")).toBe("Worktree display name");
    expect(container.textContent).toContain("Shown in Difftray only.");
    expect(input().value).toBe("Checkout rework");
    expect(document.activeElement).toBe(input());

    typeInto("Payments");
    await act(async () => {
      await Promise.resolve();
      button("Save")?.click();
    });

    expect(onSave).toHaveBeenCalledWith("Payments");
  });

  it("starts with an empty draft when no override exists", () => {
    render({});

    expect(input().value).toBe("");
  });

  it("keeps the draft and shows the error when saving fails", async () => {
    const onSave = vi.fn(() =>
      Promise.reject(new Error("label must be 1 to 80 characters"))
    );
    render({ onSave });

    typeInto("A label");
    await act(async () => {
      await Promise.resolve();
      button("Save")?.click();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "label must be 1 to 80 characters"
    );
    expect(input().value).toBe("A label");
    expect(button("Save")?.disabled).toBe(false);
  });

  it("disables controls while a save is pending", async () => {
    let resolve: () => void = () => undefined;
    const onSave = vi.fn(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        })
    );
    render({ onSave });

    typeInto("Pending");
    act(() => {
      button("Save")?.click();
    });

    expect(button("Save")?.disabled).toBe(true);
    expect(input().disabled).toBe(true);
    act(() => {
      button("Save")?.click();
    });
    expect(onSave).toHaveBeenCalledOnce();

    await act(async () => {
      await Promise.resolve();
      resolve();
    });
  });

  it("rejects a blank draft without calling save", async () => {
    const onSave = vi.fn(() => Promise.resolve());
    render({ onSave });

    typeInto("   ");
    await act(async () => {
      await Promise.resolve();
      button("Save")?.click();
    });

    expect(onSave).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Enter a display name."
    );
  });

  it("cancels with the button or Escape and restores focus", () => {
    const onCancel = vi.fn();
    render({ onCancel });

    act(() => {
      button("Cancel")?.click();
    });
    expect(onCancel).toHaveBeenCalledOnce();

    act(() => {
      input().dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Escape" })
      );
    });
    expect(onCancel).toHaveBeenCalledTimes(2);

    act(() => {
      root.unmount();
    });
    root = createRoot(container);
    expect(document.activeElement).toBe(trigger);
  });

  it("submits with Enter", async () => {
    const onSave = vi.fn(() => Promise.resolve());
    render({ onSave });

    typeInto("Keyboard");
    await act(async () => {
      await Promise.resolve();
      input().form?.requestSubmit();
    });

    expect(onSave).toHaveBeenCalledWith("Keyboard");
  });

  it("blocks saving until the target worktree is resolved", () => {
    const onRetryTarget = vi.fn();
    render({ onRetryTarget, targetError: "Current worktree is not available." });

    expect(button("Save")?.disabled).toBe(true);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Current worktree is not available."
    );
    act(() => {
      button("Retry")?.click();
    });
    expect(onRetryTarget).toHaveBeenCalledOnce();
  });

  it("shows a stale-target error from save", async () => {
    render({
      onSave: () =>
        Promise.reject(
          new Error("Worktree is no longer available. Refresh and try again.")
        )
    });

    typeInto("Stale");
    await act(async () => {
      await Promise.resolve();
      button("Save")?.click();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Worktree is no longer available. Refresh and try again."
    );
  });

  function render(props: Partial<WorktreeLabelDialogProps>): void {
    act(() => {
      root.render(
        <WorktreeLabelDialog
          onCancel={vi.fn()}
          onSave={vi.fn(() => Promise.resolve())}
          subject="codex/checkout · /workspace/agent"
          {...props}
        />
      );
    });
  }

  function input(): HTMLInputElement {
    const element = container.querySelector<HTMLInputElement>("input");
    if (!element) throw new Error("Missing label input");
    return element;
  }

  function typeInto(value: string): void {
    const element = input();
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set?.bind(element);
    if (!setter) throw new Error("Missing input value setter");
    act(() => {
      setter(value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  function button(label: string): HTMLButtonElement | undefined {
    return [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (candidate) => candidate.textContent === label
    );
  }
});
