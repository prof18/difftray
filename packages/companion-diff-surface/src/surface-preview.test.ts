import { describe, expect, it } from "vitest";
import { parseHostMessage } from "./surface-bridge.js";
import { previewSegments } from "./surface-preview.js";

describe("comment preview bridge", () => {
  it("keeps six lines together and expands long ranges without losing original offsets", () => {
    const lines = Array.from({ length: 9 }, (_, i) => `line ${String(i)}`);
    expect(previewSegments(lines.slice(0, 6).join("\n"), 40, false)).toEqual([
      { lines: lines.slice(0, 6), lineStart: 40 }
    ]);
    expect(previewSegments(lines.join("\n"), 40, false)).toEqual([
      { lines: lines.slice(0, 3), lineStart: 40 },
      { lines: lines.slice(-2), lineStart: 47 }
    ]);
    expect(previewSegments(lines.join("\n"), 40, true)).toEqual([
      { lines, lineStart: 40 }
    ]);
  });
  const message = {
    kind: "show_preview",
    path: "sample.tsx",
    text: "<View />\n",
    lineStart: 3,
    side: "additions"
  };
  it("accepts a source snapshot with original line numbering", () => {
    expect(parseHostMessage(message)).toEqual(message);
  });
  it("rejects invalid offsets and sides", () => {
    for (const lineStart of [0, -1, 1.5, Infinity]) {
      expect(parseHostMessage({ ...message, lineStart })).toBeNull();
    }
    expect(parseHostMessage({ ...message, side: "other" })).toBeNull();
  });
});
