import { describe, expect, it } from "vitest";

import { validateReviewCommentAnchor } from "../src/review-comment-anchors.js";

const selectableRanges = {
  additions: [
    { start: 4, end: 6 },
    { start: 1, end: 3 },
    { start: 8, end: 10 }
  ],
  deletions: [{ start: 20, end: 24 }]
};

describe("validateReviewCommentAnchor", () => {
  it("accepts a single available addition line", () => {
    expect(
      validateReviewCommentAnchor({
        selectableRanges,
        side: "additions",
        lineStart: 2,
        lineEnd: 2
      })
    ).toBe(true);
  });

  it("accepts an inclusive range covered by adjacent or overlapping intervals", () => {
    expect(
      validateReviewCommentAnchor({
        selectableRanges,
        side: "additions",
        lineStart: 2,
        lineEnd: 6
      })
    ).toBe(true);
  });

  it("rejects a range that crosses an unavailable gap", () => {
    expect(
      validateReviewCommentAnchor({
        selectableRanges,
        side: "additions",
        lineStart: 5,
        lineEnd: 8
      })
    ).toBe(false);
  });

  it("validates deletion lines against deletion ranges", () => {
    expect(
      validateReviewCommentAnchor({
        selectableRanges,
        side: "deletions",
        lineStart: 21,
        lineEnd: 24
      })
    ).toBe(true);
    expect(
      validateReviewCommentAnchor({
        selectableRanges,
        side: "deletions",
        lineStart: 21,
        lineEnd: 25
      })
    ).toBe(false);
  });

  it("rejects empty availability", () => {
    expect(
      validateReviewCommentAnchor({
        selectableRanges: { additions: [], deletions: [] },
        side: "additions",
        lineStart: 1,
        lineEnd: 1
      })
    ).toBe(false);
  });

  it.each([
    [0, 1],
    [1, 0],
    [2, 1],
    [Number.NaN, 1],
    [1, Number.POSITIVE_INFINITY],
    [Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER + 1]
  ])("rejects invalid endpoints %s..%s", (lineStart, lineEnd) => {
    expect(
      validateReviewCommentAnchor({
        selectableRanges,
        side: "additions",
        lineStart,
        lineEnd
      })
    ).toBe(false);
  });
});
