import {
  EXCERPT_MAX_LINES,
  buildFilesExcerpt,
  buildLineExcerpt,
  buildPatchExcerpt,
  type FeedbackExcerptFile,
  type ReviewCommentSide
} from "@difftray/core";

// Excerpts are best effort: every capture returns null instead of failing a save.

// Accepts Git loader content and agent review.file content (which adds "oversized").
type ExcerptContent = {
  readonly kind: string;
  readonly newText?: string;
  readonly oldText?: string;
  readonly patch?: string;
};
export type ExcerptDiff = {
  readonly content: ExcerptContent;
  readonly oversized?: true;
};
export type ExcerptLineAnchor = {
  readonly lineEnd: number;
  readonly lineStart: number;
  readonly side: ReviewCommentSide;
};
type LoadDiff = () => Promise<ExcerptDiff | null>;
type RecheckDiffHash = () => Promise<string | null | undefined>;

export function lineExcerptJson(
  content: ExcerptContent,
  anchor: ExcerptLineAnchor
): string | null {
  const text = textContent(content);
  const source = anchor.side === "additions" ? text?.newText : text?.oldText;

  if (source === undefined) {
    return null;
  }

  const excerpt = buildLineExcerpt({
    lineEnd: anchor.lineEnd,
    lineStart: anchor.lineStart,
    maxLines: EXCERPT_MAX_LINES,
    side: anchor.side,
    text: source
  });

  return excerpt ? JSON.stringify(excerpt) : null;
}

export function patchExcerptJson(content: ExcerptContent): string | null {
  const text = textContent(content);
  const excerpt = text ? buildPatchExcerpt(text.patch) : null;

  return excerpt ? JSON.stringify(excerpt) : null;
}

export function filesExcerptJson(files: readonly FeedbackExcerptFile[]): string {
  return JSON.stringify(buildFilesExcerpt(files));
}

export async function captureCommentExcerpt(
  loadDiff: LoadDiff,
  comment: ExcerptLineAnchor & { readonly diffHash: string },
  recheckDiffHash: RecheckDiffHash
): Promise<string | null> {
  const loaded = await boundDiff(loadDiff, comment.diffHash, recheckDiffHash);

  return loaded ? lineExcerptJson(loaded.content, comment) : null;
}

export async function captureFileCommentExcerpt(
  loadDiff: LoadDiff,
  diffHash: string,
  recheckDiffHash: RecheckDiffHash
): Promise<string | null> {
  const loaded = await boundDiff(loadDiff, diffHash, recheckDiffHash);

  return loaded ? patchExcerptJson(loaded.content) : null;
}

export async function captureNoteExcerpt(
  loadFiles: () => Promise<readonly FeedbackExcerptFile[]>,
  scopeId: string,
  recheckScope: () => Promise<string | null | undefined>
): Promise<string | null> {
  try {
    const files = await loadFiles();

    return (await recheckScope()) === scopeId ? filesExcerptJson(files) : null;
  } catch {
    return null;
  }
}

// The caller validated diffHash before this read; recheck it after, the bracket
// loadAnchors uses, so the excerpt matches the hash stored with the feedback.
async function boundDiff(
  loadDiff: LoadDiff,
  diffHash: string,
  recheckDiffHash: RecheckDiffHash
): Promise<ExcerptDiff | null> {
  try {
    const loaded = await loadDiff();

    if (!loaded || loaded.oversized || loaded.content.kind !== "text") {
      return null;
    }

    return (await recheckDiffHash()) === diffHash ? loaded : null;
  } catch {
    return null;
  }
}

function textContent(
  content: ExcerptContent
): (ExcerptContent & { readonly patch: string }) | null {
  return content.kind === "text" && typeof content.patch === "string"
    ? { ...content, patch: content.patch }
    : null;
}
