import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { DiffLoadingState, DiffToolbar } from "./diff-toolbar.js";

describe("diff toolbar components", () => {
  it("renders selected file metadata and enabled split-diff controls", () => {
    const html = renderToStaticMarkup(
      <DiffToolbar
        commentCount={2}
        copyDisabled={false}
        copyPending={false}
        diffMode="split"
        diffSideFocus="new"
        disabled={false}
        file={reviewFile("src/renderer/App.tsx", {
          additions: 7,
          deletions: 4,
          invalidated: true
        })}
        onCheckForUpdates={vi.fn()}
        onCopyCommentsReport={vi.fn()}
        onDiffSideFocusChange={vi.fn()}
        onOpenEditor={vi.fn()}
        onToggleReviewed={vi.fn()}
        refName="against origin/main"
        reportCommentCount={3}
        updatePhase={{ kind: "idle" }}
      />
    );

    expect(html).toContain("src/renderer");
    expect(html).toContain("App.tsx");
    expect(html).toContain("Diff changed");
    expect(html).toContain("against origin/main");
    expect(html).toContain("+7");
    expect(html).toContain("-4");
    expect(html).toContain("Copy comments report");
    expect(html).toContain('aria-label="Check for updates"');
    expect(html).toContain('aria-label="Diff side focus"');
    expect(html).toContain('aria-label="Show new version"');
    expect(html).toContain('data-active="true"');
    expect(html).toContain("Mark reviewed");
  });

  it("omits split controls in unified mode and shows pending copy state", () => {
    const html = renderToStaticMarkup(
      <DiffToolbar
        commentCount={0}
        copyDisabled={true}
        copyPending={true}
        diffMode="unified"
        diffSideFocus="both"
        disabled={true}
        file={reviewFile("README.md", { reviewed: true })}
        onCheckForUpdates={vi.fn()}
        onCopyCommentsReport={vi.fn()}
        onDiffSideFocusChange={vi.fn()}
        onOpenEditor={vi.fn()}
        onToggleReviewed={vi.fn()}
        refName="worktree"
        reportCommentCount={1}
        updatePhase={{ kind: "checking" }}
      />
    );

    expect(html).not.toContain('aria-label="Diff side focus"');
    expect(html).toContain("Generating message");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-label="Checking for updates"');
    expect(html).toContain("Unmark reviewed");
    expect(html).toContain('disabled=""');
  });

  it("disables update checks when an update is ready to install", () => {
    const html = renderToStaticMarkup(
      <DiffToolbar
        commentCount={0}
        copyDisabled={false}
        copyPending={false}
        diffMode="split"
        diffSideFocus="both"
        disabled={false}
        file={reviewFile("README.md")}
        onCheckForUpdates={vi.fn()}
        onCopyCommentsReport={vi.fn()}
        onDiffSideFocusChange={vi.fn()}
        onOpenEditor={vi.fn()}
        onToggleReviewed={vi.fn()}
        refName="worktree"
        reportCommentCount={0}
        updatePhase={{ kind: "downloaded", version: "1.2.3" }}
      />
    );

    expect(html).toContain('aria-label="Update ready to install"');
    expect(html).toContain('disabled=""');
  });

  it("renders diff loading states", () => {
    expect(
      renderToStaticMarkup(<DiffLoadingState filePath="src/App.tsx" status="loading" />)
    ).toContain("Loading diff");
    expect(
      renderToStaticMarkup(<DiffLoadingState filePath="src/App.tsx" status="idle" />)
    ).toContain("Diff not loaded");
    expect(
      renderToStaticMarkup(<DiffLoadingState filePath="src/App.tsx" status="deferred" />)
    ).toContain('aria-hidden="true"');
  });
});

function reviewFile(path: string, patch: Partial<ReviewFileView> = {}): ReviewFileView {
  return {
    additions: 1,
    deletions: 0,
    diffHash: `hash-${path}`,
    diffLoaded: false,
    generated: false,
    invalidated: false,
    path,
    reviewable: true,
    reviewed: false,
    status: "modified",
    visible: true,
    ...patch
  };
}
