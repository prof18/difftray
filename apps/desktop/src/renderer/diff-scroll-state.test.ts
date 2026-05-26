import { describe, expect, it } from "vitest";

import { createDiffScrollKey, normalizeDiffScrollPosition } from "./diff-scroll-state.js";

describe("createDiffScrollKey", () => {
  it("keeps scroll memory scoped to the project, target, file, and diff content", () => {
    const baseInput = {
      diffHash: "hash-a",
      filePath: "src/app.ts",
      projectId: "/repo/a",
      reviewTargetId: "working-tree"
    };

    const baseKey = createDiffScrollKey(baseInput);

    expect(
      [
        { ...baseInput, projectId: "/repo/b" },
        { ...baseInput, reviewTargetId: "main...feature" },
        { ...baseInput, filePath: "src/other.ts" },
        { ...baseInput, diffHash: "hash-b" }
      ].map((input) => createDiffScrollKey(input))
    ).not.toContain(baseKey);
  });
});

describe("normalizeDiffScrollPosition", () => {
  it("clamps non-scrollable offsets to the top-left origin", () => {
    expect(normalizeDiffScrollPosition({ left: -12, top: Number.NaN })).toEqual({
      left: 0,
      top: 0
    });
  });

  it("keeps finite positive offsets", () => {
    expect(normalizeDiffScrollPosition({ left: 24.5, top: 320 })).toEqual({
      left: 24.5,
      top: 320
    });
  });
});
