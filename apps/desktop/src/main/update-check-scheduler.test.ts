import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DAILY_UPDATE_CHECK_INTERVAL_MS,
  UpdateCheckScheduler
} from "./update-check-scheduler.js";

describe("UpdateCheckScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("checks immediately when started and then once per day", async () => {
    const checkForUpdates = vi.fn().mockResolvedValue(undefined);
    const scheduler = new UpdateCheckScheduler({ checkForUpdates });

    scheduler.start();
    expect(checkForUpdates).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(DAILY_UPDATE_CHECK_INTERVAL_MS - 1);
    expect(checkForUpdates).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(1);
    expect(checkForUpdates).toHaveBeenCalledTimes(2);

    scheduler.stop();
  });

  it("does not overlap manual and scheduled checks", async () => {
    let resolveCheck: (() => void) | undefined;
    const checkForUpdates = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveCheck = resolve;
        })
    );
    const scheduler = new UpdateCheckScheduler({ checkForUpdates });

    const manualCheck = scheduler.checkNow();
    scheduler.start();
    await vi.advanceTimersByTimeAsync(DAILY_UPDATE_CHECK_INTERVAL_MS);

    expect(checkForUpdates).toHaveBeenCalledOnce();

    resolveCheck?.();
    await manualCheck;

    scheduler.stop();
  });

  it("does not duplicate an earlier manual check when started later", async () => {
    const checkForUpdates = vi.fn().mockResolvedValue(undefined);
    const scheduler = new UpdateCheckScheduler({ checkForUpdates });

    await scheduler.checkNow();
    scheduler.start();

    expect(checkForUpdates).toHaveBeenCalledOnce();

    scheduler.stop();
  });

  it("stops the daily timer", async () => {
    const checkForUpdates = vi.fn().mockResolvedValue(undefined);
    const scheduler = new UpdateCheckScheduler({ checkForUpdates });

    scheduler.start();
    scheduler.stop();
    await vi.advanceTimersByTimeAsync(DAILY_UPDATE_CHECK_INTERVAL_MS);

    expect(checkForUpdates).toHaveBeenCalledOnce();
  });

  it("does not reschedule after stopping during a scheduled check", async () => {
    let resolveCheck: (() => void) | undefined;
    const checkForUpdates = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveCheck = resolve;
        })
    );
    const scheduler = new UpdateCheckScheduler({ checkForUpdates });

    const firstCheck = scheduler.checkNow();
    resolveCheck?.();
    await firstCheck;
    scheduler.start();

    await vi.advanceTimersByTimeAsync(DAILY_UPDATE_CHECK_INTERVAL_MS);
    expect(checkForUpdates).toHaveBeenCalledTimes(2);

    scheduler.stop();
    resolveCheck?.();
    await vi.advanceTimersByTimeAsync(DAILY_UPDATE_CHECK_INTERVAL_MS);

    expect(checkForUpdates).toHaveBeenCalledTimes(2);
  });
});
