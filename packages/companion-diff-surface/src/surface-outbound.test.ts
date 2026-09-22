import { describe, expect, it } from "vitest";

import {
  createCommentTappedMessage,
  createLineRangeSelectedMessage,
  createLineSelectedMessage,
  createLineSelectedMessageForSide,
  createRenderedMessage,
  serializeSurfaceMessage
} from "./surface-outbound.js";

describe("diff surface outbound messages", () => {
  it("serializes rendered timing messages for the host", () => {
    expect(
      serializeSurfaceMessage(
        createRenderedMessage({
          endMs: 28.9,
          path: "src/example.ts",
          startMs: 12.2
        })
      )
    ).toBe(
      JSON.stringify({
        kind: "rendered",
        path: "src/example.ts",
        renderMs: 16.7
      })
    );
  });

  it("builds comment tapped messages with the persisted comment id", () => {
    expect(createCommentTappedMessage("comment-1")).toEqual({
      commentId: "comment-1",
      kind: "comment_tapped"
    });
  });

  it("builds line selection messages from selectable diff rows", () => {
    expect(
      createLineSelectedMessage({
        kind: "addition",
        newLineNumber: 12,
        text: "const next = true;"
      })
    ).toEqual({
      kind: "line_selected",
      lineEnd: 12,
      lineStart: 12,
      side: "additions",
      snippet: [{ lineNumber: 12, text: "const next = true;" }]
    });

    expect(
      createLineSelectedMessage({
        kind: "deletion",
        oldLineNumber: 8,
        text: "const old = true;"
      })
    ).toEqual({
      kind: "line_selected",
      lineEnd: 8,
      lineStart: 8,
      side: "deletions",
      snippet: [{ lineNumber: 8, text: "const old = true;" }]
    });
  });

  it("does not emit selections for hunk headers", () => {
    expect(
      createLineSelectedMessage({
        kind: "hunk",
        text: "@@ -1 +1 @@"
      })
    ).toBeNull();
  });

  it("builds side-specific selections for split context rows", () => {
    const row = {
      kind: "context" as const,
      newLineNumber: 12,
      oldLineNumber: 8,
      text: "const shared = true;"
    };

    expect(createLineSelectedMessageForSide(row, "deletions")).toEqual({
      kind: "line_selected",
      lineEnd: 8,
      lineStart: 8,
      side: "deletions",
      snippet: [{ lineNumber: 8, text: "const shared = true;" }]
    });
    expect(createLineSelectedMessageForSide(row, "additions")).toEqual({
      kind: "line_selected",
      lineEnd: 12,
      lineStart: 12,
      side: "additions",
      snippet: [{ lineNumber: 12, text: "const shared = true;" }]
    });
  });

  it("builds ordered range selections from matching gutter targets", () => {
    expect(
      createLineRangeSelectedMessage(
        {
          lineNumber: 4,
          side: "additions",
          text: "last"
        },
        {
          lineNumber: 2,
          side: "additions",
          text: "first"
        }
      )
    ).toEqual({
      kind: "line_selected",
      lineEnd: 4,
      lineStart: 2,
      side: "additions",
      snippet: [
        { lineNumber: 2, text: "first" },
        { lineNumber: 4, text: "last" }
      ]
    });
  });

  it("includes all six short-range lines and bounds longer previews", () => {
    const start = { lineNumber: 4, side: "additions" as const, text: "four" };
    const end = { lineNumber: 9, side: "additions" as const, text: "nine" };
    const read = (line: number) => `line ${String(line)}`;
    expect(createLineRangeSelectedMessage(end, start, read)).toMatchObject({
      snippet: [4, 5, 6, 7, 8, 9].map((lineNumber) => ({
        lineNumber,
        text: read(lineNumber)
      }))
    });
    expect(
      createLineRangeSelectedMessage(start, { ...end, lineNumber: 20 }, read)
    ).toMatchObject({
      snippet: [4, 5, 6, 19, 20].map((lineNumber) => ({
        lineNumber,
        text: read(lineNumber)
      }))
    });
  });

  it("rejects range selections across different sides", () => {
    expect(
      createLineRangeSelectedMessage(
        {
          lineNumber: 4,
          side: "additions",
          text: "new"
        },
        {
          lineNumber: 4,
          side: "deletions",
          text: "old"
        }
      )
    ).toBeNull();
  });
});
