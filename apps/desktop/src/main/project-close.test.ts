import { describe, expect, it, vi } from "vitest";

import { closeProjectIfOpen } from "./project-close.js";

describe("closeProjectIfOpen", () => {
  it("closes an open project and publishes the completed close", async () => {
    let open = true;
    const onProjectClosed = vi.fn();

    await expect(
      closeProjectIfOpen({
        closeProjectTab: () => {
          open = false;
        },
        isProjectOpen: () => open,
        isShuttingDown: () => false,
        onProjectClosed,
        onWatcherStopError: vi.fn(),
        stopProjectWatcher: async () => undefined
      })
    ).resolves.toBe(true);

    expect(onProjectClosed).toHaveBeenCalledOnce();
  });

  it("does nothing when the project is already closed", async () => {
    const closeProjectTab = vi.fn();
    const onProjectClosed = vi.fn();
    const stopProjectWatcher = vi.fn(async () => undefined);

    await expect(
      closeProjectIfOpen({
        closeProjectTab,
        isProjectOpen: () => false,
        isShuttingDown: () => false,
        onProjectClosed,
        onWatcherStopError: vi.fn(),
        stopProjectWatcher
      })
    ).resolves.toBe(false);

    expect(closeProjectTab).not.toHaveBeenCalled();
    expect(stopProjectWatcher).not.toHaveBeenCalled();
    expect(onProjectClosed).not.toHaveBeenCalled();
  });

  it("does not touch storage when shutdown has already started", async () => {
    const closeProjectTab = vi.fn();
    const isProjectOpen = vi.fn(() => true);
    const onProjectClosed = vi.fn();
    const stopProjectWatcher = vi.fn(async () => undefined);

    await expect(
      closeProjectIfOpen({
        closeProjectTab,
        isProjectOpen,
        isShuttingDown: () => true,
        onProjectClosed,
        onWatcherStopError: vi.fn(),
        stopProjectWatcher
      })
    ).resolves.toBe(false);

    expect(isProjectOpen).not.toHaveBeenCalled();
    expect(closeProjectTab).not.toHaveBeenCalled();
    expect(stopProjectWatcher).not.toHaveBeenCalled();
    expect(onProjectClosed).not.toHaveBeenCalled();
  });

  it("does not publish a stale close when the project reopens during watcher shutdown", async () => {
    let open = true;
    let finishWatcherShutdown: (() => void) | undefined;
    const onProjectClosed = vi.fn();
    const watcherShutdown = new Promise<void>((resolve) => {
      finishWatcherShutdown = resolve;
    });

    const close = closeProjectIfOpen({
      closeProjectTab: () => {
        open = false;
      },
      isProjectOpen: () => open,
      isShuttingDown: () => false,
      onProjectClosed,
      onWatcherStopError: vi.fn(),
      stopProjectWatcher: () => watcherShutdown
    });

    open = true;
    finishWatcherShutdown?.();

    await expect(close).resolves.toBe(true);
    expect(onProjectClosed).not.toHaveBeenCalled();
  });

  it("publishes the close when watcher shutdown fails after storage closes", async () => {
    let open = true;
    const onProjectClosed = vi.fn();
    const onWatcherStopError = vi.fn();
    const watcherError = new Error("watcher would not close");

    await expect(
      closeProjectIfOpen({
        closeProjectTab: () => {
          open = false;
        },
        isProjectOpen: () => open,
        isShuttingDown: () => false,
        onProjectClosed,
        onWatcherStopError,
        stopProjectWatcher: async () => Promise.reject(watcherError)
      })
    ).resolves.toBe(true);

    expect(onWatcherStopError).toHaveBeenCalledWith(watcherError);
    expect(onProjectClosed).toHaveBeenCalledOnce();
  });

  it("skips the post-stop storage check when shutdown begins in flight", async () => {
    let projectOpen = true;
    let shuttingDown = false;
    let finishWatcherShutdown: (() => void) | undefined;
    const isProjectOpen = vi.fn(() => projectOpen);
    const onProjectClosed = vi.fn();
    const watcherShutdown = new Promise<void>((resolve) => {
      finishWatcherShutdown = resolve;
    });

    const close = closeProjectIfOpen({
      closeProjectTab: () => {
        projectOpen = false;
      },
      isProjectOpen,
      isShuttingDown: () => shuttingDown,
      onProjectClosed,
      onWatcherStopError: vi.fn(),
      stopProjectWatcher: () => watcherShutdown
    });

    shuttingDown = true;
    finishWatcherShutdown?.();

    await expect(close).resolves.toBe(true);
    expect(isProjectOpen).toHaveBeenCalledOnce();
    expect(onProjectClosed).not.toHaveBeenCalled();
  });
});
