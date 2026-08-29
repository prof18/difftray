import { describe, expect, it } from "vitest";

import {
  isPathInsideApprovedRoot,
  shouldTraverseRepositoryDirectory
} from "../src/index.js";

describe("repository discovery policy", () => {
  it("prunes generated folders but deliberately keeps vendor", () => {
    expect(shouldTraverseRepositoryDirectory("node_modules")).toBe(false);
    expect(shouldTraverseRepositoryDirectory("DerivedData")).toBe(false);
    expect(shouldTraverseRepositoryDirectory("vendor")).toBe(true);
    expect(shouldTraverseRepositoryDirectory("src")).toBe(true);
  });

  it("accepts only lexical descendants of an approved root", () => {
    expect(isPathInsideApprovedRoot("/workspace", "/workspace/repo")).toBe(true);
    expect(isPathInsideApprovedRoot("/workspace", "/workspace-other/repo")).toBe(false);
    expect(isPathInsideApprovedRoot("/workspace", "/outside")).toBe(false);
  });
});
