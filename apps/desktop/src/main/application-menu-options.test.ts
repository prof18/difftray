import { describe, expect, it, vi } from "vitest";

import {
  repositoryMenuItemOptions,
  reviewViewMenuItemOptions,
  settingsMenuItemOptions,
  viewMenuItemOptions
} from "./application-menu-options.js";

describe("viewMenuItemOptions", () => {
  it("includes reload and developer tools actions for dev builds", () => {
    expect(viewMenuItemOptions({ developerToolsEnabled: true })).toEqual([
      { role: "reload" },
      { role: "forceReload" },
      { role: "toggleDevTools" },
      { type: "separator" },
      { role: "togglefullscreen" }
    ]);
  });

  it("keeps developer actions out of production builds", () => {
    expect(viewMenuItemOptions({ developerToolsEnabled: false })).toEqual([
      { role: "togglefullscreen" }
    ]);
  });

  it("routes repository commands through the shared application command channel", () => {
    const onCommand = vi.fn();
    const items = repositoryMenuItemOptions(onCommand);

    expect(items.map((item) => item.label ?? item.type)).toEqual([
      "Refresh",
      "Worktrees…",
      "Show in Finder",
      "separator",
      "Close Repository",
      "Forget Repository…"
    ]);

    items[1]?.click?.({} as never, undefined, {} as never);
    expect(onCommand).toHaveBeenCalledWith("repository-worktrees");
  });

  it("uses the native settings location and shortcut", () => {
    const onCommand = vi.fn();

    expect(settingsMenuItemOptions(onCommand)).toMatchObject({
      accelerator: "CommandOrControl+,",
      label: "Settings…"
    });
  });

  it("exposes review display commands in the View menu", () => {
    const onCommand = vi.fn();

    expect(
      reviewViewMenuItemOptions(onCommand).map((item) => item.label ?? item.type)
    ).toEqual([
      "Toggle File List",
      "separator",
      "Use Split Diff",
      "Use Unified Diff",
      "Toggle Wrap Long Lines"
    ]);
  });
});
