import { describe, expect, it, vi } from "vitest";

import { sendToBrowserWindow } from "./window-messaging.js";

describe("sendToBrowserWindow", () => {
  it.each(["window", "web contents"])(
    "does not send when the %s is destroyed",
    (destroyedPart) => {
      const send = vi.fn();
      const window = {
        isDestroyed: vi.fn(() => destroyedPart === "window"),
        webContents: {
          isDestroyed: vi.fn(() => destroyedPart === "web contents"),
          send
        }
      } as never;

      sendToBrowserWindow(window, "application:command", "repository-refresh");

      expect(send).not.toHaveBeenCalled();
    }
  );

  it("sends while the window and web contents are alive", () => {
    const send = vi.fn();
    const window = {
      isDestroyed: () => false,
      webContents: {
        isDestroyed: () => false,
        send
      }
    } as never;

    sendToBrowserWindow(window, "application:command", "repository-refresh");

    expect(send).toHaveBeenCalledWith("application:command", "repository-refresh");
  });
});
