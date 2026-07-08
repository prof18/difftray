import { describe, expect, it, vi } from "vitest";

import { waitForDiffSurfacePaint } from "./surface-render-signal.js";

describe("diff surface render signal", () => {
  it("waits until after a paint opportunity before resolving", async () => {
    const callbacks: FrameRequestCallback[] = [];
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    let resolved = false;

    const promise = waitForDiffSurfacePaint({ requestAnimationFrame }).then(() => {
      resolved = true;
    });

    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    callbacks.shift()?.(10);
    await Promise.resolve();

    expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
    expect(resolved).toBe(false);

    callbacks.shift()?.(20);
    await promise;

    expect(resolved).toBe(true);
  });
});
