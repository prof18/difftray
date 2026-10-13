export type ReviewCommentAnchorSide = "additions" | "deletions";

export type ReviewCommentAnchorRange = {
  readonly end: number;
  readonly start: number;
};

export type ValidateReviewCommentAnchorInput = {
  readonly lineEnd: number;
  readonly lineStart: number;
  readonly selectableRanges: Readonly<
    Record<ReviewCommentAnchorSide, readonly ReviewCommentAnchorRange[]>
  >;
  readonly side: ReviewCommentAnchorSide;
};

/** Returns whether an inclusive source-line range is fully selectable on the requested diff side. */
export function validateReviewCommentAnchor({
  selectableRanges,
  side,
  lineStart,
  lineEnd
}: ValidateReviewCommentAnchorInput): boolean {
  if (
    !Number.isSafeInteger(lineStart) ||
    !Number.isSafeInteger(lineEnd) ||
    lineStart <= 0 ||
    lineEnd <= 0 ||
    lineStart > lineEnd
  ) {
    return false;
  }

  const ranges = selectableRanges[side];
  const normalized = ranges
    .filter(
      ({ start, end }) =>
        Number.isSafeInteger(start) &&
        Number.isSafeInteger(end) &&
        start > 0 &&
        start <= end
    )
    .map(({ start, end }) => ({ start, end }))
    .sort((left, right) => left.start - right.start || left.end - right.end);

  let coveredThrough = lineStart - 1;
  for (const range of normalized) {
    if (range.end < coveredThrough + 1) continue;
    if (range.start > coveredThrough + 1) return false;
    coveredThrough = Math.max(coveredThrough, range.end);
    if (coveredThrough >= lineEnd) return true;
  }

  return false;
}
