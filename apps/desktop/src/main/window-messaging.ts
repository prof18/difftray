import type { BrowserWindow } from "electron";

/**
 * Sends a renderer event only while the window and its web contents are alive.
 * Menu callbacks can outlive a macOS window after its last window is closed.
 */
export function sendToBrowserWindow(
  window: BrowserWindow | undefined,
  channel: string,
  ...args: unknown[]
): void {
  if (!window || window.isDestroyed() || window.webContents.isDestroyed()) {
    return;
  }

  window.webContents.send(channel, ...args);
}
