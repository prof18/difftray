import { describe, expect, it } from "vitest";

import {
  COMPANION_CAPABILITY_WORKTREE_LABELS,
  normalizeWorktreeLabel,
  parseSetWorktreeLabelBody,
  WORKTREE_LABEL_MAX_CODE_POINTS
} from "../src/index.js";

describe("normalizeWorktreeLabel", () => {
  it("trims ordinary surrounding whitespace and keeps internal spaces", () => {
    expect(normalizeWorktreeLabel("  Payments   refactor  ")).toEqual({
      ok: true,
      value: "Payments   refactor"
    });
  });

  it("treats null as a reset", () => {
    expect(normalizeWorktreeLabel(null)).toEqual({ ok: true, value: null });
  });

  it("preserves Unicode text", () => {
    expect(normalizeWorktreeLabel("Café 🚀 修正")).toEqual({
      ok: true,
      value: "Café 🚀 修正"
    });
  });

  it("counts Unicode code points rather than UTF-16 units", () => {
    const atLimit = "🚀".repeat(WORKTREE_LABEL_MAX_CODE_POINTS);
    const overLimit = "🚀".repeat(WORKTREE_LABEL_MAX_CODE_POINTS + 1);

    expect(WORKTREE_LABEL_MAX_CODE_POINTS).toBe(80);
    expect(atLimit.length).toBe(160);
    expect(normalizeWorktreeLabel(atLimit)).toEqual({ ok: true, value: atLimit });
    expect(normalizeWorktreeLabel(overLimit)).toEqual({
      error: "label must be 1 to 80 characters",
      ok: false
    });
    expect(normalizeWorktreeLabel("a".repeat(80))).toEqual({
      ok: true,
      value: "a".repeat(80)
    });
    expect(normalizeWorktreeLabel(`  ${"a".repeat(80)}  `)).toEqual({
      ok: true,
      value: "a".repeat(80)
    });
  });

  it.each([
    ["leading newline", "\nLabel"],
    ["trailing newline", "Label\n"],
    ["leading tab", "\tLabel"],
    ["trailing tab", "Label\t"],
    ["carriage return", "Label\r"],
    ["internal control", "La\u0007bel"],
    ["delete", "Label\u007f"],
    ["C1 control", "Label\u0085"]
  ])("rejects control characters before trimming: %s", (_name, value) => {
    expect(normalizeWorktreeLabel(value)).toEqual({
      error: "label must not contain control characters",
      ok: false
    });
  });

  it.each([
    ["empty", ""],
    ["spaces", "   "],
    ["non-breaking spaces", "  "]
  ])("rejects a blank label: %s", (_name, value) => {
    expect(normalizeWorktreeLabel(value)).toEqual({
      error: "label must be 1 to 80 characters",
      ok: false
    });
  });

  it.each([
    ["undefined", undefined],
    ["number", 3],
    ["boolean", true],
    ["object", { label: "x" }],
    ["array", ["x"]]
  ])("rejects a non-string label: %s", (_name, value) => {
    expect(normalizeWorktreeLabel(value)).toEqual({
      error: "label must be a string or null",
      ok: false
    });
  });
});

describe("parseSetWorktreeLabelBody", () => {
  it("parses a set body with a normalized label", () => {
    expect(
      parseSetWorktreeLabelBody({ label: "  Checkout  ", worktreeId: "worktree-a" })
    ).toEqual({ ok: true, value: { label: "Checkout", worktreeId: "worktree-a" } });
  });

  it("parses a reset body", () => {
    expect(parseSetWorktreeLabelBody({ label: null, worktreeId: "worktree-a" })).toEqual({
      ok: true,
      value: { label: null, worktreeId: "worktree-a" }
    });
  });

  it("requires a worktree id", () => {
    expect(parseSetWorktreeLabelBody({ label: "Checkout" })).toEqual({
      error: "missing worktreeId",
      ok: false
    });
    expect(parseSetWorktreeLabelBody({ label: "Checkout", worktreeId: "" })).toEqual({
      error: "missing worktreeId",
      ok: false
    });
  });

  it("requires an explicit label property", () => {
    expect(parseSetWorktreeLabelBody({ worktreeId: "worktree-a" })).toEqual({
      error: "label must be a string or null",
      ok: false
    });
  });

  it("rejects invalid labels and non-object bodies", () => {
    expect(parseSetWorktreeLabelBody({ label: "  ", worktreeId: "worktree-a" })).toEqual({
      error: "label must be 1 to 80 characters",
      ok: false
    });
    expect(parseSetWorktreeLabelBody(null)).toEqual({
      error: "missing worktreeId",
      ok: false
    });
  });
});

describe("worktree label capability", () => {
  it("is negotiated as worktree-labels-v1 without a protocol bump", () => {
    expect(COMPANION_CAPABILITY_WORKTREE_LABELS).toBe("worktree-labels-v1");
  });
});
