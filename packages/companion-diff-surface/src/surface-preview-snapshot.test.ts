import { describe, expect, it } from "vitest";

import type { DiffSurfaceMessage } from "./surface-bridge.js";
import {
  createSurfacePierreRenderModel,
  type SurfacePierreRenderModel
} from "./surface-pierre-renderer.js";
import {
  createPreviewSnapshot,
  MAX_PREVIEW_BYTES,
  MAX_PREVIEW_LINES
} from "./surface-preview-snapshot.js";
import { withPreview } from "./surface-app.js";

describe("preview snapshots", () => {
  it("uses each side's original filename for syntax highlighting after a rename", () => {
    const renamed = createSurfacePierreRenderModel({
      diffHash: "renamed",
      path: "new.md",
      previousPath: "old.ts",
      status: "renamed",
      patch: "",
      oldText: "const value = 1;\n",
      newText: "# Heading\n"
    });
    expect(
      withPreview(selectedMessage(1, 1, "deletions"), renamed, "new.md")
    ).toMatchObject({
      preview: { path: "old.ts", text: "const value = 1;" }
    });
    expect(
      withPreview(selectedMessage(1, 1, "additions"), renamed, "new.md")
    ).toMatchObject({
      preview: { path: "new.md", text: "# Heading" }
    });
  });

  it("accepts exactly the maximum number of lines and rejects one more", () => {
    const atLimit = Array.from(
      { length: MAX_PREVIEW_LINES },
      (_, index) => `line ${index + 1}`
    );
    const overLimit = [...atLimit, "one too many"];

    expect(createPreviewSnapshot(atLimit, 1, MAX_PREVIEW_LINES)).toBe(atLimit.join("\n"));
    expect(createPreviewSnapshot(overLimit, 1, MAX_PREVIEW_LINES + 1)).toBeUndefined();
  });

  it("accepts exactly the UTF-8 byte limit and rejects a byte over it", () => {
    const atLimit = ["a".repeat(MAX_PREVIEW_BYTES - 2), "b"];
    const overLimit = ["a".repeat(MAX_PREVIEW_BYTES - 2), "bc"];

    expect(createPreviewSnapshot(atLimit, 1, 2)).toBe(atLimit.join("\n"));
    expect(createPreviewSnapshot(overLimit, 1, 2)).toBeUndefined();
  });

  it("counts multibyte UTF-8 text instead of JavaScript code units", () => {
    const atLimit = ["€".repeat(43_690), "a"];
    const overLimit = ["€".repeat(43_690), "ab"];

    expect(createPreviewSnapshot(atLimit, 1, 2)).toBe(atLimit.join("\n"));
    expect(createPreviewSnapshot(overLimit, 1, 2)).toBeUndefined();
  });

  it("omits an over-budget individual line without slicing it", () => {
    expect(
      createPreviewSnapshot(["x".repeat(MAX_PREVIEW_BYTES + 1)], 1, 1)
    ).toBeUndefined();
  });

  it("counts surrogate pairs and preserves source lines while removing terminators", () => {
    expect(createPreviewSnapshot(["😀".repeat(MAX_PREVIEW_BYTES / 4)], 1, 1)).toBe(
      "😀".repeat(MAX_PREVIEW_BYTES / 4)
    );
    expect(
      createPreviewSnapshot(["😀".repeat(MAX_PREVIEW_BYTES / 4) + "x"], 1, 1)
    ).toBeUndefined();
    expect(createPreviewSnapshot(["outside\n", "one\r\n", "\n", "three\n"], 2, 4)).toBe(
      "one\n\nthree"
    );
  });

  it("preserves the line range and snippet when an over-budget preview is omitted", () => {
    const message = selectedMessage(1, MAX_PREVIEW_LINES + 1, "additions");
    const original = structuredClone(message);

    expect(
      withPreview(
        message,
        model({
          additionLines: Array.from({ length: MAX_PREVIEW_LINES + 1 }, () => "line")
        }),
        "new.ts"
      )
    ).toEqual(original);
    expect(message).toEqual(original);
  });

  it("attaches complete normal snapshots for both new and old source", () => {
    const additions = withPreview(
      selectedMessage(2, 3, "additions"),
      model({ additionLines: ["new one", "new two", "new three"] }),
      "new.ts"
    );
    const deletions = withPreview(
      selectedMessage(1, 2, "deletions"),
      model({ deletionLines: ["old one", "old two"] }),
      "old.ts"
    );

    expect(additions).toMatchObject({
      preview: { path: "new.ts", text: "new two\nnew three" }
    });
    expect(deletions).toMatchObject({
      preview: { path: "old.ts", text: "old one\nold two" }
    });
  });
});

function selectedMessage(
  lineStart: number,
  lineEnd: number,
  side: "additions" | "deletions"
): Extract<DiffSurfaceMessage, { readonly kind: "line_selected" }> {
  return {
    kind: "line_selected",
    lineEnd,
    lineStart,
    side,
    snippet: [
      { lineNumber: lineStart, text: "first" },
      { lineNumber: lineEnd, text: "last" }
    ]
  };
}

function model({
  additionLines = [],
  deletionLines = []
}: {
  readonly additionLines?: readonly string[];
  readonly deletionLines?: readonly string[];
}): SurfacePierreRenderModel {
  return {
    kind: "diff",
    fileDiff: {
      additionLines,
      deletionLines,
      isPartial: false
    }
  } as SurfacePierreRenderModel;
}
