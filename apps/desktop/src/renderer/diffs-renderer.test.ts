import { describe, expect, it } from "vitest";

import { createDiffsRenderModel } from "./diffs-renderer.js";

describe("createDiffsRenderModel", () => {
  it("uses full file snapshots when both sides are available", () => {
    const model = createDiffsRenderModel({
      diffHash: "hash-full",
      filePath: "src/example.ts",
      newText: ["const value = 1;", "console.log(value);", ""].join("\n"),
      oldText: ["const value = 0;", "console.log(value);", ""].join("\n"),
      patch: [
        "diff --git a/src/example.ts b/src/example.ts",
        "index 1111111..2222222 100644",
        "--- a/src/example.ts",
        "+++ b/src/example.ts",
        "@@ -1,2 +1,2 @@",
        "-const value = 0;",
        "+const value = 1;",
        " console.log(value);"
      ].join("\n"),
      status: "modified"
    });

    expect(model.kind).toBe("diff");
    if (model.kind !== "diff") {
      return;
    }

    expect(model.fileDiff).toMatchObject({
      cacheKey: "hash-full",
      isPartial: false,
      name: "src/example.ts",
      type: "change"
    });
    expect(model.fileDiff.additionLines.join("")).toBe(
      ["const value = 1;", "console.log(value);", ""].join("\n")
    );
    expect(model.fileDiff.deletionLines.join("")).toBe(
      ["const value = 0;", "console.log(value);", ""].join("\n")
    );
  });

  it("uses partial patch metadata when file snapshots are unavailable", () => {
    const model = createDiffsRenderModel({
      diffHash: "hash-partial",
      filePath: "src/example.ts",
      patch: [
        "diff --git a/src/example.ts b/src/example.ts",
        "index 1111111..2222222 100644",
        "--- a/src/example.ts",
        "+++ b/src/example.ts",
        "@@ -1 +1 @@",
        "-old",
        "+new"
      ].join("\n"),
      status: "modified"
    });

    expect(model.kind).toBe("diff");
    if (model.kind !== "diff") {
      return;
    }

    expect(model.fileDiff).toMatchObject({
      cacheKey: "hash-partial",
      isPartial: true,
      name: "src/example.ts",
      type: "change"
    });
    expect(model.fileDiff.additionLines.join("")).toBe("new");
    expect(model.fileDiff.deletionLines.join("")).toBe("old\n");
  });

  it("returns a fallback model for non-text summaries", () => {
    expect(
      createDiffsRenderModel({
        diffHash: "hash-binary",
        filePath: "assets/icon.png",
        patch: [
          "diff --git a/assets/icon.png b/assets/icon.png",
          "Binary file changed (1024 bytes)",
          "sha256 abc123"
        ].join("\n"),
        status: "modified"
      })
    ).toEqual({
      detail: [
        "diff --git a/assets/icon.png b/assets/icon.png",
        "Binary file changed (1024 bytes)",
        "sha256 abc123"
      ].join("\n"),
      kind: "fallback",
      title: "No textual diff"
    });
  });
});
