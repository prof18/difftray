import { describe, expect, it } from "vitest";

import { createSurfaceFileDiffOptions } from "./surface-pierre-renderer.js";

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
