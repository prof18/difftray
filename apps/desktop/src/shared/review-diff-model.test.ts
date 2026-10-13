import { describe, expect, it } from "vitest";

import {
  createDiffsRenderModel,
  selectableReviewLineRanges
} from "./review-diff-model.js";

const base = { diffHash: "hash", filePath: "file.txt", status: "modified" as const };
const patch = (...hunks: string[]) =>
  ["--- a/file.txt", "+++ b/file.txt", ...hunks, ""].join("\n");

describe("selectableReviewLineRanges", () => {
  it("includes full source lines outside the changed hunk for context expansion", () => {
    const oldText = Array.from({ length: 100 }, (_, i) => `line ${i}`).join("\n") + "\n";
    const newText = oldText.replace("line 50\n", "changed\n");
    const model = createDiffsRenderModel({ ...base, oldText, newText, patch: "" });
    expect(model.kind).toBe("diff");
    expect(selectableReviewLineRanges(model)).toEqual({
      additions: [{ start: 1, end: 100 }],
      deletions: [{ start: 1, end: 100 }]
    });
  });

  it("uses source hunk positions rather than compact partial line indices and merges adjacent intervals", () => {
    const model = createDiffsRenderModel({
      ...base,
      patch: patch(
        "@@ -20,2 +30,2 @@",
        " same",
        "-old",
        "+new",
        "@@ -22 +32 @@",
        "-old2",
        "+new2",
        "@@ -50 +60 @@",
        "-old3",
        "+new3"
      )
    });
    expect(selectableReviewLineRanges(model)).toEqual({
      additions: [
        { start: 30, end: 32 },
        { start: 60, end: 60 }
      ],
      deletions: [
        { start: 20, end: 22 },
        { start: 50, end: 50 }
      ]
    });
  });

  it.each(["text", "text\n", "text\r\n"])("counts a newline ending once: %j", (text) => {
    const model = createDiffsRenderModel({
      ...base,
      oldText: text,
      newText: text,
      patch: ""
    });
    expect(selectableReviewLineRanges(model)).toEqual({
      additions: [{ start: 1, end: 1 }],
      deletions: [{ start: 1, end: 1 }]
    });
  });

  it("omits empty full sides", () => {
    const model = createDiffsRenderModel({
      ...base,
      status: "added",
      newText: "new\n",
      patch: ""
    });
    expect(selectableReviewLineRanges(model)).toEqual({
      additions: [{ start: 1, end: 1 }],
      deletions: []
    });
    expect(
      selectableReviewLineRanges(
        createDiffsRenderModel({ ...base, oldText: "", newText: "", patch: "" })
      )
    ).toEqual({ additions: [], deletions: [] });
  });

  it("omits zero-count partial hunk sides", () => {
    const model = createDiffsRenderModel({
      ...base,
      patch: patch("@@ -20,0 +21,2 @@", "+one", "+two")
    });
    expect(selectableReviewLineRanges(model)).toEqual({
      additions: [{ start: 21, end: 22 }],
      deletions: []
    });
  });

  it("returns no ranges for fallback models", () => {
    expect(
      selectableReviewLineRanges(
        createDiffsRenderModel({ ...base, patch: "Binary file changed (20 bytes)" })
      )
    ).toEqual({ additions: [], deletions: [] });
  });
});
