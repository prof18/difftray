import { describe, expect, it } from "vitest";

import { parseHostMessage } from "./surface-bridge.js";

describe("diff surface host messages", () => {
  it("accepts an exact init message", () => {
    expect(
      parseHostMessage({
        diffMode: "unified",
        kind: "init",
        theme: themeTokens(),
        wrapLines: true
      })
    ).toEqual({
      diffMode: "unified",
      kind: "init",
      theme: themeTokens(),
      wrapLines: true
    });
  });

  it("rejects messages with unexpected fields", () => {
    expect(
      parseHostMessage({
        diffMode: "unified",
        debug: true,
        kind: "set_diff_mode"
      })
    ).toBeNull();
  });

  it("rejects invalid draft ranges", () => {
    expect(
      parseHostMessage({
        draft: { lineEnd: 4, lineStart: 8, side: "additions" },
        kind: "set_draft"
      })
    ).toBeNull();
  });
});

function themeTokens() {
  return {
    accent: "#a34d2d",
    addedBackground: "rgba(56, 142, 60, 0.16)",
    addedForeground: "#2f7d32",
    background: "#fbfaf7",
    commentMarker: "#a34d2d",
    draftHighlight: "rgba(163, 77, 45, 0.18)",
    fontSizePx: 13,
    foreground: "#151515",
    foregroundMuted: "#68645f",
    removedBackground: "rgba(198, 40, 40, 0.14)",
    removedForeground: "#b3261e",
    scheme: "light"
  };
}
