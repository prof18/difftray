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

  it("keeps horizontal diff scrollbars visible and easy to grab", () => {
    const options = createSurfaceFileDiffOptions({
      diffMode: "unified",
      resolvedTheme: "light",
      wrapLines: false
    });

    expect(options.unsafeCSS).toEqual(expect.any(String));

    const unsafeCSS = String(options.unsafeCSS);

    expect(unsafeCSS).toContain("--diffs-scrollbar-gutter: 12px;");
    expect(unsafeCSS).toContain(
      '[data-overflow="scroll"] [data-code]::-webkit-scrollbar {'
    );
    expect(unsafeCSS).toContain("  height: 12px;");
    expect(unsafeCSS).toContain(
      '[data-overflow="scroll"] [data-code]::-webkit-scrollbar-track {'
    );
    expect(unsafeCSS).toContain(
      '[data-overflow="scroll"] [data-code]::-webkit-scrollbar-thumb {'
    );
    expect(unsafeCSS).toContain("  min-width: 44px;");
    expect(unsafeCSS).toContain(
      '[data-overflow="scroll"] [data-code]::-webkit-scrollbar-thumb:hover {'
    );
    expect(unsafeCSS).toContain(
      '[data-overflow="scroll"] [data-code]::-webkit-scrollbar-thumb:active {'
    );
    expect(unsafeCSS).toContain("@supports (-moz-appearance: none)");
    expect(unsafeCSS).toContain("  scrollbar-color:");
    expect(unsafeCSS).toContain("  scrollbar-width: auto;");
  });
});
