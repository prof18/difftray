import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  DriftToast,
  EmptyState,
  SimpleToast,
  ToastStack,
  UpdateRestartBanner
} from "./app-status-views.js";

describe("app status views", () => {
  it("renders the empty repository state with recent projects capped", () => {
    const html = renderToStaticMarkup(
      <EmptyState
        disabled={false}
        onOpenProject={vi.fn()}
        onSelectProject={vi.fn()}
        projects={[
          project("one", "One"),
          project("two", "Two"),
          project("three", "Three"),
          project("four", "Four"),
          project("five", "Five"),
          project("six", "Six")
        ]}
      />
    );

    expect(html).toContain('aria-label="No repository open"');
    expect(html).toContain("No repository open");
    expect(html).toContain("flags files that change after review");
    expect(html).not.toContain("drifts");
    expect(html).toContain("Open Repository");
    expect(html).toContain("<kbd>⌘O</kbd>");
    expect(html).toContain("Recent");
    expect(html).toContain("One");
    expect(html).toContain("Five");
    expect(html).not.toContain("Six");
  });

  // The empty window offered only Open Repository; folder scanning and dropping a
  // folder on the window were not mentioned.
  it("offers scanning a folder and dropping one, besides opening a repository", () => {
    const html = renderToStaticMarkup(
      <EmptyState
        disabled={false}
        onOpenProject={vi.fn()}
        onScanFolder={vi.fn()}
        onSelectProject={vi.fn()}
        projects={[]}
      />
    );

    expect(html).toContain("Scan a folder…");
    expect(html).toContain("Or drop a folder onto this window.");
  });

  // The two buttons were loose children of the centred column: stacked with no
  // gap and centred on different widths, they read as one lopsided block.
  it("groups the empty-state actions in one row", () => {
    const html = renderToStaticMarkup(
      <EmptyState
        disabled={false}
        onOpenProject={vi.fn()}
        onScanFolder={vi.fn()}
        onSelectProject={vi.fn()}
        projects={[]}
      />
    );

    const group = /<div[^>]*data-testid="empty-state-actions"[^>]*>(.*?)<\/div>/s.exec(
      html
    );
    expect(group?.[1]).toContain("Open Repository");
    expect(group?.[1]).toContain("Scan a folder…");
  });

  it("renders reviewed drift notification with the actionable files", () => {
    const html = renderToStaticMarkup(
      <DriftToast
        files={[
          reviewFile("src/App.tsx", { additions: 7, deletions: 4 }),
          reviewFile("docs/README.md", { additions: 2, deletions: 1 }),
          reviewFile("package.json", { additions: 1, deletions: 0 }),
          reviewFile("ignored.ts", { additions: 9, deletions: 9 })
        ]}
        onClose={vi.fn()}
        onReviewNow={vi.fn()}
      />
    );

    expect(html).toContain('role="status"');
    expect(html).toContain("4 files changed after review");
    expect(html).toContain("App.tsx");
    expect(html).toContain("README.md");
    expect(html).toContain("package.json");
    expect(html).not.toContain("ignored.ts");
    expect(html).toContain("+7 -4");
    expect(html).toContain("Review now");
    expect(html).toContain("Dismiss");
    expect(html).toContain('aria-label="Dismiss drift notification"');
  });

  it("uses the singular for one changed file", () => {
    const html = renderToStaticMarkup(
      <DriftToast
        files={[reviewFile("src/App.tsx", { additions: 1, deletions: 1 })]}
        onClose={vi.fn()}
        onReviewNow={vi.fn()}
      />
    );

    expect(html).toContain("1 file changed after review");
  });

  it("stacks toasts in one region instead of overlapping them", () => {
    const html = renderToStaticMarkup(
      <ToastStack>
        <DriftToast
          files={[reviewFile("src/App.tsx", { additions: 1, deletions: 1 })]}
          onClose={vi.fn()}
          onReviewNow={vi.fn()}
        />
        <SimpleToast message="Copied 1 review comment" />
      </ToastStack>
    );

    expect(html).toContain('data-testid="toast-stack"');
    expect(html.indexOf("changed after review")).toBeLessThan(
      html.indexOf("Copied 1 review comment")
    );
  });

  it("renders nothing for an empty toast stack", () => {
    expect(renderToStaticMarkup(<ToastStack>{null}</ToastStack>)).toBe("");
  });

  it("renders a simple status toast", () => {
    const html = renderToStaticMarkup(<SimpleToast message="Saved review state" />);

    expect(html).toContain('role="status"');
    expect(html).toContain("Saved review state");
  });

  it("renders the downloaded update restart banner", () => {
    const html = renderToStaticMarkup(
      <UpdateRestartBanner onRestart={vi.fn()} version="1.2.3" />
    );

    expect(html).toContain('role="status"');
    expect(html).toContain("Update ready");
    expect(html).toContain("Difftray 1.2.3 is ready.");
    expect(html).toContain("Restart to update");
  });
});

function project(id: string, name: string): RecentProjectView {
  return {
    id,
    name,
    path: `/workspace/${id}`
  };
}

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
