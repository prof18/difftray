/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DiffTargetControl } from "./file-list.js";

describe("DiffTargetControl commit tooltip", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    globalThis.ResizeObserver = class ResizeObserver {
      disconnect = vi.fn();
      observe = vi.fn();
      unobserve = vi.fn();
    };
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("shows and switches full labels quickly without repeating accessible text", () => {
    const commitSubject =
      "Recent change with a subject that is too long for the commit picker";
    const secondCommitSubject = "Another long subject used to verify quick row switching";

    act(() => {
      root.render(
        <DiffTargetControl
          baseRefDraft="main"
          branchRefs={["main"]}
          commitRefDraft="def456"
          disabled={false}
          initialOpen={true}
          mode="commit"
          onBaseRefDraftChange={vi.fn()}
          onCommitRefDraftChange={vi.fn()}
          onUseBranchDiff={vi.fn()}
          onUseCommitDiff={vi.fn()}
          onUseWorkingTreeDiff={vi.fn()}
          recentCommits={[
            {
              authoredAt: "2026-01-02T00:00:00.000Z",
              sha: "def456",
              shortSha: "def456",
              subject: commitSubject
            },
            {
              authoredAt: "2026-01-01T00:00:00.000Z",
              sha: "abc123",
              shortSha: "abc123",
              subject: secondCommitSubject
            }
          ]}
          reviewTarget={{
            commitSha: "def456",
            commitShortSha: "def456",
            commitSubject,
            headSha: "def456",
            id: "target-commit",
            kind: "commit"
          }}
        />
      );
    });

    const commitOptions = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="option"]')
    );
    const [commitOption, secondCommitOption] = commitOptions;
    const commitSubjectText = Array.from(
      commitOption?.querySelectorAll("span") ?? []
    ).find((element) => element.textContent === commitSubject);

    expect(commitOption).not.toBeNull();
    expect(secondCommitOption).not.toBeNull();
    expect(commitSubjectText).not.toBeUndefined();
    expect(commitOption?.getAttribute("title")).toBeNull();
    expect(commitOption?.dataset.state).toBe("closed");

    act(() => {
      commitSubjectText?.dispatchEvent(mousePointerEvent("pointermove"));
    });
    expect(document.body.querySelector('[role="tooltip"]')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(149);
    });
    expect(document.body.querySelector('[role="tooltip"]')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    const tooltip = document.body.querySelector<HTMLElement>('[role="tooltip"]');

    expect(tooltip?.textContent).toContain(`def456 ${commitSubject}`);
    expect(tooltip?.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(commitOption?.getAttribute("aria-describedby")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1_000);
      commitOption?.dispatchEvent(mousePointerEvent("pointermove"));
    });
    expect(document.body.querySelector('[role="tooltip"]')?.textContent).toContain(
      `def456 ${commitSubject}`
    );

    act(() => {
      commitOption?.dispatchEvent(mousePointerEvent("pointerout", secondCommitOption));
      secondCommitOption?.dispatchEvent(mousePointerEvent("pointermove"));
    });
    expect(document.body.querySelector('[role="tooltip"]')?.textContent).toContain(
      `abc123 ${secondCommitSubject}`
    );

    act(() => {
      secondCommitOption?.dispatchEvent(mousePointerEvent("pointerout", document.body));
    });
    expect(document.body.querySelector('[role="tooltip"]')).toBeNull();

    act(() => {
      commitOption?.focus();
    });

    const focusedTooltip = document.body.querySelector<HTMLElement>('[role="tooltip"]');

    expect(focusedTooltip?.textContent).toContain(`def456 ${commitSubject}`);
    expect(focusedTooltip?.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(commitOption?.getAttribute("aria-describedby")).toBeNull();
  });
});

function mousePointerEvent(
  type: string,
  relatedTarget: EventTarget | null = null
): MouseEvent {
  const event = new MouseEvent(type, { bubbles: true, relatedTarget });

  Object.defineProperty(event, "pointerType", { value: "mouse" });

  return event;
}
