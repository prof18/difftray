import type { SetWorktreeLabelBody } from "./index.js";
import type { ParseResult } from "./parse.js";

export const WORKTREE_LABEL_MAX_CODE_POINTS = 80;

// C0 controls, DEL and C1 controls.
// eslint-disable-next-line no-control-regex
const controlCharacters = /[\u0000-\u001f\u007f-\u009f]/u;
// Bidirectional controls, zero-width/invisible characters and line or
// paragraph separators can make a label spoof another name or look blank.
// ZWJ (U+200D) and ZWNJ (U+200C) stay allowed: emoji and scripts need them.
const formattingCharacters =
  /[\u061c\u200b\u200e\u200f\u2028\u2029\u202a-\u202e\u2060\u2066-\u2069\ufeff]/u;
const joiners = /^[\u200c\u200d]*$/u;

/**
 * Validates a worktree display label. `null` is a reset. Control characters are
 * rejected on the raw value so trimming cannot hide a leading or trailing tab or
 * newline; length is counted in Unicode code points.
 */
export function normalizeWorktreeLabel(input: unknown): ParseResult<string | null> {
  if (input === null) {
    return { ok: true, value: null };
  }

  if (typeof input !== "string") {
    return { error: "label must be a string or null", ok: false };
  }

  if (controlCharacters.test(input)) {
    return { error: "label must not contain control characters", ok: false };
  }

  if (hasLoneSurrogate(input)) {
    return { error: "label must be valid Unicode text", ok: false };
  }

  if (formattingCharacters.test(input)) {
    return {
      error: "label must not contain invisible or bidirectional formatting characters",
      ok: false
    };
  }

  const trimmed = input.trim();
  const length = Array.from(trimmed).length;

  if (length < 1 || length > WORKTREE_LABEL_MAX_CODE_POINTS) {
    return {
      error: `label must be 1 to ${String(WORKTREE_LABEL_MAX_CODE_POINTS)} characters`,
      ok: false
    };
  }

  if (joiners.test(trimmed)) {
    return { error: "label must contain a visible character", ok: false };
  }

  return { ok: true, value: trimmed };
}

export function parseSetWorktreeLabelBody(
  input: unknown
): ParseResult<SetWorktreeLabelBody> {
  const record =
    typeof input === "object" && input !== null && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : undefined;
  const worktreeId = record?.worktreeId;

  if (typeof worktreeId !== "string" || worktreeId.length === 0) {
    return { error: "missing worktreeId", ok: false };
  }

  const label = normalizeWorktreeLabel(
    Object.prototype.hasOwnProperty.call(record, "label") ? record?.label : undefined
  );
  if (!label.ok) return label;

  return { ok: true, value: { label: label.value, worktreeId } };
}

// A lone surrogate cannot be stored faithfully (SQLite replaces it with
// U+FFFD). Checked by code unit so older JavaScript engines need no
// String.prototype.isWellFormed.
function hasLoneSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return true;
    }
  }
  return false;
}
