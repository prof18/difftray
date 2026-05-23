import { describe, expect, it } from "vitest";

import { gitAdapterInfo } from "../src/index.js";

describe("@difftray/git", () => {
  it("declares the Git CLI adapter strategy", () => {
    expect(gitAdapterInfo.strategy).toBe("git-cli");
  });
});
