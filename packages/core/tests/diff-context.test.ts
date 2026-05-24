import { describe, expect, it } from "vitest";

import { parseDiffSegments } from "../src/index.js";

describe("diff context expansion model", () => {
  it("creates collapsed unchanged ranges around compact patch hunks", () => {
    const patch = [
      "diff --git a/src/example.ts b/src/example.ts",
      "index 1111111..2222222 100644",
      "--- a/src/example.ts",
      "+++ b/src/example.ts",
      "@@ -3,3 +3,3 @@",
      " line 3",
      "-line 4",
      "+changed 4",
      " line 5",
      "@@ -9,3 +9,3 @@",
      " line 9",
      "-line 10",
      "+changed 10",
      " line 11"
    ].join("\n");
    const oldText = Array.from({ length: 12 }, (_, index) => `line ${index + 1}`).join(
      "\n"
    );
    const newText = [
      "line 1",
      "line 2",
      "line 3",
      "changed 4",
      "line 5",
      "line 6",
      "line 7",
      "line 8",
      "line 9",
      "changed 10",
      "line 11",
      "line 12"
    ].join("\n");

    const segments = parseDiffSegments({ newText, oldText, patch });

    expect(segments.map((segment) => segment.kind)).toEqual([
      "collapsed_context",
      "hunk",
      "collapsed_context",
      "hunk",
      "collapsed_context"
    ]);
    expect(segments[0]).toMatchObject({
      kind: "collapsed_context",
      lineCount: 2,
      lines: [
        {
          kind: "context",
          newNumber: 1,
          oldNumber: 1,
          text: "line 1"
        },
        {
          kind: "context",
          newNumber: 2,
          oldNumber: 2,
          text: "line 2"
        }
      ]
    });
    expect(segments[2]).toMatchObject({
      kind: "collapsed_context",
      lineCount: 3,
      lines: [
        {
          kind: "context",
          newNumber: 6,
          oldNumber: 6,
          text: "line 6"
        },
        {
          kind: "context",
          newNumber: 7,
          oldNumber: 7,
          text: "line 7"
        },
        {
          kind: "context",
          newNumber: 8,
          oldNumber: 8,
          text: "line 8"
        }
      ]
    });
    expect(segments[4]).toMatchObject({
      kind: "collapsed_context",
      lineCount: 1,
      lines: [
        {
          kind: "context",
          newNumber: 12,
          oldNumber: 12,
          text: "line 12"
        }
      ]
    });
  });

  it("keeps compact patch hunks when snapshot text is unavailable", () => {
    const segments = parseDiffSegments({
      patch: "@@ -1 +1 @@\n-old\n+new\n"
    });

    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      header: "@@ -1 +1 @@",
      kind: "hunk"
    });
  });
});
