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

  it("renders syntax token spans for code files without changing diff text", () => {
    const html = renderToStaticMarkup(
      <DiffSurfaceApp
        state={state({
          path: "src/example.ts",
          patch: [
            "diff --git a/src/example.ts b/src/example.ts",
            "--- a/src/example.ts",
            "+++ b/src/example.ts",
            "@@ -1 +1 @@",
            "-const value = 41;",
            "+const value = 'mobile'; // changed"
          ].join("\n")
        })}
      />
    );

    expect(html).toContain('data-token-kind="keyword"');
    expect(html).toContain('data-token-kind="number"');
    expect(html).toContain('data-token-kind="string"');
    expect(html).toContain('data-token-kind="comment"');
    expect(html).toContain("const");
    expect(html).toContain("&#x27;mobile&#x27;");
  });

  it("skips syntax token spans for large code files", () => {
    const html = renderToStaticMarkup(
      <DiffSurfaceApp
        state={state({
          path: "src/large.ts",
          patch: largeAddedFilePatch(3000)
        })}
      />
    );

    expect(html).toContain("const value2999 = 2999;");
    expect(html).not.toContain('data-token-kind="keyword"');
    expect(html).not.toContain('data-token-kind="number"');
  });

  it("keeps highlighted hostile code text inert", () => {
    const html = renderToStaticMarkup(
      <DiffSurfaceApp
        state={state({
          path: "src/evil.ts",
          patch: [
            "diff --git a/src/evil.ts b/src/evil.ts",
            "--- a/src/evil.ts",
            "+++ b/src/evil.ts",
            "@@ -1 +1 @@",
            "-const html = '<img src=x onerror=\"window.__xss = true\">';",
            "+const script = '<script>window.__xss = true</script>'; // keep inert"
          ].join("\n")
        })}
      />
    );

    expect(html).toContain('data-token-kind="string"');
    expect(html).toContain('data-token-kind="comment"');
    expect(html).toContain("&lt;script&gt;window.__xss = true&lt;/script&gt;");
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

  it("renders line-number gutter targets for unified and split line selection", () => {
    const unified = renderToStaticMarkup(
      <DiffSurfaceApp
        state={state({
          patch: [
            "diff --git a/README.md b/README.md",
            "--- a/README.md",
            "+++ b/README.md",
            "@@ -1 +1 @@",
            "-Old",
            "+New"
          ].join("\n")
        })}
      />
    );
    const split = renderToStaticMarkup(
      <DiffSurfaceApp
        state={state({
          diffMode: "split",
          patch: [
            "diff --git a/README.md b/README.md",
            "--- a/README.md",
            "+++ b/README.md",
            "@@ -1 +1 @@",
            "-Old",
            "+New"
          ].join("\n")
        })}
      />
    );

    expect(unified).toContain('data-line-select-target="gutter"');
    expect(unified).toContain('aria-label="Select deletions line 1"');
    expect(unified).toContain('aria-label="Select additions line 1"');
    expect(split).toContain('data-line-select-side="deletions"');
    expect(split).toContain('data-line-select-side="additions"');
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

function largeAddedFilePatch(lineCount: number): string {
  return [
    "diff --git a/src/large.ts b/src/large.ts",
    "new file mode 100644",
    "--- /dev/null",
    "+++ b/src/large.ts",
    `@@ -0,0 +1,${String(lineCount)} @@`,
    ...Array.from(
      { length: lineCount },
      (_, index) => `+const value${String(index)} = ${String(index)};`
    )
  ].join("\n");
}
