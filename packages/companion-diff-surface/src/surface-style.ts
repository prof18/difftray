import type { CSSProperties } from "react";

import type { DiffSurfaceThemeTokens } from "./surface-bridge.js";

type DiffChromeTokens = {
  readonly addBackgroundStrong: string;
  readonly backgroundBuffer: string;
  readonly backgroundContext: string;
  readonly backgroundGutter: string;
  readonly backgroundSeparator: string;
  readonly deleteBackgroundStrong: string;
  readonly gutter: string;
};

export function diffSurfaceStyle(theme: DiffSurfaceThemeTokens): CSSProperties {
  const chrome = diffChromeTokens(theme.scheme);

  return {
    "--diff-surface-accent": theme.accent,
    "--diff-surface-bg": theme.background,
    "--diff-surface-fg": theme.foreground,
    "--diff-surface-muted": theme.foregroundMuted,
    "--diff-add-bg": theme.addedBackground,
    "--diff-add-bg-strong": chrome.addBackgroundStrong,
    "--diff-add-fg": theme.addedForeground,
    "--diff-bg": theme.background,
    "--diff-bg-buffer": chrome.backgroundBuffer,
    "--diff-bg-context": chrome.backgroundContext,
    "--diff-bg-gutter": chrome.backgroundGutter,
    "--diff-bg-separator": chrome.backgroundSeparator,
    "--diff-del-bg": theme.removedBackground,
    "--diff-del-bg-strong": chrome.deleteBackgroundStrong,
    "--diff-del-fg": theme.removedForeground,
    "--diff-fg": theme.foreground,
    "--diff-fg-muted": theme.foregroundMuted,
    "--diff-gutter": chrome.gutter,
    "--diff-hover": theme.draftHighlight,
    "--diff-selection": theme.draftHighlight,
    backgroundColor: theme.background,
    color: theme.foreground,
    fontSize: theme.fontSizePx
  } as CSSProperties;
}

function diffChromeTokens(scheme: DiffSurfaceThemeTokens["scheme"]): DiffChromeTokens {
  return scheme === "light" ? lightDiffChromeTokens : darkDiffChromeTokens;
}

const lightDiffChromeTokens: DiffChromeTokens = {
  addBackgroundStrong: "rgba(6, 125, 23, 0.2)",
  backgroundBuffer: "#ebecf0",
  backgroundContext: "#f5f8fe",
  backgroundGutter: "#f5f8fe",
  backgroundSeparator: "#e1eaff",
  deleteBackgroundStrong: "rgba(222, 27, 46, 0.18)",
  gutter: "#aeb3c2"
};

const darkDiffChromeTokens: DiffChromeTokens = {
  addBackgroundStrong: "rgba(115, 189, 121, 0.24)",
  backgroundBuffer: "#202124",
  backgroundContext: "#1f2024",
  backgroundGutter: "#17181a",
  backgroundSeparator: "#24262a",
  deleteBackgroundStrong: "rgba(205, 49, 49, 0.24)",
  gutter: "#4b5059"
};
