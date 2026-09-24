import type { CSSProperties } from "react";

import type { DiffSurfaceThemeTokens } from "./surface-bridge.js";

type DiffChromeTokens = {
  readonly addBackgroundStrong: string;
  readonly addForegroundStrong: string;
  readonly backgroundBuffer: string;
  readonly backgroundContext: string;
  readonly backgroundGutter: string;
  readonly backgroundSeparator: string;
  readonly deleteBackgroundStrong: string;
  readonly deleteForegroundStrong: string;
  readonly gutter: string;
  readonly syntax: DiffSyntaxTokens;
};

type DiffSyntaxTokens = {
  readonly comment: string;
  readonly keyword: string;
  readonly number: string;
  readonly string: string;
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
    "--diff-add-fg-strong": chrome.addForegroundStrong,
    "--diff-bg": theme.background,
    "--diff-bg-buffer": chrome.backgroundBuffer,
    "--diff-bg-context": chrome.backgroundContext,
    "--diff-bg-gutter": chrome.backgroundGutter,
    "--diff-bg-separator": chrome.backgroundSeparator,
    "--diff-del-bg": theme.removedBackground,
    "--diff-del-bg-strong": chrome.deleteBackgroundStrong,
    "--diff-del-fg": theme.removedForeground,
    "--diff-del-fg-strong": chrome.deleteForegroundStrong,
    "--diff-fg": theme.foreground,
    "--diff-fg-muted": theme.foregroundMuted,
    "--diff-gutter": chrome.gutter,
    "--diff-hunk-bg": chrome.backgroundBuffer,
    "--diff-hover": theme.draftHighlight,
    "--diff-selection": theme.draftHighlight,
    "--diff-token-comment": chrome.syntax.comment,
    "--diff-token-keyword": chrome.syntax.keyword,
    "--diff-token-number": chrome.syntax.number,
    "--diff-token-string": chrome.syntax.string,
    backgroundColor: theme.background,
    color: theme.foreground,
    fontSize: theme.fontSizePx
  } as CSSProperties;
}

function diffChromeTokens(scheme: DiffSurfaceThemeTokens["scheme"]): DiffChromeTokens {
  return scheme === "light" ? lightDiffChromeTokens : darkDiffChromeTokens;
}

const lightDiffChromeTokens: DiffChromeTokens = {
  addBackgroundStrong: "rgba(5, 102, 20, 0.2)",
  addForegroundStrong: "#02400C",
  backgroundBuffer: "#f1f1f3",
  backgroundContext: "#ffffff",
  backgroundGutter: "#ffffff",
  backgroundSeparator: "#e5e5e8",
  deleteBackgroundStrong: "rgba(160, 14, 27, 0.18)",
  deleteForegroundStrong: "#6E0912",
  gutter: "#aeb3c2",
  syntax: {
    comment: "#6B6B6B",
    keyword: "#0033B3",
    number: "#1750EB",
    string: "#067D17"
  }
};

const darkDiffChromeTokens: DiffChromeTokens = {
  addBackgroundStrong: "rgba(115, 189, 121, 0.18)",
  addForegroundStrong: "#D4F0D6",
  backgroundBuffer: "#202124",
  backgroundContext: "#1f2024",
  backgroundGutter: "#17181a",
  backgroundSeparator: "#24262a",
  deleteBackgroundStrong: "rgba(255, 122, 112, 0.18)",
  deleteForegroundStrong: "#FFD0CB",
  gutter: "#4b5059",
  syntax: {
    comment: "#9498A0",
    keyword: "#CF8E6D",
    number: "#2AACB8",
    string: "#6AAB73"
  }
};
