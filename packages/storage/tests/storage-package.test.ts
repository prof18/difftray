import { describe, expect, it } from "vitest";

import { storageEngineInfo } from "../src/index.js";

describe("@difftray/storage", () => {
  it("declares the SQLite storage engine", () => {
    expect(storageEngineInfo.engine).toBe("sqlite");
  });
});
