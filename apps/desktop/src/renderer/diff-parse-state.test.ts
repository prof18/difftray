import { describe, expect, it } from "vitest";

import { createReadyDiffParseState } from "./diff-parse-state.js";

describe("createReadyDiffParseState", () => {
  it("creates a ready parse state for textual diffs", () => {
    const state = createReadyDiffParseState({
      diffHash: "hash-a",
      filePath: "src/example.ts",
      ignoreWhitespace: false,
      newText: "new\n",
      oldText: "old\n",
      parseKey: "src/example.ts:hash-a",
      patch: [
        "diff --git a/src/example.ts b/src/example.ts",
        "index 1111111..2222222 100644",
        "--- a/src/example.ts",
        "+++ b/src/example.ts",
        "@@ -1 +1 @@",
        "-old",
        "+new"
      ].join("\n"),
      previousPath: undefined,
      status: "modified"
    });

    expect(state).toMatchObject({
      key: "src/example.ts:hash-a",
      status: "ready"
    });
    expect(state.parseMs).toEqual(expect.any(Number));
    expect(state.model.kind).toBe("diff");
    if (state.model.kind !== "diff") {
      return;
    }
    expect(state.model.fileDiff).toMatchObject({
      cacheKey: "hash-a",
      name: "src/example.ts",
      type: "change"
    });
  });

  it("creates a fallback parse state for non-text diffs", () => {
    const patch = [
      "diff --git a/assets/icon.png b/assets/icon.png",
      "Binary file changed (1024 bytes)",
      "sha256 abc123"
    ].join("\n");

    expect(
      createReadyDiffParseState({
        diffHash: "hash-binary",
        filePath: "assets/icon.png",
        ignoreWhitespace: false,
        newText: undefined,
        oldText: undefined,
        parseKey: "assets/icon.png:hash-binary",
        patch,
        previousPath: undefined,
        status: "modified"
      })
    ).toMatchObject({
      key: "assets/icon.png:hash-binary",
      model: {
        detail: patch,
        kind: "fallback",
        title: "No textual diff"
      },
      status: "ready"
    });
  });

  it("passes ignoreWhitespace to the render model", () => {
    const state = createReadyDiffParseState({
      diffHash: "hash-a",
      filePath: "src/example.ts",
      ignoreWhitespace: true,
      newText: "  a\n",
      oldText: "a\n",
      parseKey: "src/example.ts:hash-a:ws-ignored",
      patch: [
        "diff --git a/src/example.ts b/src/example.ts",
        "index 1111111..2222222 100644",
        "--- a/src/example.ts",
        "+++ b/src/example.ts",
        "@@ -1 +1 @@",
        "-a",
        "+  a"
      ].join("\n"),
      previousPath: undefined,
      status: "modified"
    });

    expect(state.key).toBe("src/example.ts:hash-a:ws-ignored");
    expect(state.model).toMatchObject({ kind: "fallback", whitespaceOnly: true });
  });
});
