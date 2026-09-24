import type { DiffSurfaceThemeTokens } from "./surface-bridge.js";

export function diffSurfaceThemeTokens(
  scheme: DiffSurfaceThemeTokens["scheme"]
): DiffSurfaceThemeTokens {
  return scheme === "light" ? lightThemeTokens : darkThemeTokens;
}

const lightThemeTokens: DiffSurfaceThemeTokens = {
  accent: "#0033b3",
  addedBackground: "#056614",
  addedForeground: "#056614",
  background: "#ffffff",
  commentMarker: "#0033b3",
  draftHighlight: "#a6d2ff",
  fontSizePx: 13,
  foreground: "#080808",
  foregroundMuted: "#6c707e",
  removedBackground: "#b84a54",
  removedForeground: "#a00e1b",
  scheme: "light"
};

const darkThemeTokens: DiffSurfaceThemeTokens = {
  accent: "#3474f0",
  addedBackground: "#73bd79",
  addedForeground: "#73bd79",
  background: "#191a1c",
  commentMarker: "#5da9ff",
  draftHighlight: "#264f78",
  fontSizePx: 13,
  foreground: "#bcbec4",
  foregroundMuted: "#8f939d",
  removedBackground: "#c6625b",
  removedForeground: "#ff7a70",
  scheme: "dark"
};
