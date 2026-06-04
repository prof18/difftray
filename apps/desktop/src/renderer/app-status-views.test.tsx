import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { DriftToast, EmptyState, SimpleToast } from "./app-status-views.js";

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
    expect(html).toContain("Open Repository");
    expect(html).toContain("<kbd>⌘O</kbd>");
    expect(html).toContain("Recent");
    expect(html).toContain("One");
    expect(html).toContain("Five");
    expect(html).not.toContain("Six");
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
    expect(html).toContain("4 reviewed files drifted");
    expect(html).toContain("App.tsx");
    expect(html).toContain("README.md");
    expect(html).toContain("package.json");
    expect(html).not.toContain("ignored.ts");
    expect(html).toContain("+7 -4");
    expect(html).toContain("Review now");
    expect(html).toContain("Dismiss");
    expect(html).toContain('aria-label="Dismiss drift notification"');
  });

  it("renders a simple status toast", () => {
    const html = renderToStaticMarkup(<SimpleToast message="Saved review state" />);

    expect(html).toContain('role="status"');
    expect(html).toContain("Saved review state");
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
