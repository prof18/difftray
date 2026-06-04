import { describe, expect, it, vi } from "vitest";

import {
  elapsedSince,
  logRendererPerformance,
  rendererPerformanceLoggingEnabled
} from "./renderer-performance.js";

describe("renderer performance logging", () => {
  it("enables logging only when the local flag is set", () => {
    expect(rendererPerformanceLoggingEnabled(storageWithValue("1"))).toBe(true);
    expect(rendererPerformanceLoggingEnabled(storageWithValue("0"))).toBe(false);
    expect(rendererPerformanceLoggingEnabled(storageWithValue(null))).toBe(false);
  });

  it("treats storage errors as disabled logging", () => {
    expect(
      rendererPerformanceLoggingEnabled({
        getItem: () => {
          throw new Error("storage unavailable");
        }
      })
    ).toBe(false);
  });

  it("logs structured performance payloads when enabled", () => {
    const logger = {
      info: vi.fn()
    };

    logRendererPerformance(
      "review.mark.next_diff_loaded",
      {
        elapsedMs: 123,
        toPath: "src/App.tsx"
      },
      {
        enabled: true,
        logger
      }
    );

    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info.mock.calls[0]?.[0]).toBe("[difftray:perf]");
    expect(JSON.parse(String(logger.info.mock.calls[0]?.[1]))).toEqual({
      elapsedMs: 123,
      event: "review.mark.next_diff_loaded",
      toPath: "src/App.tsx"
    });
  });

  it("skips logging when disabled", () => {
    const logger = {
      info: vi.fn()
    };

    logRendererPerformance("event", {}, { enabled: false, logger });

    expect(logger.info).not.toHaveBeenCalled();
  });

  it("rounds elapsed time from the supplied timestamp", () => {
    expect(elapsedSince(100.4, 150.9)).toBe(51);
  });
});

function storageWithValue(value: string | null): Pick<Storage, "getItem"> {
  return {
    getItem: () => value
  };
}
