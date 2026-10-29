import { describe, expect, it, vi } from "vitest";

import {
  createSurfaceFileDiffOptions,
  createSurfacePierreRenderModel,
  resolveWhitespaceDisplay
} from "./surface-pierre-renderer.js";

const base = { diffHash: "hash", path: "file.txt", status: "modified" as const };
const patch = (...hunks: string[]) =>
  ["--- a/file.txt", "+++ b/file.txt", ...hunks, ""].join("\n");

describe("surface Pierre renderer", () => {
  it("gives changed-word highlights a high-contrast text color", () => {
    const unsafeCSS = String(
      createSurfaceFileDiffOptions({
        diffMode: "split",
        resolvedTheme: "dark",
        wrapLines: true
      }).unsafeCSS
    );

    expect(unsafeCSS).toContain(
      '[data-line-type="change-addition"] [data-diff-span] span {'
    );
    expect(unsafeCSS).toContain("  color: var(--diff-add-fg-strong, #d4f0d6);");
    expect(unsafeCSS).toContain(
      '[data-line-type="change-deletion"] [data-diff-span] span {'
    );
    expect(unsafeCSS).toContain("  color: var(--diff-del-fg-strong, #ffd0cb);");
  });

  it("hides horizontal diff scrollbars", () => {
    const options = createSurfaceFileDiffOptions({
      diffMode: "unified",
      resolvedTheme: "light",
      wrapLines: false
    });

    expect(options.unsafeCSS).toEqual(expect.any(String));

    const unsafeCSS = String(options.unsafeCSS);

    expect(unsafeCSS).toContain("--diffs-scrollbar-gutter: 0px;");
    expect(unsafeCSS).toContain("  scrollbar-width: none;");
    expect(unsafeCSS).toContain(
      '[data-overflow="scroll"] [data-code]::-webkit-scrollbar {'
    );
    expect(unsafeCSS).toContain("  height: 0;");
  });
});

const oldText = "if (x) {\nfoo();\n}\n";
const reindented = "if (x) {\n    foo();\n}\n";
const mixed = "if (x) {\n    foo();\n  bar();\n}\n";

describe("createSurfacePierreRenderModel with ignoreWhitespace", () => {
  it("keeps the canonical diff when the option is absent", () => {
    const model = createSurfacePierreRenderModel({
      ...base,
      oldText,
      newText: reindented,
      patch: ""
    });
    expect(model.kind).toBe("diff");
    if (model.kind !== "diff") return;
    expect(model.fileDiff.cacheKey).toBe("hash");
    expect(model.whitespaceIgnored).toBeUndefined();
    expect(model.fileDiff.hunks).toHaveLength(1);
  });

  it("returns the whitespace-only empty state", () => {
    const model = createSurfacePierreRenderModel({
      ...base,
      ignoreWhitespace: true,
      oldText,
      newText: reindented,
      patch: ""
    });
    expect(model).toEqual({
      detail: "",
      hint: "Turn off ignoring whitespace to see these changes.",
      kind: "fallback",
      title: "Only whitespace changed",
      whitespaceOnly: true
    });
  });

  it("turns re-indented lines into context and keeps real changes", () => {
    const model = createSurfacePierreRenderModel({
      ...base,
      ignoreWhitespace: true,
      oldText,
      newText: mixed,
      patch: ""
    });
    expect(model.kind).toBe("diff");
    if (model.kind !== "diff") return;
    expect(model.whitespaceIgnored).toBe(true);
    expect(model.fileDiff.cacheKey).toBe("hash:ignore-whitespace");
    expect(model.fileDiff.hunks.map((h) => [h.additionLines, h.deletionLines])).toEqual([
      [1, 0]
    ]);
    expect(model.fileDiff.additionLines[1]).toBe("    foo();\n");
  });

  it("does not report identical snapshots as whitespace-only", () => {
    const model = createSurfacePierreRenderModel({
      ...base,
      ignoreWhitespace: true,
      oldText,
      newText: oldText,
      patch: "",
      status: "renamed"
    });
    expect(model.kind).toBe("diff");
  });

  it("ignores the option on the patch path", () => {
    const model = createSurfacePierreRenderModel({
      ...base,
      ignoreWhitespace: true,
      patch: patch("@@ -1 +1 @@", "-foo();", "+    foo();")
    });
    expect(model.kind).toBe("diff");
    if (model.kind !== "diff") return;
    expect(model.whitespaceIgnored).toBeUndefined();
    expect(model.fileDiff.cacheKey).toBe("hash");
  });
});

describe("resolveWhitespaceDisplay", () => {
  const longOld = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`).join("\n") + "\n";
  const longNew = longOld
    .replace("line 5\n", "  line 5\n") // whitespace-only, far from the real change
    .replace("line 30\n", "changed 30\n"); // the real change
  const canonical = () =>
    createSurfacePierreRenderModel({
      ...base,
      oldText: longOld,
      newText: longNew,
      patch: ""
    });
  const ignored = createSurfacePierreRenderModel({
    ...base,
    ignoreWhitespace: true,
    oldText: longOld,
    newText: longNew,
    patch: ""
  });

  it("keeps the ignored model without anchors", () => {
    const thunk = vi.fn(canonical);
    const display = resolveWhitespaceDisplay({ anchors: [], canonical: thunk, ignored });
    expect(display.model).toBe(ignored);
    expect(display.notice).toBeUndefined();
    expect(thunk).not.toHaveBeenCalled();
  });

  it("keeps the ignored model when every anchor is inside a hunk", () => {
    const thunk = vi.fn(canonical);
    const display = resolveWhitespaceDisplay({
      anchors: [{ lineNumber: 30, side: "additions" }],
      canonical: thunk,
      ignored
    });
    expect(display.model).toBe(ignored);
    expect(display.notice).toBeUndefined();
    expect(thunk).not.toHaveBeenCalled();
  });

  it("falls back to the canonical diff for an addition anchor outside every hunk", () => {
    const display = resolveWhitespaceDisplay({
      anchors: [{ lineNumber: 5, side: "additions" }],
      canonical,
      ignored
    });
    expect(display.notice).toBe("comments");
    expect(display.model.kind).toBe("diff");
    if (display.model.kind !== "diff") return;
    expect(display.model.whitespaceIgnored).toBeUndefined();
    expect(display.model.fileDiff.cacheKey).toBe("hash");
  });

  it("falls back to the canonical diff for a deletion anchor outside every hunk", () => {
    const display = resolveWhitespaceDisplay({
      anchors: [{ lineNumber: 5, side: "deletions" }],
      canonical,
      ignored
    });
    expect(display.notice).toBe("comments");
  });

  it("keeps the ignored model when the canonical diff would not show the anchor either", () => {
    // Line 20 is unchanged and far from both changes, e.g. a comment on an expanded gap.
    const display = resolveWhitespaceDisplay({
      anchors: [{ lineNumber: 20, side: "additions" }],
      canonical,
      ignored
    });
    expect(display.model).toBe(ignored);
    expect(display.notice).toBeUndefined();
  });

  it("falls back to the canonical diff when a range starts on a whitespace-only line", () => {
    // Lines 22-25 are re-indented next to the real change on line 30, so the canonical
    // diff has one hunk and the ignored diff only shows lines 27-33.
    const rangeNew = longOld
      .replace(/line (2[2-5])\n/g, "  line $1\n")
      .replace("line 30\n", "changed 30\n");
    const rangeIgnored = createSurfacePierreRenderModel({
      ...base,
      ignoreWhitespace: true,
      oldText: longOld,
      newText: rangeNew,
      patch: ""
    });
    const rangeCanonical = () =>
      createSurfacePierreRenderModel({
        ...base,
        oldText: longOld,
        newText: rangeNew,
        patch: ""
      });

    const display = resolveWhitespaceDisplay({
      anchors: [{ lineNumber: 30, lineStart: 22, side: "additions" }],
      canonical: rangeCanonical,
      ignored: rangeIgnored
    });

    expect(display.notice).toBe("comments");
    expect(display.model).not.toBe(rangeIgnored);
  });

  it("falls back to the canonical diff for a range whose ends only changed whitespace", () => {
    // Lines 5 and 35 are re-indented and nothing else changed, so the ignored model is
    // the empty state and the canonical diff shows both ends but not the middle.
    const endsNew = longOld
      .replace("line 5\n", "  line 5\n")
      .replace("line 35\n", "  line 35\n");
    const endsIgnored = createSurfacePierreRenderModel({
      ...base,
      ignoreWhitespace: true,
      oldText: longOld,
      newText: endsNew,
      patch: ""
    });
    const endsCanonical = () =>
      createSurfacePierreRenderModel({
        ...base,
        oldText: longOld,
        newText: endsNew,
        patch: ""
      });

    const display = resolveWhitespaceDisplay({
      anchors: [{ lineNumber: 35, lineStart: 5, side: "additions" }],
      canonical: endsCanonical,
      ignored: endsIgnored
    });

    expect(display.notice).toBe("comments");
    expect(display.model.kind).toBe("diff");
  });

  it("keeps the ignored model when the canonical diff hides the same range lines", () => {
    // Lines 15-26 are unchanged, so both diffs collapse them; only line 30 changed.
    const display = resolveWhitespaceDisplay({
      anchors: [{ lineNumber: 30, lineStart: 15, side: "additions" }],
      canonical,
      ignored
    });

    expect(display.model).toBe(ignored);
    expect(display.notice).toBeUndefined();
  });

  it("keeps the whitespace-only state without anchors and falls back with one", () => {
    const wsOnly = createSurfacePierreRenderModel({
      ...base,
      ignoreWhitespace: true,
      oldText,
      newText: reindented,
      patch: ""
    });
    const wsCanonical = () =>
      createSurfacePierreRenderModel({
        ...base,
        oldText,
        newText: reindented,
        patch: ""
      });
    expect(
      resolveWhitespaceDisplay({ anchors: [], canonical: wsCanonical, ignored: wsOnly })
    ).toEqual({ model: wsOnly });
    const display = resolveWhitespaceDisplay({
      anchors: [{ lineNumber: 2, side: "additions" }],
      canonical: wsCanonical,
      ignored: wsOnly
    });
    expect(display.notice).toBe("comments");
    expect(display.model.kind).toBe("diff");
  });

  it("marks a patch-only model as partial", () => {
    const thunk = vi.fn(canonical);
    const patchOnly = createSurfacePierreRenderModel({
      ...base,
      ignoreWhitespace: true,
      patch: patch("@@ -1 +1 @@", "-foo();", "+    foo();")
    });
    const display = resolveWhitespaceDisplay({
      anchors: [],
      canonical: thunk,
      ignored: patchOnly
    });
    expect(display).toEqual({ model: patchOnly, notice: "partial" });
    expect(thunk).not.toHaveBeenCalled();
  });

  it("keeps a binary fallback without a notice", () => {
    const thunk = vi.fn(canonical);
    const binary = createSurfacePierreRenderModel({
      ...base,
      ignoreWhitespace: true,
      patch: "Binary file changed (20 bytes)"
    });
    const display = resolveWhitespaceDisplay({
      anchors: [{ lineNumber: 1, side: "additions" }],
      canonical: thunk,
      ignored: binary
    });
    expect(display).toEqual({ model: binary });
    expect(thunk).not.toHaveBeenCalled();
  });
});
