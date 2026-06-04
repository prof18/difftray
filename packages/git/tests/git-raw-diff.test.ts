import { describe, expect, it } from "vitest";

import {
  normalizeNumstatPath,
  parseDiffStats,
  parseRawDiffs
} from "../src/git-raw-diff.js";

describe("parseRawDiffs", () => {
  it("parses added, deleted, and modified raw diff records", () => {
    expect(
      parseRawDiffs(
        [
          ":000000 100644 000000 aaa A",
          "src/added.ts",
          ":100644 000000 aaa 000000 D",
          "src/deleted.ts",
          ":100644 100644 aaa bbb M",
          "src/changed.ts",
          ""
        ].join("\0")
      )
    ).toEqual([
      {
        newMode: "100644",
        newObjectId: "aaa",
        newPath: "src/added.ts",
        oldMode: "000000",
        oldObjectId: "000000",
        status: "added"
      },
      {
        newMode: "000000",
        newObjectId: "000000",
        newPath: "src/deleted.ts",
        oldMode: "100644",
        oldObjectId: "aaa",
        status: "deleted"
      },
      {
        newMode: "100644",
        newObjectId: "bbb",
        newPath: "src/changed.ts",
        oldMode: "100644",
        oldObjectId: "aaa",
        status: "modified"
      }
    ]);
  });

  it("parses rename records with old and new paths", () => {
    expect(
      parseRawDiffs(
        [":100644 100644 aaa bbb R100", "src/old-name.ts", "src/new-name.ts"].join("\0")
      )
    ).toEqual([
      {
        newMode: "100644",
        newObjectId: "bbb",
        newPath: "src/new-name.ts",
        oldMode: "100644",
        oldObjectId: "aaa",
        oldPath: "src/old-name.ts",
        status: "renamed"
      }
    ]);
  });

  it("throws on malformed headers and rename records missing paths", () => {
    expect(() => parseRawDiffs("src/changed.ts")).toThrow(
      "Malformed Git raw diff record"
    );
    expect(() => parseRawDiffs(":100644 100644 aaa bbb R100\0src/old-name.ts")).toThrow(
      "Git rename diff is missing a path."
    );
  });
});

describe("parseDiffStats", () => {
  it("parses numstat lines and normalizes renamed paths", () => {
    expect([
      ...parseDiffStats("3\t2\tsrc/{old => new}.ts\n-\t-\tassets/logo.png\n")
    ]).toEqual([
      ["src/new.ts", { additions: 3, deletions: 2 }],
      ["assets/logo.png", { additions: 0, deletions: 0 }]
    ]);
  });
});

describe("normalizeNumstatPath", () => {
  it("normalizes brace and plain rename forms", () => {
    expect(normalizeNumstatPath("src/{old => new}.ts")).toBe("src/new.ts");
    expect(normalizeNumstatPath("src/old.ts => src/new.ts")).toBe("src/new.ts");
    expect(normalizeNumstatPath("src/stable.ts")).toBe("src/stable.ts");
  });
});
