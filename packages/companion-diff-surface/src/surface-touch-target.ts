export type TouchLineTarget = {
  readonly lineNumber: number;
  readonly side: "additions" | "deletions";
};

export function resolveSurfaceTouchTarget(input: {
  readonly columnNumber: string | null;
  readonly lineType: string | null;
  readonly columnSide: "additions" | "deletions" | null;
  readonly excluded?: boolean;
}): TouchLineTarget | null {
  if (input.excluded || !input.columnNumber || !/^\d+$/.test(input.columnNumber))
    return null;
  const lineNumber = Number(input.columnNumber);
  if (!Number.isSafeInteger(lineNumber) || lineNumber <= 0) return null;
  const side =
    input.lineType === "change-deletion"
      ? "deletions"
      : input.lineType === "change-addition"
        ? "additions"
        : (input.columnSide ?? "additions");
  return { lineNumber, side };
}
