import { describe, expect, it } from "vitest";

import {
  createSurfaceRenderModel,
  surfaceCommentAnnotations
} from "./surface-render-model.js";

describe("surface render model", () => {
  it("parses bridge file content with desktop diff metadata", () => {
    const model = createSurfaceRenderModel({
      diffHash: "hash-full",
      newText: "new\n",
      oldText: "old\n",
      patch: [
        "diff --git a/src/example.ts b/src/example.ts",
        "index 1111111..2222222 100644",
        "--- a/src/example.ts",
        "+++ b/src/example.ts",
        "@@ -1 +1 @@",
        "-old",
        "+new"
      ].join("\n"),
      path: "src/example.ts"
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
    expect(model.fileDiff.additionLines.join("")).toBe("new\n");
    expect(model.fileDiff.deletionLines.join("")).toBe("old\n");
  });

  it("infers added and deleted file status from standard git patches", () => {
    const added = createSurfaceRenderModel({
      diffHash: "hash-added",
      newText: "new\n",
      patch: [
        "diff --git a/new.txt b/new.txt",
        "new file mode 100644",
        "--- /dev/null",
        "+++ b/new.txt",
        "@@ -0,0 +1 @@",
        "+new"
      ].join("\n"),
      path: "new.txt"
    });
    const deleted = createSurfaceRenderModel({
      diffHash: "hash-deleted",
      oldText: "old\n",
      patch: [
        "diff --git a/old.txt b/old.txt",
        "deleted file mode 100644",
        "--- a/old.txt",
        "+++ /dev/null",
        "@@ -1 +0,0 @@",
        "-old"
      ].join("\n"),
      path: "old.txt"
    });

    expect(added.kind === "diff" ? added.fileDiff.type : undefined).toBe("new");
    expect(deleted.kind === "diff" ? deleted.fileDiff.type : undefined).toBe("deleted");
  });

  it("maps persisted comments and transient drafts to line annotations", () => {
    expect(
      surfaceCommentAnnotations({
        comments: [
          {
            body: "Comment body",
            createdAt: "2026-01-01T00:00:00.000Z",
            diffHash: "hash-1",
            id: "comment-1",
            lineEnd: 4,
            lineStart: 2,
            path: "src/example.ts",
            side: "additions",
            updatedAt: "2026-01-01T00:00:00.000Z"
          }
        ],
        draft: {
          lineEnd: 9,
          lineStart: 8,
          side: "deletions"
        },
        diffHash: "hash-1",
        path: "src/example.ts"
      })
    ).toEqual([
      {
        lineNumber: 4,
        metadata: {
          comment: expect.objectContaining({ id: "comment-1" }),
          kind: "comment"
        },
        side: "additions"
      },
      {
        lineNumber: 9,
        metadata: {
          draft: {
            body: "",
            diffHash: "hash-1",
            lineEnd: 9,
            lineStart: 8,
            path: "src/example.ts",
            side: "deletions"
          },
          kind: "draft"
        },
        side: "deletions"
      }
    ]);
  });

  it("keeps hostile diff content as renderer line data only", () => {
    const model = createSurfaceRenderModel({
      diffHash: "hash-hostile",
      patch: [
        "diff --git a/evil.ts b/evil.ts",
        "--- a/evil.ts",
        "+++ b/evil.ts",
        "@@ -1 +1,2 @@",
        "-<script>window.__xss = true</script>",
        '+<img src=x onerror="window.__xss = true">',
        "+javascript:alert(1)"
      ].join("\n"),
      path: "evil.ts"
    });

    expect(model.kind).toBe("diff");
    if (model.kind !== "diff") {
      return;
    }

    expect(model.fileDiff.deletionLines.join("")).toContain(
      "<script>window.__xss = true</script>"
    );
    expect(model.fileDiff.additionLines.join("")).toContain(
      '<img src=x onerror="window.__xss = true">'
    );
    expect(model.fileDiff.additionLines.join("")).toContain("javascript:alert(1)");
  });
});
