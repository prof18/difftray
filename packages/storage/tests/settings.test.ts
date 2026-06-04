import { describe, expect, it } from "vitest";

import {
  appBooleanSetting,
  appNumberSetting,
  clampAutoCollapseHunks,
  clampFileListWidth,
  defaultAppSettings,
  diffModeFromValue,
  isThemeMode,
  parseEditorLaunchConfig,
  parseOptionalEditorLaunchConfig,
  reviewResetTriggerFromValue
} from "../src/settings.js";

describe("storage settings normalization", () => {
  it("clamps numeric settings to supported ranges", () => {
    expect(clampFileListWidth(100)).toBe(220);
    expect(clampFileListWidth(340.4)).toBe(340);
    expect(clampFileListWidth(900)).toBe(540);

    expect(clampAutoCollapseHunks(0)).toBe(20);
    expect(clampAutoCollapseHunks(120.6)).toBe(121);
    expect(clampAutoCollapseHunks(2000)).toBe(999);
  });

  it("normalizes stored enum values with stable fallbacks", () => {
    expect(diffModeFromValue("unified")).toBe("unified");
    expect(diffModeFromValue("side-by-side")).toBe("split");

    expect(reviewResetTriggerFromValue("line_count")).toBe("line_count");
    expect(reviewResetTriggerFromValue("commit_sha")).toBe("commit_sha");
    expect(reviewResetTriggerFromValue("unknown")).toBe("diff_content");
  });

  it("normalizes stored boolean and number settings", () => {
    expect(appBooleanSetting(undefined, true)).toBe(true);
    expect(appBooleanSetting("1", false)).toBe(true);
    expect(appBooleanSetting("0", true)).toBe(false);

    expect(appNumberSetting(undefined, 140, clampAutoCollapseHunks)).toBe(140);
    expect(appNumberSetting("0", 140, clampAutoCollapseHunks)).toBe(20);
    expect(appNumberSetting("invalid", 140, clampAutoCollapseHunks)).toBe(140);
  });

  it("returns stable default app settings", () => {
    expect(defaultAppSettings()).toEqual({
      autoCollapseHunksOver: 120,
      defaultDiffMode: "split",
      hideWhitespaceOnlyChanges: false,
      notifyOnDrift: true,
      reviewResetTrigger: "diff_content",
      showGeneratedFiles: false,
      themeMode: "system",
      wrapDiffLines: true
    });
  });
});

describe("stored editor launch config parsing", () => {
  it("parses valid editor launch config JSON", () => {
    expect(
      parseEditorLaunchConfig(
        JSON.stringify({
          args: ["-b", "com.microsoft.VSCode", "{path}"],
          command: "open"
        })
      )
    ).toEqual({
      args: ["-b", "com.microsoft.VSCode", "{path}"],
      command: "open"
    });
  });

  it("rejects malformed editor launch config JSON", () => {
    expect(() => parseEditorLaunchConfig("{")).toThrow(
      "Stored editor launch config is invalid."
    );
    expect(() => parseEditorLaunchConfig(JSON.stringify({ command: "open" }))).toThrow(
      "Stored editor launch config is invalid."
    );
    expect(() =>
      parseEditorLaunchConfig(JSON.stringify({ args: [1], command: "open" }))
    ).toThrow("Stored editor launch config is invalid.");
  });

  it("drops optional editor launch configs that are absent or invalid", () => {
    expect(parseOptionalEditorLaunchConfig(undefined)).toBeUndefined();
    expect(parseOptionalEditorLaunchConfig("")).toBeUndefined();
    expect(parseOptionalEditorLaunchConfig("{")).toBeUndefined();
  });
});

describe("theme mode validation", () => {
  it("accepts known theme modes only", () => {
    expect(isThemeMode("dark")).toBe(true);
    expect(isThemeMode("light")).toBe(true);
    expect(isThemeMode("system")).toBe(true);
    expect(isThemeMode("sepia")).toBe(false);
  });
});
