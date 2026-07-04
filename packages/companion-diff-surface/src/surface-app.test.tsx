import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DiffSurfaceApp, type DiffSurfaceAppState } from "./surface-app.js";

describe("diff surface app", () => {
  it("does not inject hostile diff text into static markup", () => {
    const html = renderToStaticMarkup(
      <DiffSurfaceApp
        state={state({
          patch: [
            "diff --git a/evil.ts b/evil.ts",
            "--- a/evil.ts",
            "+++ b/evil.ts",
            "@@ -1 +1,2 @@",
            "-<script>window.__xss = true</script>",
            '+<img src=x onerror="window.__xss = true">',
            "+javascript:alert(1)"
          ].join("\n")
        })}
      />
    );

    expect(html).toContain('data-renderer="parsed"');
    expect(html).toContain("&lt;script&gt;window.__xss = true&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=&quot;window.__xss = true&quot;&gt;");
    expect(html).toContain("javascript:alert(1)");
    expect(html).not.toContain("<script>window.__xss");
    expect(html).not.toContain("<img src=x");
  });

  it("mounts the parsed diff renderer with comments and drafts", () => {
    const html = renderToStaticMarkup(
      <DiffSurfaceApp
        state={state({
          comments: [
            {
              body: "Please revisit this line.",
              createdAt: "2026-01-01T00:00:00.000Z",
              diffHash: "hash-1",
              id: "comment-1",
              lineEnd: 1,
              lineStart: 1,
              path: "README.md",
              side: "additions",
              updatedAt: "2026-01-01T00:00:00.000Z"
            }
          ],
          draft: {
            lineEnd: 1,
            lineStart: 1,
            side: "deletions"
          }
        })}
      />
    );

    expect(html).toContain('data-renderer="parsed"');
    expect(html).toContain("Please revisit this line.");
    expect(html).toContain("New line 1");
    expect(html).toContain("Draft comment");
    expect(html).not.toContain("diff-surface__patch");
  });

  it("renders split mode with separate old and new cells", () => {
    const html = renderToStaticMarkup(
      <DiffSurfaceApp
        state={state({
          diffMode: "split",
          patch: [
            "diff --git a/README.md b/README.md",
            "--- a/README.md",
            "+++ b/README.md",
            "@@ -1,2 +1,2 @@",
            " Shared",
            "-Old",
            "+New"
          ].join("\n")
        })}
      />
    );

    expect(html).toContain('data-diff-layout="split"');
    expect(html).toContain('data-split-side="deletions"');
    expect(html).toContain('data-split-side="additions"');
    expect(html).toContain("diff-surface__split-cell");
  });

  it("marks rendered rows with per-side line targets for host scrolling", () => {
    const html = renderToStaticMarkup(
      <DiffSurfaceApp
        state={state({
          patch: [
            "diff --git a/README.md b/README.md",
            "--- a/README.md",
            "+++ b/README.md",
            "@@ -1,2 +1,2 @@",
            " Shared",
            "-Old",
            "+New"
          ].join("\n"),
          scrollTo: { line: 2, side: "additions" }
        })}
      />
    );

    expect(html).toContain('data-diff-deletions-line="2"');
    expect(html).toContain('data-diff-additions-line="2"');
  });

  it("renders omitted context as expandable rows", () => {
    const html = renderToStaticMarkup(
      <DiffSurfaceApp
        state={state({
          newText: ["one", "two", "new", "four", "five"].join("\n"),
          oldText: ["one", "two", "old", "four", "five"].join("\n"),
          patch: [
            "diff --git a/README.md b/README.md",
            "--- a/README.md",
            "+++ b/README.md",
            "@@ -3 +3 @@",
            "-old",
            "+new"
          ].join("\n")
        })}
      />
    );

    expect(html).toContain("<details");
    expect(html).toContain("Show 2 unchanged lines");
    expect(html).toContain('data-row-kind="context_expander"');
  });

  it("highlights every row in the draft review range", () => {
    const html = renderToStaticMarkup(
      <DiffSurfaceApp
        state={state({
          draft: {
            lineEnd: 2,
            lineStart: 1,
            side: "additions"
          },
          patch: [
            "diff --git a/README.md b/README.md",
            "--- a/README.md",
            "+++ b/README.md",
            "@@ -0,0 +1,2 @@",
            "+First",
            "+Second"
          ].join("\n")
        })}
      />
    );

    const highlightedRows = html.match(/data-draft-highlight="true"/g) ?? [];

    expect(highlightedRows).toHaveLength(2);
  });
});

function state(overrides: Partial<DiffSurfaceAppState> = {}): DiffSurfaceAppState {
  return {
    comments: [],
    diffHash: "hash-1",
    diffMode: "unified",
    draft: null,
    patch:
      "diff --git a/README.md b/README.md\n--- a/README.md\n+++ b/README.md\n@@ -1 +1 @@\n-Hello\n+Hello mobile",
    path: "README.md",
    theme: {
      accent: "#a34d2d",
      addedBackground: "rgba(56, 142, 60, 0.16)",
      addedForeground: "#2f7d32",
      background: "#fbfaf7",
      commentMarker: "#a34d2d",
      draftHighlight: "rgba(163, 77, 45, 0.18)",
      fontSizePx: 13,
      foreground: "#151515",
      foregroundMuted: "#68645f",
      removedBackground: "rgba(198, 40, 40, 0.14)",
      removedForeground: "#b3261e",
      scheme: "light"
    },
    wrapLines: true,
    ...overrides
  };
}
