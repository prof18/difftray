import { describe, expect, it } from "vitest";

import { resolveUpdateMenuItemState } from "./update-menu-item.js";

describe("resolveUpdateMenuItemState", () => {
  it("enables manual checks when idle", () => {
    expect(resolveUpdateMenuItemState({ kind: "idle" })).toEqual({
      enabled: true,
      label: "Check for Updates…"
    });
  });

  it("shows an in-progress label while checking or downloading", () => {
    expect(resolveUpdateMenuItemState({ kind: "checking" })).toEqual({
      enabled: false,
      label: "Checking for Updates…"
    });
    expect(
      resolveUpdateMenuItemState({
        kind: "downloading",
        percent: 42,
        version: "1.2.3"
      })
    ).toEqual({
      enabled: false,
      label: "Checking for Updates…"
    });
    expect(resolveUpdateMenuItemState({ kind: "available", version: "1.2.3" })).toEqual({
      enabled: false,
      label: "Checking for Updates…"
    });
  });

  it("disables manual checks once an update is ready to install", () => {
    expect(resolveUpdateMenuItemState({ kind: "downloaded", version: "1.2.3" })).toEqual({
      enabled: false,
      label: "Update Ready to Install"
    });
  });

  it("re-enables manual checks after an update error", () => {
    expect(
      resolveUpdateMenuItemState({ kind: "error", message: "network failed" })
    ).toEqual({
      enabled: true,
      label: "Check for Updates…"
    });
  });
});
