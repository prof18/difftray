import { describe, expect, it } from "vitest";

import { diffSurfaceThemeTokens } from "./surface-theme.js";

describe("diff surface theme tokens", () => {
  it("ports the desktop light diff palette", () => {
    expect(diffSurfaceThemeTokens("light")).toEqual({
      accent: "#0033b3",
      addedBackground: "rgba(6, 125, 23, 0.11)",
      addedForeground: "#067d17",
      background: "#ffffff",
      commentMarker: "#0033b3",
      draftHighlight: "#a6d2ff",
      fontSizePx: 13,
      foreground: "#080808",
      foregroundMuted: "#6c707e",
      removedBackground: "rgba(222, 27, 46, 0.1)",
      removedForeground: "#de1b2e",
      scheme: "light"
    });
  });

  it("ports the desktop dark diff palette", () => {
    expect(diffSurfaceThemeTokens("dark")).toEqual({
      accent: "#3474f0",
      addedBackground: "rgba(115, 189, 121, 0.14)",
      addedForeground: "#73bd79",
      background: "#191a1c",
      commentMarker: "#5da9ff",
      draftHighlight: "#264f78",
      fontSizePx: 13,
      foreground: "#bcbec4",
      foregroundMuted: "#8f939d",
      removedBackground: "rgba(205, 49, 49, 0.14)",
      removedForeground: "#cd3131",
      scheme: "dark"
    });
  });
});
