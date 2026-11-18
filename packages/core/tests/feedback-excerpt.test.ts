import { describe, expect, it } from "vitest";

import {
  EXCERPT_MAX_LINE_CHARS,
  EXCERPT_MAX_LINES,
  NOTE_EXCERPT_MAX_PATHS,
  buildFilesExcerpt,
  buildLineExcerpt,
  buildPatchExcerpt,
  learnExcerptSources,
  learnStatuses,
  parseFeedbackExcerpt
} from "../src/index.js";

function numberedText(count: number): string {
  return Array.from({ length: count }, (_, index) => `line ${String(index + 1)}`)
    .join("\n")
    .concat("\n");
}

describe("buildLineExcerpt", () => {
  it("gives a one-line comment on line 1 lines 1 to 4", () => {
    const excerpt = buildLineExcerpt({
      side: "additions",
      lineStart: 1,
      lineEnd: 1,
      text: numberedText(10),
      maxLines: EXCERPT_MAX_LINES
    });

    expect(excerpt).toEqual({
      version: 1,
      kind: "lines",
      side: "additions",
      lines: [
        { kind: "commented", lineNumber: 1, text: "line 1" },
        { kind: "context", lineNumber: 2, text: "line 2" },
        { kind: "context", lineNumber: 3, text: "line 3" },
        { kind: "context", lineNumber: 4, text: "line 4" }
      ],
      truncated: false
    });
  });

  it("adds three context lines on both sides and clamps to the end of the file", () => {
    const excerpt = buildLineExcerpt({
      side: "deletions",
      lineStart: 8,
      lineEnd: 9,
      text: numberedText(10),
      maxLines: EXCERPT_MAX_LINES
    });

    expect(excerpt?.kind).toBe("lines");
    if (excerpt?.kind !== "lines") throw new Error("Expected a line excerpt");
    expect(excerpt.side).toBe("deletions");
    expect(excerpt.lines.map((line) => line.lineNumber)).toEqual([5, 6, 7, 8, 9, 10]);
    expect(
      excerpt.lines.filter((line) => line.kind === "commented").map((l) => l.lineNumber)
    ).toEqual([8, 9]);
    expect(excerpt.truncated).toBe(false);
  });

  it("cuts a 60-line range to EXCERPT_MAX_LINES lines", () => {
    const excerpt = buildLineExcerpt({
      side: "additions",
      lineStart: 1,
      lineEnd: 60,
      text: numberedText(80),
      maxLines: EXCERPT_MAX_LINES
    });

    if (excerpt?.kind !== "lines") throw new Error("Expected a line excerpt");
    expect(excerpt.lines).toHaveLength(EXCERPT_MAX_LINES);
    expect(excerpt.lines[0]?.lineNumber).toBe(1);
    expect(excerpt.truncated).toBe(true);
  });

  it("cuts a 10 000-character line to EXCERPT_MAX_LINE_CHARS", () => {
    const excerpt = buildLineExcerpt({
      side: "additions",
      lineStart: 1,
      lineEnd: 1,
      text: `${"x".repeat(10_000)}\nshort\n`,
      maxLines: EXCERPT_MAX_LINES
    });

    if (excerpt?.kind !== "lines") throw new Error("Expected a line excerpt");
    expect(excerpt.lines[0]?.text).toHaveLength(EXCERPT_MAX_LINE_CHARS);
    expect(excerpt.lines[1]?.text).toBe("short");
    expect(excerpt.truncated).toBe(true);
  });

  it("keeps long lines and spans with infinite limits", () => {
    const excerpt = buildLineExcerpt({
      side: "additions",
      lineStart: 1,
      lineEnd: 60,
      text: `${"x".repeat(10_000)}\n${numberedText(70)}`,
      maxLines: Number.POSITIVE_INFINITY,
      maxLineChars: Number.POSITIVE_INFINITY
    });

    if (excerpt?.kind !== "lines") throw new Error("Expected a line excerpt");
    expect(excerpt.lines).toHaveLength(63);
    expect(excerpt.lines[0]?.text).toHaveLength(10_000);
    expect(excerpt.truncated).toBe(false);
  });

  it("does not split a surrogate pair when cutting a line", () => {
    const excerpt = buildLineExcerpt({
      side: "additions",
      lineStart: 1,
      lineEnd: 1,
      text: `${"a".repeat(EXCERPT_MAX_LINE_CHARS - 1)}😀tail\n`,
      maxLines: EXCERPT_MAX_LINES
    });

    if (excerpt?.kind !== "lines") throw new Error("Expected a line excerpt");
    expect(excerpt.lines[0]?.text).toBe("a".repeat(EXCERPT_MAX_LINE_CHARS - 1));
    expect(excerpt.truncated).toBe(true);
  });

  it("returns null when lineStart is past the end of the text", () => {
    expect(
      buildLineExcerpt({
        side: "additions",
        lineStart: 11,
        lineEnd: 11,
        text: numberedText(10),
        maxLines: EXCERPT_MAX_LINES
      })
    ).toBeNull();
  });
});

describe("buildPatchExcerpt", () => {
  it("starts a patch with a diff --git header at its first @@ line", () => {
    const patch = [
      "diff --git a/file.txt b/file.txt",
      "index 1111111..2222222 100644",
      "--- a/file.txt",
      "+++ b/file.txt",
      "@@ -1,2 +1,2 @@",
      "-old",
      "+new",
      " same",
      ""
    ].join("\n");

    expect(buildPatchExcerpt(patch)).toEqual({
      version: 1,
      kind: "patch",
      lines: ["@@ -1,2 +1,2 @@", "-old", "+new", " same"],
      truncated: false
    });
  });

  it("keeps EXCERPT_MAX_LINES lines and marks the rest as truncated", () => {
    const patch = [
      "@@ -1,60 +1,60 @@",
      ...Array.from({ length: 60 }, (_, index) => `+added ${String(index)}`)
    ].join("\n");
    const excerpt = buildPatchExcerpt(patch);

    if (excerpt?.kind !== "patch") throw new Error("Expected a patch excerpt");
    expect(excerpt.lines).toHaveLength(EXCERPT_MAX_LINES);
    expect(excerpt.lines[0]).toBe("@@ -1,60 +1,60 @@");
    expect(excerpt.truncated).toBe(true);
  });

  it("cuts long patch lines", () => {
    const excerpt = buildPatchExcerpt(`@@ -0,0 +1 @@\n+${"y".repeat(10_000)}\n`);

    if (excerpt?.kind !== "patch") throw new Error("Expected a patch excerpt");
    expect(excerpt.lines[1]).toHaveLength(EXCERPT_MAX_LINE_CHARS);
    expect(excerpt.truncated).toBe(true);
  });

  it("returns null for an empty patch or a patch without hunks", () => {
    expect(buildPatchExcerpt("")).toBeNull();
    expect(buildPatchExcerpt("diff --git a/x b/x\nsimilarity index 100%\n")).toBeNull();
  });
});

describe("buildFilesExcerpt", () => {
  it("sorts by path, keeps 100 of 150 files and reports 50 omitted", () => {
    const files = Array.from({ length: 150 }, (_, index) => ({
      path: `file-${String(149 - index).padStart(3, "0")}.ts`,
      additions: index,
      deletions: 1
    }));
    const excerpt = buildFilesExcerpt(files);

    if (excerpt.kind !== "files") throw new Error("Expected a files excerpt");
    expect(excerpt.files).toHaveLength(NOTE_EXCERPT_MAX_PATHS);
    expect(excerpt.omittedFiles).toBe(50);
    expect(excerpt.files[0]).toEqual({
      path: "file-000.ts",
      additions: 149,
      deletions: 1
    });
    expect(excerpt.files[99]?.path).toBe("file-099.ts");
  });

  it("keeps only path and counts", () => {
    expect(
      buildFilesExcerpt([
        { path: "b", additions: 1, deletions: 2 },
        { path: "a", additions: 0, deletions: 0 }
      ])
    ).toEqual({
      version: 1,
      kind: "files",
      files: [
        { path: "a", additions: 0, deletions: 0 },
        { path: "b", additions: 1, deletions: 2 }
      ],
      omittedFiles: 0
    });
  });
});

describe("parseFeedbackExcerpt", () => {
  it("round-trips every builder output", () => {
    const excerpts = [
      buildLineExcerpt({
        side: "additions",
        lineStart: 2,
        lineEnd: 3,
        text: numberedText(5),
        maxLines: EXCERPT_MAX_LINES
      }),
      buildPatchExcerpt("@@ -1 +1 @@\n-a\n+b\n"),
      buildFilesExcerpt([{ path: "a", additions: 1, deletions: 0 }])
    ];

    for (const excerpt of excerpts) {
      expect(parseFeedbackExcerpt(JSON.stringify(excerpt))).toEqual(excerpt);
    }
  });

  it("rejects null, malformed JSON, version 2 and wrong shapes", () => {
    const valid = buildPatchExcerpt("@@ -1 +1 @@\n-a\n+b\n");

    expect(parseFeedbackExcerpt(null)).toBeNull();
    expect(parseFeedbackExcerpt("{not json")).toBeNull();
    expect(parseFeedbackExcerpt(JSON.stringify({ ...valid, version: 2 }))).toBeNull();
    expect(parseFeedbackExcerpt("null")).toBeNull();
    expect(parseFeedbackExcerpt("[]")).toBeNull();
    expect(
      parseFeedbackExcerpt(JSON.stringify({ version: 1, kind: "unknown" }))
    ).toBeNull();
    expect(
      parseFeedbackExcerpt(
        JSON.stringify({ version: 1, kind: "patch", lines: [1], truncated: false })
      )
    ).toBeNull();
    expect(
      parseFeedbackExcerpt(
        JSON.stringify({
          version: 1,
          kind: "lines",
          side: "both",
          lines: [],
          truncated: false
        })
      )
    ).toBeNull();
    expect(
      parseFeedbackExcerpt(
        JSON.stringify({
          version: 1,
          kind: "lines",
          side: "additions",
          lines: [{ kind: "commented", lineNumber: 0, text: "x" }],
          truncated: false
        })
      )
    ).toBeNull();
    expect(
      parseFeedbackExcerpt(
        JSON.stringify({
          version: 1,
          kind: "files",
          files: [{ path: "a", additions: -1, deletions: 0 }],
          omittedFiles: 0
        })
      )
    ).toBeNull();
    expect(
      parseFeedbackExcerpt(
        JSON.stringify({ version: 1, kind: "files", files: [], omittedFiles: 1.5 })
      )
    ).toBeNull();
  });
});

describe("learn unions", () => {
  it("lists every status and excerpt source", () => {
    expect(learnStatuses).toEqual([
      "active",
      "target_changed",
      "diff_changed",
      "dismissed"
    ]);
    expect(learnExcerptSources).toEqual([
      "saved",
      "recovered",
      "approximate",
      "unavailable",
      "not_looked_up"
    ]);
  });
});
