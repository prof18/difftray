/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DiffToolbar } from "./diff-toolbar.js";

describe("DiffToolbar file comment button", () => {
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

  it("starts a file comment when clicked", () => {
    const onStartFileComment = vi.fn();
    renderToolbar({ copyDisabled: false, onStartFileComment });

    act(() => {
      fileCommentButton().click();
    });

    expect(onStartFileComment).toHaveBeenCalledOnce();
  });

  it("is disabled under the same condition as copying the report", () => {
    const onStartFileComment = vi.fn();
    renderToolbar({ copyDisabled: true, onStartFileComment });

    expect(fileCommentButton().disabled).toBe(true);
  });

  function renderToolbar({
    copyDisabled,
    onStartFileComment
  }: {
    readonly copyDisabled: boolean;
    readonly onStartFileComment: () => void;
  }): void {
    act(() => {
      root.render(
        <DiffToolbar
          commentCount={0}
          copyDisabled={copyDisabled}
          copyPending={false}
          diffMode="unified"
          diffSideFocus="both"
          disabled={false}
          file={{
            additions: 1,
            deletions: 0,
            diffHash: "hash-1",
            diffLoaded: true,
            generated: false,
            invalidated: false,
            path: "src/App.tsx",
            reviewable: true,
            reviewed: false,
            status: "modified",
            visible: true
          }}
          onCheckForUpdates={vi.fn()}
          onCopyCommentsReport={vi.fn()}
          onDiffSideFocusChange={vi.fn()}
          onOpenEditor={vi.fn()}
          onStartFileComment={onStartFileComment}
          onToggleReviewed={vi.fn()}
          refName="worktree"
          reportCommentCount={0}
          updatePhase={{ kind: "idle" }}
        />
      );
    });
  }

  function fileCommentButton(): HTMLButtonElement {
    const element = container.querySelector('[aria-label="Comment on file"]');
    if (!(element instanceof HTMLButtonElement)) {
      throw new Error("Missing file comment button");
    }
    return element;
  }
});
