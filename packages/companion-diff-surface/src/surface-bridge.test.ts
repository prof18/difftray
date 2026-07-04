import { describe, expect, it } from "vitest";

import { parseHostMessage } from "./surface-bridge.js";
import {
  createDiffSurfaceHostMessageFrames,
  createDiffSurfaceHostMessageReceiver
} from "./surface-host-message-receiver.js";

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

  it("reassembles chunked host messages before strict parsing", () => {
    const receiver = createDiffSurfaceHostMessageReceiver();
    const message = JSON.stringify({
      comments: [],
      diffHash: "hash-large",
      kind: "show_file",
      patch: largePatch(),
      path: "src/large.ts"
    });
    const chunkSize = 64 * 1024;
    const chunks = Array.from(
      { length: Math.ceil(message.length / chunkSize) },
      (_, index) => message.slice(index * chunkSize, (index + 1) * chunkSize)
    );

    for (let index = 0; index < chunks.length - 1; index += 1) {
      expect(
        receiver.receive({
          data: chunks[index],
          id: "large-message",
          index,
          kind: "chunk",
          total: chunks.length
        })
      ).toEqual({ kind: "pending" });
    }

    expect(
      receiver.receive({
        data: chunks[chunks.length - 1],
        id: "large-message",
        index: chunks.length - 1,
        kind: "chunk",
        total: chunks.length
      })
    ).toEqual({
      kind: "message",
      message: expect.objectContaining({
        diffHash: "hash-large",
        kind: "show_file",
        path: "src/large.ts"
      })
    });
  });

  it("splits oversized host messages into receiver-compatible chunk frames", () => {
    const receiver = createDiffSurfaceHostMessageReceiver();
    const smallMessage = {
      diffMode: "unified" as const,
      kind: "set_diff_mode" as const
    };
    const largeMessage = {
      comments: [],
      diffHash: "hash-large",
      kind: "show_file" as const,
      patch: largePatch(),
      path: "src/large.ts"
    };

    expect(
      createDiffSurfaceHostMessageFrames(smallMessage, { chunkId: "small" })
    ).toEqual([smallMessage]);

    const frames = createDiffSurfaceHostMessageFrames(largeMessage, {
      chunkId: "large-message",
      maxFrameDataLength: 64 * 1024
    });

    expect(frames.length).toBeGreaterThan(1);
    expect(frames[0]).toMatchObject({
      id: "large-message",
      index: 0,
      kind: "chunk",
      total: frames.length
    });

    for (const frame of frames.slice(0, -1)) {
      expect(receiver.receive(frame)).toEqual({ kind: "pending" });
    }

    expect(receiver.receive(frames[frames.length - 1])).toEqual({
      kind: "message",
      message: expect.objectContaining({
        diffHash: "hash-large",
        kind: "show_file",
        path: "src/large.ts"
      })
    });
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

function largePatch(): string {
  const lines = [
    "diff --git a/src/large.ts b/src/large.ts",
    "--- a/src/large.ts",
    "+++ b/src/large.ts",
    "@@ -1,1 +1,1 @@"
  ];

  for (let index = 0; index < 90_000; index += 1) {
    lines.push(`+export const value${String(index)} = "${"x".repeat(24)}";`);
  }

  return lines.join("\n");
}
