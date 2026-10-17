import type { SetWorktreeLabelBody } from "./index.js";
import type { ParseResult } from "./parse.js";

export const WORKTREE_LABEL_MAX_CODE_POINTS = 80;

// C0 controls, DEL and C1 controls.
// eslint-disable-next-line no-control-regex
const controlCharacters = /[\u0000-\u001f\u007f-\u009f]/u;

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

  const trimmed = input.trim();
  const length = Array.from(trimmed).length;

  if (length < 1 || length > WORKTREE_LABEL_MAX_CODE_POINTS) {
    return {
      error: `label must be 1 to ${String(WORKTREE_LABEL_MAX_CODE_POINTS)} characters`,
      ok: false
    };
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
