import { describe, expect, it } from "vitest";

import { viewMenuItemOptions } from "./application-menu-options.js";

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
});
