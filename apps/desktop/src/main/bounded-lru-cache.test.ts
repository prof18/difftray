import { describe, expect, it } from "vitest";

import { BoundedLruCache } from "./bounded-lru-cache.js";

describe("BoundedLruCache", () => {
  it("evicts the least recently used entry and honors invalidation", () => {
    const cache = new BoundedLruCache<string, number>(2);
    cache.set("one", 1);
    cache.set("two", 2);
    expect(cache.get("one")).toBe(1);
    cache.set("three", 3);
    expect(cache.get("two")).toBeUndefined();
    expect(cache.size).toBe(2);
    cache.delete("one");
    expect(cache.get("one")).toBeUndefined();
  });
});
