import { describe, expect, it, vi } from "vitest";

import {
  elapsedSince,
  logMainPerformance,
  mainPerformanceLoggingEnabled
} from "./main-performance.js";

describe("main performance logging", () => {
  it("enables logging only when the environment flag is set", () => {
    expect(mainPerformanceLoggingEnabled({ DIFFTRAY_PERF_LOG: "1" })).toBe(true);
    expect(mainPerformanceLoggingEnabled({ DIFFTRAY_PERF_LOG: "0" })).toBe(false);
    expect(mainPerformanceLoggingEnabled({})).toBe(false);
  });

  it("logs structured performance payloads when enabled", () => {
    const logger = {
      info: vi.fn()
    };

    logMainPerformance(
      "reviews.markFileReviewed",
      {
        elapsedMs: 123,
        status: "marked"
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
      event: "reviews.markFileReviewed",
      status: "marked"
    });
  });

  it("skips logging when disabled", () => {
    const logger = {
      info: vi.fn()
    };

    logMainPerformance("event", {}, { enabled: false, logger });

    expect(logger.info).not.toHaveBeenCalled();
  });

  it("rounds elapsed time from the supplied timestamp", () => {
    expect(elapsedSince(100.4, 150.9)).toBe(51);
  });
});
