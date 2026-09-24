import { describe, expect, it } from "vitest";

import { diffSurfaceStyle } from "./surface-style.js";
import { diffSurfaceThemeTokens } from "./surface-theme.js";

describe("diff surface style", () => {
  it("derives desktop dark diff chrome variables from the theme scheme", () => {
    expect(diffSurfaceStyle(diffSurfaceThemeTokens("dark"))).toMatchObject({
      "--diff-add-bg-strong": "rgba(115, 189, 121, 0.18)",
      "--diff-add-fg-strong": "#D4F0D6",
      "--diff-bg-buffer": "#202124",
      "--diff-bg-context": "#1f2024",
      "--diff-bg-gutter": "#17181a",
      "--diff-bg-separator": "#24262a",
      "--diff-del-bg-strong": "rgba(255, 122, 112, 0.18)",
      "--diff-del-fg-strong": "#FFD0CB",
      "--diff-gutter": "#4b5059",
      "--diff-hunk-bg": "#202124",
      "--diff-token-comment": "#9498A0",
      "--diff-token-keyword": "#CF8E6D",
      "--diff-token-number": "#2AACB8",
      "--diff-token-string": "#6AAB73"
    });
  });

  it("derives desktop light diff chrome variables from the theme scheme", () => {
    expect(diffSurfaceStyle(diffSurfaceThemeTokens("light"))).toMatchObject({
      "--diff-add-bg-strong": "rgba(5, 102, 20, 0.2)",
      "--diff-add-fg-strong": "#02400C",
      "--diff-bg-buffer": "#f1f1f3",
      "--diff-bg-context": "#ffffff",
      "--diff-bg-gutter": "#ffffff",
      "--diff-bg-separator": "#e5e5e8",
      "--diff-del-bg-strong": "rgba(160, 14, 27, 0.18)",
      "--diff-del-fg-strong": "#6E0912",
      "--diff-gutter": "#aeb3c2",
      "--diff-hunk-bg": "#f1f1f3",
      "--diff-token-comment": "#6B6B6B",
      "--diff-token-keyword": "#0033B3",
      "--diff-token-number": "#1750EB",
      "--diff-token-string": "#067D17"
    });
  });
});
