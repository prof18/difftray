import { describe, expect, it } from "vitest";

import { mapWithConcurrency } from "../src/concurrency.js";

describe("mapWithConcurrency", () => {
  it("keeps async work under the requested concurrency limit", async () => {
    let active = 0;
    let maxActive = 0;
    const values = Array.from({ length: 12 }, (_, index) => index);

    const result = await mapWithConcurrency(values, 3, async (value) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;

      return value * 2;
    });

    expect(result).toEqual(values.map((value) => value * 2));
    expect(maxActive).toBeLessThanOrEqual(3);
  });
});
