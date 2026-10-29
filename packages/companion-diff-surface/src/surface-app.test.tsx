import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DiffSurfaceApp, type DiffSurfaceAppState } from "./surface-app.js";

describe("diff surface app", () => {
  it("mounts the Pierre diff renderer instead of the legacy parsed row renderer", () => {
    const html = renderToStaticMarkup(<DiffSurfaceApp state={state()} />);

    expect(html).toContain('data-renderer="pierre"');
    expect(html).toContain("<diffs-container");
    expect(html).toContain("diff-surface__pierre-file");
    expect(html).not.toContain('data-renderer="parsed"');
    expect(html).not.toContain("diff-surface__row");
  });

  it("does not inject hostile diff text into static markup before Pierre renders", () => {
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
          ].join("\n"),
          path: "evil.ts"
        })}
      />
    );

    expect(html).toContain('data-renderer="pierre"');
    expect(html).not.toContain("<script>window.__xss");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("javascript:alert(1)");
  });

  it("renders comment and draft annotations into Pierre annotation slots", () => {
    const html = renderToStaticMarkup(
      <DiffSurfaceApp
        state={state({
          comments: [
            {
              body: "Please revisit this line.",
              createdBy: {
                kind: "agent",
                name: '<img src=x onerror="attack()">' + "Reviewer".repeat(12),
                runId: "run-1"
              },
              lastEditedBy: { kind: "human" },
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

    expect(html).toContain('slot="annotation-additions-1"');
    expect(html).toContain('data-comment-id="comment-1"');
    expect(html).toContain("Please revisit this line.");
    expect(html).toContain("New line 1");
    expect(html).toContain("Agent: &lt;img");
    expect(html).toContain("edited by human");
    expect(html).not.toContain("<img");
    expect(html).toContain('slot="annotation-deletions-1"');
    expect(html).toContain("Draft comment");
  });

  it("shows the file path without exposing the internal diff hash", () => {
    const html = renderToStaticMarkup(
      <DiffSurfaceApp
        state={state({
          diffHash: "difftray-file-diff-v1:internal-cache-key",
          path: "shared/src/commonMain/kotlin/com/prof18/feedflow/shared/FeedSyncIosWorker.kt"
        })}
      />
    );

    expect(html).toContain("diff-surface__path");
    expect(html).toContain(
      "shared/src/commonMain/kotlin/com/prof18/feedflow/shared/FeedSyncIosWorker.kt"
    );
    expect(html).not.toContain("diff-surface__meta");
    expect(html).not.toContain("difftray-file-diff-v1:internal-cache-key");
  });

  it("passes split mode and wrapping state to the mounted surface shell", () => {
    const html = renderToStaticMarkup(
      <DiffSurfaceApp
        state={state({
          diffMode: "split",
          wrapLines: false
        })}
      />
    );

    expect(html).toContain('data-diff-mode="split"');
    expect(html).toContain('data-diff-layout="split"');
    expect(html).toContain('data-wrap-lines="false"');
  });

  it("renders non-text parser fallbacks outside the Pierre container", () => {
    const html = renderToStaticMarkup(
      <DiffSurfaceApp
        state={state({
          patch: "Binary file changed (42 KB)",
          path: "assets/logo.png"
        })}
      />
    );

    expect(html).toContain("diff-surface__fallback");
    expect(html).toContain("No textual diff");
    expect(html).toContain("Binary file changed (42 KB)");
    expect(html).not.toContain("<diffs-container");
  });

  it("can omit the bundled file header for native chrome", () => {
    const html = renderToStaticMarkup(
      <DiffSurfaceApp state={state({ showFileHeader: false })} />
    );

    expect(html).not.toContain("diff-surface__header");
    expect(html).toContain('data-renderer="pierre"');
  });

  it("shows the whitespace-only empty state when ignoring whitespace", () => {
    const html = renderToStaticMarkup(
      <DiffSurfaceApp state={textState({ ignoreWhitespace: true })} />
    );

    expect(html).toContain(whitespaceOnlyTitle);
    expect(html).toContain(whitespaceOnlyHint);
    expect(html).not.toContain("<pre>");
  });

  it("shows whitespace with a note when a comment sits on a whitespace-only line", () => {
    const html = renderToStaticMarkup(
      <DiffSurfaceApp
        state={textState({ comments: [comment], ignoreWhitespace: true })}
      />
    );

    expect(html).toContain(commentsNotice);
    expect(html).not.toContain(whitespaceOnlyTitle);
  });

  it("shows whitespace with a note when a range comment starts on a whitespace-only line", () => {
    const oldText =
      Array.from({ length: 40 }, (_, i) => `line ${String(i + 1)}`).join("\n") + "\n";
    const newText = oldText
      .replace(/line (2[2-5])\n/g, "  line $1\n")
      .replace("line 30\n", "changed 30\n");
    const html = renderToStaticMarkup(
      <DiffSurfaceApp
        state={textState({
          comments: [{ ...comment, lineEnd: 30, lineStart: 22 }],
          ignoreWhitespace: true,
          newText,
          oldText
        })}
      />
    );

    expect(html).toContain(commentsNotice);
  });

  it("notes that a file without snapshots keeps its whitespace", () => {
    const withoutTexts = state({
      diffHash: "hash-text",
      ignoreWhitespace: true,
      patch: textState({}).patch,
      path: "src/a.ts"
    });
    const html = renderToStaticMarkup(<DiffSurfaceApp state={withoutTexts} />);

    expect(html).toContain(partialNotice);
  });

  it("shows no whitespace notes when the setting is off", () => {
    const html = renderToStaticMarkup(
      <DiffSurfaceApp state={textState({ ignoreWhitespace: false })} />
    );

    expect(html).not.toContain(whitespaceOnlyTitle);
    expect(html).not.toContain(commentsNotice);
    expect(html).not.toContain(partialNotice);
  });
});

const whitespaceOnlyTitle = "Only whitespace changed";
const whitespaceOnlyHint = "Turn off ignoring whitespace to see these changes.";
const commentsNotice =
  "Whitespace is shown for this file because it has comments on lines that only changed whitespace.";
const partialNotice =
  "Whitespace is shown for this file because it is too large to compare with whitespace ignored.";

const comment = {
  body: "why?",
  createdAt: "2026-10-27T00:00:00.000Z",
  createdBy: { kind: "human" as const },
  diffHash: "hash-text",
  id: "c1",
  lastEditedBy: { kind: "human" as const },
  lineEnd: 2,
  lineStart: 2,
  path: "src/a.ts",
  side: "additions" as const,
  updatedAt: "2026-10-27T00:00:00.000Z"
};

function textState(overrides: Partial<DiffSurfaceAppState>): DiffSurfaceAppState {
  return state({
    diffHash: "hash-text",
    newText: "if (x) {\n    foo();\n}\n",
    oldText: "if (x) {\nfoo();\n}\n",
    patch: [
      "diff --git a/src/a.ts b/src/a.ts",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -2 +2 @@",
      "-foo();",
      "+    foo();"
    ].join("\n"),
    path: "src/a.ts",
    ...overrides
  });
}

function state(overrides: Partial<DiffSurfaceAppState> = {}): DiffSurfaceAppState {
  return {
    comments: [],
    diffHash: "hash-1",
    diffMode: "unified",
    draft: null,
    ignoreWhitespace: false,
    patch:
      "diff --git a/README.md b/README.md\n--- a/README.md\n+++ b/README.md\n@@ -1 +1 @@\n-Hello\n+Hello mobile",
    path: "README.md",
    showFileHeader: true,
    status: "modified",
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
