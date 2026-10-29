import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { DiffSurface } from "./diff-surface.js";

describe("DiffSurface", () => {
  it("renders fallback details for non-text diffs", () => {
    const html = renderToStaticMarkup(
      <DiffSurface
        {...diffSurfaceProps({
          patch: binaryPatch()
        })}
      />
    );

    expect(html).toContain('data-diff-layout="split"');
    expect(html).toContain("No textual diff");
    expect(html).toContain("Binary file changed");
    expect(html).toContain("sha256 abc123");
  });

  it("uses a single-column layout for added files", () => {
    const html = renderToStaticMarkup(
      <DiffSurface
        {...diffSurfaceProps({
          patch: binaryPatch("assets/new-icon.png"),
          status: "added"
        })}
      />
    );

    expect(html).toContain('data-diff-layout="single"');
  });

  it("uses a single-column layout when one side is focused", () => {
    const html = renderToStaticMarkup(
      <DiffSurface
        {...diffSurfaceProps({
          diffSideFocus: "new",
          patch: binaryPatch()
        })}
      />
    );

    expect(html).toContain('data-diff-layout="single"');
  });

  it("shows the whitespace-only empty state when ignoring whitespace", () => {
    const html = renderToStaticMarkup(
      <DiffSurface {...textProps({ ignoreWhitespace: true })} />
    );

    expect(html).toContain(whitespaceOnlyTitle);
    expect(html).toContain(whitespaceOnlyHint);
    expect(html).not.toContain("<pre>");
  });

  it("shows whitespace with a note when a comment sits on a whitespace-only line", () => {
    const html = renderToStaticMarkup(
      <DiffSurface {...textProps({ comments: [comment], ignoreWhitespace: true })} />
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
      <DiffSurface
        {...textProps({
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
    const html = renderToStaticMarkup(
      <DiffSurface
        {...textProps({ ignoreWhitespace: true, newText: undefined, oldText: undefined })}
      />
    );

    expect(html).toContain(partialNotice);
  });

  it("shows no whitespace notes when the setting is off", () => {
    const html = renderToStaticMarkup(
      <DiffSurface {...textProps({ ignoreWhitespace: false })} />
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
  diffHash: "hash-text",
  id: "c1",
  lineEnd: 2,
  lineStart: 2,
  path: "src/a.ts",
  side: "additions" as const,
  updatedAt: "2026-10-27T00:00:00.000Z"
};

function textProps(
  patch: Partial<React.ComponentProps<typeof DiffSurface>>
): React.ComponentProps<typeof DiffSurface> {
  return diffSurfaceProps({
    diffHash: "hash-text",
    filePath: "src/a.ts",
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
    scrollKey: "src/a.ts:hash-text",
    ...patch
  });
}

function diffSurfaceProps(
  patch: Partial<React.ComponentProps<typeof DiffSurface>> = {}
): React.ComponentProps<typeof DiffSurface> {
  return {
    commentDraft: undefined,
    comments: [],
    diffHash: "hash-binary",
    diffMode: "split",
    diffSideFocus: "both",
    filePath: "assets/icon.png",
    ignoreWhitespace: false,
    newText: undefined,
    oldText: undefined,
    onCancelComment: vi.fn(),
    onCommentDraftBodyChange: vi.fn(),
    onDeleteComment: vi.fn(),
    onRenderModelReady: vi.fn(),
    onSaveComment: vi.fn(() => Promise.resolve(true)),
    onScrollPositionChange: vi.fn(),
    onStartComment: vi.fn(),
    onUpdateComment: vi.fn(() => Promise.resolve(true)),
    patch: binaryPatch(),
    pendingCommentSave: undefined,
    previousPath: undefined,
    refObject: { current: null },
    resolvedTheme: "dark",
    scrollKey: "assets/icon.png:hash-binary",
    scrollPosition: undefined,
    status: "modified",
    visiblePendingCommentSave: undefined,
    wrapLines: true,
    ...patch
  };
}

function binaryPatch(path = "assets/icon.png"): string {
  return [
    `diff --git a/${path} b/${path}`,
    "Binary file changed (1024 bytes)",
    "sha256 abc123"
  ].join("\n");
}
