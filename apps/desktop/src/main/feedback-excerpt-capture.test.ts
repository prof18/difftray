import { describe, expect, it, vi } from "vitest";
import { parseFeedbackExcerpt } from "@difftray/core";
import {
  captureCommentExcerpt,
  captureFileCommentExcerpt,
  captureNoteExcerpt
} from "./feedback-excerpt-capture.js";

const textDiff = {
  content: {
    kind: "text" as const,
    newText: "new 1\nnew 2\nnew 3\n",
    oldText: "old 1\nold 2\n",
    patch: "diff --git a/f b/f\n@@ -1,2 +1,3 @@\n-old 1\n-old 2\n+new 1\n+new 2\n+new 3\n"
  }
};
const binaryDiff = {
  content: { kind: "binary" as const, byteSize: 4, digest: "digest" }
};
const recheck = (hash: string) => vi.fn(() => Promise.resolve(hash));

describe("captureCommentExcerpt", () => {
  it("captures additions from newText and deletions from oldText", async () => {
    const additions = await captureCommentExcerpt(
      () => Promise.resolve(textDiff),
      { side: "additions", lineStart: 2, lineEnd: 2, diffHash: "hash" },
      recheck("hash")
    );
    const deletions = await captureCommentExcerpt(
      () => Promise.resolve(textDiff),
      { side: "deletions", lineStart: 1, lineEnd: 2, diffHash: "hash" },
      recheck("hash")
    );

    expect(parseFeedbackExcerpt(additions)).toEqual({
      version: 1,
      kind: "lines",
      side: "additions",
      lines: [
        { kind: "context", lineNumber: 1, text: "new 1" },
        { kind: "commented", lineNumber: 2, text: "new 2" },
        { kind: "context", lineNumber: 3, text: "new 3" }
      ],
      truncated: false
    });
    expect(parseFeedbackExcerpt(deletions)).toMatchObject({
      side: "deletions",
      lines: [
        { kind: "commented", lineNumber: 1, text: "old 1" },
        { kind: "commented", lineNumber: 2, text: "old 2" }
      ]
    });
  });

  it("returns null when the load throws, returns non-text content or nothing", async () => {
    const comment = {
      side: "additions" as const,
      lineStart: 1,
      lineEnd: 1,
      diffHash: "hash"
    };

    expect(
      await captureCommentExcerpt(
        () => Promise.reject(new Error("git failed")),
        comment,
        recheck("hash")
      )
    ).toBeNull();
    expect(
      await captureCommentExcerpt(
        () => Promise.resolve(binaryDiff),
        comment,
        recheck("hash")
      )
    ).toBeNull();
    expect(
      await captureCommentExcerpt(() => Promise.resolve(null), comment, recheck("hash"))
    ).toBeNull();
    expect(
      await captureCommentExcerpt(
        () => Promise.resolve({ ...textDiff, oversized: true as const }),
        comment,
        recheck("hash")
      )
    ).toBeNull();
  });

  it("returns null when the file changed between the check and the read", async () => {
    const check = recheck("other");

    expect(
      await captureCommentExcerpt(
        () => Promise.resolve(textDiff),
        { side: "additions", lineStart: 1, lineEnd: 1, diffHash: "hash" },
        check
      )
    ).toBeNull();
    expect(check).toHaveBeenCalledOnce();
    expect(
      await captureCommentExcerpt(
        () => Promise.resolve(textDiff),
        { side: "additions", lineStart: 1, lineEnd: 1, diffHash: "hash" },
        () => Promise.reject(new Error("summary failed"))
      )
    ).toBeNull();
  });
});

describe("captureFileCommentExcerpt", () => {
  it("captures the patch excerpt", async () => {
    const json = await captureFileCommentExcerpt(
      () => Promise.resolve(textDiff),
      "hash",
      recheck("hash")
    );

    expect(parseFeedbackExcerpt(json)).toEqual({
      version: 1,
      kind: "patch",
      lines: ["@@ -1,2 +1,3 @@", "-old 1", "-old 2", "+new 1", "+new 2", "+new 3"],
      truncated: false
    });
  });

  it("returns null on a failed load, non-text content or a changed hash", async () => {
    expect(
      await captureFileCommentExcerpt(
        () => Promise.reject(new Error("git failed")),
        "hash",
        recheck("hash")
      )
    ).toBeNull();
    expect(
      await captureFileCommentExcerpt(
        () => Promise.resolve(binaryDiff),
        "hash",
        recheck("hash")
      )
    ).toBeNull();
    expect(
      await captureFileCommentExcerpt(
        () => Promise.resolve(textDiff),
        "hash",
        recheck("other")
      )
    ).toBeNull();
  });
});

describe("captureNoteExcerpt", () => {
  const files = [
    { path: "b.ts", additions: 2, deletions: 1 },
    { path: "a.ts", additions: 0, deletions: 3 }
  ];

  it("captures the files excerpt from the loaded file list", async () => {
    const json = await captureNoteExcerpt(
      () => Promise.resolve(files),
      "scope",
      () => Promise.resolve("scope")
    );

    expect(parseFeedbackExcerpt(json)).toEqual({
      version: 1,
      kind: "files",
      files: [
        { path: "a.ts", additions: 0, deletions: 3 },
        { path: "b.ts", additions: 2, deletions: 1 }
      ],
      omittedFiles: 0
    });
  });

  it("returns null when loading files throws or the note scope changed", async () => {
    expect(
      await captureNoteExcerpt(
        () => Promise.reject(new Error("git failed")),
        "scope",
        () => Promise.resolve("scope")
      )
    ).toBeNull();
    expect(
      await captureNoteExcerpt(
        () => Promise.resolve(files),
        "scope",
        () => Promise.resolve("other")
      )
    ).toBeNull();
    expect(
      await captureNoteExcerpt(
        () => Promise.resolve(files),
        "scope",
        () => Promise.resolve(null)
      )
    ).toBeNull();
  });
});
