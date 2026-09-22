import { describe, expect, it } from "vitest";
import { resolveSurfaceTouchTarget } from "./surface-touch-target.js";

describe("resolveSurfaceTouchTarget", () => {
  it("resolves a positive integer and prefers the explicit line type", () => {
    expect(
      resolveSurfaceTouchTarget({
        columnNumber: "12",
        lineType: "change-deletion",
        columnSide: "additions"
      })
    ).toEqual({ lineNumber: 12, side: "deletions" });
    expect(
      resolveSurfaceTouchTarget({
        columnNumber: "12",
        lineType: "change-addition",
        columnSide: "deletions"
      })
    ).toEqual({ lineNumber: 12, side: "additions" });
  });
  it("uses the column side and rejects invalid or excluded targets", () => {
    expect(
      resolveSurfaceTouchTarget({
        columnNumber: "3",
        lineType: "context",
        columnSide: "deletions"
      })
    ).toEqual({ lineNumber: 3, side: "deletions" });
    for (const columnNumber of [null, "", "0", "-1", "1.5", "abc"])
      expect(
        resolveSurfaceTouchTarget({
          columnNumber,
          lineType: null,
          columnSide: "additions"
        })
      ).toBeNull();
    expect(
      resolveSurfaceTouchTarget({
        columnNumber: "2",
        lineType: null,
        columnSide: null,
        excluded: true
      })
    ).toBeNull();
  });
});
