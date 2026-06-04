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
});

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
