import { describe, expect, it } from "vitest";

import { corePackage } from "../src/index.js";

describe("@difftray/core", () => {
  it("exports the core package identity", () => {
    expect(corePackage.name).toBe("@difftray/core");
  });
});
