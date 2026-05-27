import { describe, expect, it, vi } from "vitest";

import { resolveAutoUpdater, type AutoUpdaterLike } from "./electron-updater.js";

function autoUpdater(): AutoUpdaterLike {
  return {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    checkForUpdates: vi.fn().mockResolvedValue(undefined),
    logger: undefined,
    on: vi.fn().mockReturnThis(),
    quitAndInstall: vi.fn()
  } as AutoUpdaterLike;
}

describe("resolveAutoUpdater", () => {
  it("uses the named autoUpdater export", () => {
    const updater = autoUpdater();

    expect(resolveAutoUpdater({ autoUpdater: updater })).toBe(updater);
  });

  it("uses the CommonJS default interop shape", () => {
    const updater = autoUpdater();

    expect(resolveAutoUpdater({ default: { autoUpdater: updater } })).toBe(updater);
  });

  it("uses the module.exports interop shape", () => {
    const updater = autoUpdater();

    expect(resolveAutoUpdater({ "module.exports": { autoUpdater: updater } })).toBe(
      updater
    );
  });

  it("fails explicitly when no usable autoUpdater exists", () => {
    expect(() => {
      resolveAutoUpdater({ default: {} });
    }).toThrow("electron-updater did not expose autoUpdater");
  });
});
