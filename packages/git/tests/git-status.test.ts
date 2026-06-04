import { describe, expect, it } from "vitest";

import { parseStatusPorcelainV2, shortBranchRefFromFullRef } from "../src/git-status.js";

describe("parseStatusPorcelainV2", () => {
  it("parses ordinary, rename, and untracked records", () => {
    expect(
      parseStatusPorcelainV2(
        [
          "1 .M N... 100644 100644 100644 aaa bbb src/changed.ts",
          "2 R. N... 100644 100644 100644 aaa bbb R100 src/new-name.ts",
          "src/old-name.ts",
          "? src/untracked.ts",
          ""
        ].join("\0")
      )
    ).toEqual([
      {
        path: "src/changed.ts",
        status: "modified",
        workingTreeStatus: "modified"
      },
      {
        indexStatus: "renamed",
        path: "src/new-name.ts",
        previousPath: "src/old-name.ts",
        status: "renamed"
      },
      {
        path: "src/untracked.ts",
        status: "untracked"
      }
    ]);
  });

  it("reports added and deleted index status from ordinary records", () => {
    expect(
      parseStatusPorcelainV2(
        [
          "1 A. N... 000000 100644 100644 000000 aaa src/added.ts",
          "1 D. N... 100644 000000 000000 aaa 000000 src/deleted.ts"
        ].join("\0")
      )
    ).toEqual([
      {
        indexStatus: "added",
        path: "src/added.ts",
        status: "added"
      },
      {
        indexStatus: "deleted",
        path: "src/deleted.ts",
        status: "deleted"
      }
    ]);
  });

  it("throws on malformed ordinary and rename records", () => {
    expect(() => parseStatusPorcelainV2("1 .M malformed")).toThrow(
      "Malformed Git porcelain-v2 status record"
    );
    expect(() =>
      parseStatusPorcelainV2(
        "2 R. N... 100644 100644 100644 aaa bbb R100 src/new-name.ts"
      )
    ).toThrow("Git rename status record is missing previous path");
  });
});

describe("shortBranchRefFromFullRef", () => {
  it("normalizes local and remote refs while ignoring remote HEAD pointers", () => {
    expect(shortBranchRefFromFullRef("refs/heads/main")).toBe("main");
    expect(shortBranchRefFromFullRef("refs/remotes/origin/main")).toBe("origin/main");
    expect(shortBranchRefFromFullRef("refs/remotes/origin/HEAD")).toBeUndefined();
    expect(shortBranchRefFromFullRef("refs/tags/v1")).toBeUndefined();
  });
});
