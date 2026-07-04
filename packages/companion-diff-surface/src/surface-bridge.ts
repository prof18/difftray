import type { ReviewCommentView } from "@difftray/companion-protocol";

export const DIFF_SURFACE_BRIDGE_VERSION = 1;

export type DiffSurfaceMode = "split" | "unified";
export type DiffSurfaceSide = "additions" | "deletions";
export type DiffSurfaceWrapLines = boolean;

export type DiffSurfaceThemeTokens = {
  readonly accent: string;
  readonly addedBackground: string;
  readonly addedForeground: string;
  readonly background: string;
  readonly commentMarker: string;
  readonly draftHighlight: string;
  readonly fontSizePx: number;
  readonly foreground: string;
  readonly foregroundMuted: string;
  readonly removedBackground: string;
  readonly removedForeground: string;
  readonly scheme: "dark" | "light";
};

export type ThemeTokens = DiffSurfaceThemeTokens;

export type DiffSurfaceDraftRange = {
  readonly lineEnd: number;
  readonly lineStart: number;
  readonly side: DiffSurfaceSide;
};

export type DiffSurfaceScrollTarget = {
  readonly line: number;
  readonly side: DiffSurfaceSide;
};

export type DiffSurfaceHostMessage =
  | {
      readonly diffMode: DiffSurfaceMode;
      readonly kind: "init";
      readonly theme: DiffSurfaceThemeTokens;
      readonly wrapLines: DiffSurfaceWrapLines;
    }
  | {
      readonly comments: readonly ReviewCommentView[];
      readonly diffHash: string;
      readonly kind: "show_file";
      readonly newText?: string;
      readonly oldText?: string;
      readonly patch: string;
      readonly path: string;
      readonly scrollTo?: DiffSurfaceScrollTarget;
    }
  | {
      readonly comments: readonly ReviewCommentView[];
      readonly kind: "set_comments";
    }
  | {
      readonly diffMode: DiffSurfaceMode;
      readonly kind: "set_diff_mode";
    }
  | {
      readonly draft: DiffSurfaceDraftRange | null;
      readonly kind: "set_draft";
    };

export type DiffSurfaceLineSnippet = {
  readonly lineNumber: number;
  readonly text: string;
};

export type DiffSurfaceMessage =
  | {
      readonly bridgeVersion: number;
      readonly kind: "ready";
    }
  | {
      readonly kind: "rendered";
      readonly path: string;
      readonly renderMs: number;
    }
  | {
      readonly kind: "line_selected";
      readonly lineEnd: number;
      readonly lineStart: number;
      readonly side: DiffSurfaceSide;
      readonly snippet: readonly DiffSurfaceLineSnippet[];
    }
  | {
      readonly commentId: string;
      readonly kind: "comment_tapped";
    }
  | {
      readonly kind: "error";
      readonly message: string;
    };

export function parseHostMessage(input: unknown): DiffSurfaceHostMessage | null {
  if (!isRecord(input)) {
    return null;
  }

  switch (input.kind) {
    case "init":
      return parseInitMessage(input);
    case "show_file":
      return parseShowFileMessage(input);
    case "set_comments":
      return parseSetCommentsMessage(input);
    case "set_diff_mode":
      return parseSetDiffModeMessage(input);
    case "set_draft":
      return parseSetDraftMessage(input);
    default:
      return null;
  }
}

function parseInitMessage(input: Record<string, unknown>): DiffSurfaceHostMessage | null {
  if (!hasOnlyKeys(input, ["diffMode", "kind", "theme", "wrapLines"])) {
    return null;
  }

  const theme = parseThemeTokens(input.theme);

  if (!isDiffMode(input.diffMode) || !theme || typeof input.wrapLines !== "boolean") {
    return null;
  }

  return {
    diffMode: input.diffMode,
    kind: "init",
    theme,
    wrapLines: input.wrapLines
  };
}

function parseShowFileMessage(
  input: Record<string, unknown>
): DiffSurfaceHostMessage | null {
  if (
    !hasOnlyKeys(input, [
      "comments",
      "diffHash",
      "kind",
      "newText",
      "oldText",
      "patch",
      "path",
      "scrollTo"
    ]) ||
    typeof input.diffHash !== "string" ||
    typeof input.patch !== "string" ||
    typeof input.path !== "string" ||
    !Array.isArray(input.comments) ||
    (input.newText !== undefined && typeof input.newText !== "string") ||
    (input.oldText !== undefined && typeof input.oldText !== "string")
  ) {
    return null;
  }

  const scrollTo = parseScrollTo(input.scrollTo);

  if (input.scrollTo !== undefined && !scrollTo) {
    return null;
  }

  return {
    comments: input.comments as readonly ReviewCommentView[],
    diffHash: input.diffHash,
    kind: "show_file",
    ...(input.newText === undefined ? {} : { newText: input.newText }),
    ...(input.oldText === undefined ? {} : { oldText: input.oldText }),
    patch: input.patch,
    path: input.path,
    ...(scrollTo ? { scrollTo } : {})
  };
}

function parseSetCommentsMessage(
  input: Record<string, unknown>
): DiffSurfaceHostMessage | null {
  if (!hasOnlyKeys(input, ["comments", "kind"]) || !Array.isArray(input.comments)) {
    return null;
  }

  return {
    comments: input.comments as readonly ReviewCommentView[],
    kind: "set_comments"
  };
}

function parseSetDiffModeMessage(
  input: Record<string, unknown>
): DiffSurfaceHostMessage | null {
  if (!hasOnlyKeys(input, ["diffMode", "kind"]) || !isDiffMode(input.diffMode)) {
    return null;
  }

  return {
    diffMode: input.diffMode,
    kind: "set_diff_mode"
  };
}

function parseSetDraftMessage(
  input: Record<string, unknown>
): DiffSurfaceHostMessage | null {
  if (!hasOnlyKeys(input, ["draft", "kind"])) {
    return null;
  }

  const draft = parseDraftRange(input.draft);

  if (input.draft !== null && !draft) {
    return null;
  }

  return {
    draft,
    kind: "set_draft"
  };
}

function parseThemeTokens(input: unknown): DiffSurfaceThemeTokens | null {
  if (
    !isRecord(input) ||
    !hasOnlyKeys(input, [
      "accent",
      "addedBackground",
      "addedForeground",
      "background",
      "commentMarker",
      "draftHighlight",
      "fontSizePx",
      "foreground",
      "foregroundMuted",
      "removedBackground",
      "removedForeground",
      "scheme"
    ]) ||
    (input.scheme !== "dark" && input.scheme !== "light") ||
    typeof input.fontSizePx !== "number" ||
    !Number.isFinite(input.fontSizePx)
  ) {
    return null;
  }

  const accent = stringField(input, "accent");
  const addedBackground = stringField(input, "addedBackground");
  const addedForeground = stringField(input, "addedForeground");
  const background = stringField(input, "background");
  const commentMarker = stringField(input, "commentMarker");
  const draftHighlight = stringField(input, "draftHighlight");
  const foreground = stringField(input, "foreground");
  const foregroundMuted = stringField(input, "foregroundMuted");
  const removedBackground = stringField(input, "removedBackground");
  const removedForeground = stringField(input, "removedForeground");

  if (
    !accent ||
    !addedBackground ||
    !addedForeground ||
    !background ||
    !commentMarker ||
    !draftHighlight ||
    !foreground ||
    !foregroundMuted ||
    !removedBackground ||
    !removedForeground
  ) {
    return null;
  }

  return {
    accent,
    addedBackground,
    addedForeground,
    background,
    commentMarker,
    draftHighlight,
    fontSizePx: input.fontSizePx,
    foreground,
    foregroundMuted,
    removedBackground,
    removedForeground,
    scheme: input.scheme
  };
}

function parseScrollTo(
  input: unknown
): { readonly line: number; readonly side: DiffSurfaceSide } | null {
  if (
    !isRecord(input) ||
    !hasOnlyKeys(input, ["line", "side"]) ||
    !isDiffSide(input.side) ||
    !isPositiveInteger(input.line)
  ) {
    return null;
  }

  return { line: input.line, side: input.side };
}

function parseDraftRange(input: unknown): DiffSurfaceDraftRange | null {
  if (
    !isRecord(input) ||
    !hasOnlyKeys(input, ["lineEnd", "lineStart", "side"]) ||
    !isDiffSide(input.side) ||
    !isPositiveInteger(input.lineStart) ||
    !isPositiveInteger(input.lineEnd) ||
    input.lineStart > input.lineEnd
  ) {
    return null;
  }

  return {
    lineEnd: input.lineEnd,
    lineStart: input.lineStart,
    side: input.side
  };
}

function isDiffMode(input: unknown): input is DiffSurfaceMode {
  return input === "split" || input === "unified";
}

function isDiffSide(input: unknown): input is DiffSurfaceSide {
  return input === "additions" || input === "deletions";
}

function isPositiveInteger(input: unknown): input is number {
  return typeof input === "number" && Number.isInteger(input) && input > 0;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}

function stringField(input: Record<string, unknown>, key: string): string | null {
  const value = input[key];

  return typeof value === "string" ? value : null;
}

function hasOnlyKeys(input: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);

  return Object.keys(input).every((key) => allowed.has(key));
}
