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

  it("models omitted unchanged ranges from full file text as expandable context", () => {
    const model = createSurfaceRenderModel({
      diffHash: "hash-context",
      newText: ["one", "two", "new", "four", "five"].join("\n"),
      oldText: ["one", "two", "old", "four", "five"].join("\n"),
      patch: [
        "diff --git a/src/context.ts b/src/context.ts",
        "--- a/src/context.ts",
        "+++ b/src/context.ts",
        "@@ -3 +3 @@",
        "-old",
        "+new"
      ].join("\n"),
      path: "src/context.ts"
    });

    expect(model.kind).toBe("diff");
    if (model.kind !== "diff") {
      return;
    }

    const expanders = model.fileDiff.rows.filter(
      (row) => row.kind === "context_expander"
    );

    expect(expanders).toEqual([
      {
        key: "1:1:2",
        kind: "context_expander",
        lineCount: 2,
        rows: [
          {
            kind: "context",
            newLineNumber: 1,
            oldLineNumber: 1,
            text: "one"
          },
          {
            kind: "context",
            newLineNumber: 2,
            oldLineNumber: 2,
            text: "two"
          }
        ]
      },
      {
        key: "4:4:2",
        kind: "context_expander",
        lineCount: 2,
        rows: [
          {
            kind: "context",
            newLineNumber: 4,
            oldLineNumber: 4,
            text: "four"
          },
          {
            kind: "context",
            newLineNumber: 5,
            oldLineNumber: 5,
            text: "five"
          }
        ]
      }
    ]);
  });

  it("marks word-level changes inside paired modified lines", () => {
    const oldLine = 'expect(getByText("Git changes · 67/300 reviewed")).toBeTruthy();';
    const newLine = 'expect(getByText("Git changes")).toBeTruthy();';
    const model = createSurfaceRenderModel({
      diffHash: "hash-inline-change",
      patch: [
        "diff --git a/src/example.ts b/src/example.ts",
        "--- a/src/example.ts",
        "+++ b/src/example.ts",
        "@@ -55 +55 @@",
        `-${oldLine}`,
        `+${newLine}`
      ].join("\n"),
      path: "src/example.ts"
    });

    expect(model.kind).toBe("diff");
    if (model.kind !== "diff") {
      return;
    }

    const deletion = model.fileDiff.rows.find((row) => row.kind === "deletion");
    const addition = model.fileDiff.rows.find((row) => row.kind === "addition");

    expect(
      deletion?.changedRanges?.map((range) => oldLine.slice(range.start, range.end))
    ).toEqual([" · 67/300 reviewed"]);
    expect(deletion?.inlineChange).toBe(true);
    expect(addition?.inlineChange).toBe(true);
    expect(addition?.changedRanges).toBeUndefined();
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
