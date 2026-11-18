import { describe, expect, it } from "vitest";

import { openStorage } from "../src/index.js";

const appGitDir = "/work/app/.git";
const otherGitDir = "/work/other/.git";

describe("learn cursor store", () => {
  it("returns null before any mark", () => {
    const storage = openStorage(":memory:");
    expect(storage.getLearnCursor(appGitDir)).toBeNull();
    storage.close();
  });

  it("stores a cursor and only moves it forward", () => {
    const storage = openStorage(":memory:");

    expect(storage.advanceLearnCursor(appGitDir, "2026-11-10T10:00:00.000Z")).toEqual({
      cursorAt: "2026-11-10T10:00:00.000Z",
      moved: true
    });
    expect(storage.getLearnCursor(appGitDir)).toBe("2026-11-10T10:00:00.000Z");

    expect(storage.advanceLearnCursor(appGitDir, "2026-11-09T10:00:00.000Z")).toEqual({
      cursorAt: "2026-11-10T10:00:00.000Z",
      moved: false
    });
    expect(storage.advanceLearnCursor(appGitDir, "2026-11-10T10:00:00.000Z")).toEqual({
      cursorAt: "2026-11-10T10:00:00.000Z",
      moved: false
    });
    expect(storage.getLearnCursor(appGitDir)).toBe("2026-11-10T10:00:00.000Z");

    expect(storage.advanceLearnCursor(appGitDir, "2026-11-11T10:00:00.000Z")).toEqual({
      cursorAt: "2026-11-11T10:00:00.000Z",
      moved: true
    });
    storage.close();
  });

  it("compares timestamps by time, not by string order", () => {
    const storage = openStorage(":memory:");
    storage.advanceLearnCursor(appGitDir, "2026-11-10T10:00:00.000Z");

    // Same instant in another offset: string order would call it newer.
    expect(
      storage.advanceLearnCursor(appGitDir, "2026-11-10T11:00:00.000+01:00")
    ).toEqual({ cursorAt: "2026-11-10T10:00:00.000Z", moved: false });
    // Earlier instant whose string sorts after the stored one.
    expect(storage.advanceLearnCursor(appGitDir, "2026-11-10T10:30:00+02:00")).toEqual({
      cursorAt: "2026-11-10T10:00:00.000Z",
      moved: false
    });
    expect(storage.getLearnCursor(appGitDir)).toBe("2026-11-10T10:00:00.000Z");
    storage.close();
  });

  it("keeps separate cursors per repository and deletes only one", () => {
    const storage = openStorage(":memory:");
    storage.advanceLearnCursor(appGitDir, "2026-11-10T10:00:00.000Z");
    storage.advanceLearnCursor(otherGitDir, "2026-11-01T10:00:00.000Z");

    expect(storage.getLearnCursor(appGitDir)).toBe("2026-11-10T10:00:00.000Z");
    expect(storage.getLearnCursor(otherGitDir)).toBe("2026-11-01T10:00:00.000Z");

    storage.deleteLearnCursor(appGitDir);
    expect(storage.getLearnCursor(appGitDir)).toBeNull();
    expect(storage.getLearnCursor(otherGitDir)).toBe("2026-11-01T10:00:00.000Z");
    storage.close();
  });

  it("deletes the cursor only when the last worktree of the repository is forgotten", () => {
    const storage = openStorage(":memory:");
    storage.upsertProject({ id: "/work/app", name: "app", path: "/work/app" });
    storage.upsertProject({
      id: "/work/app-feature",
      name: "app-feature",
      path: "/work/app-feature"
    });
    storage.upsertProject({ id: "/work/other", name: "other", path: "/work/other" });
    storage.setProjectCommonGitDir("/work/app", appGitDir, null, null);
    storage.setProjectCommonGitDir("/work/app-feature", appGitDir, null, null);
    storage.setProjectCommonGitDir("/work/other", otherGitDir, null, null);
    storage.advanceLearnCursor(appGitDir, "2026-11-10T10:00:00.000Z");
    storage.advanceLearnCursor(otherGitDir, "2026-11-01T10:00:00.000Z");

    storage.forgetProject("/work/app-feature");
    expect(storage.getProject("/work/app-feature")).toBeNull();
    expect(storage.getLearnCursor(appGitDir)).toBe("2026-11-10T10:00:00.000Z");

    storage.forgetProject("/work/app");
    expect(storage.getProject("/work/app")).toBeNull();
    expect(storage.getLearnCursor(appGitDir)).toBeNull();
    expect(storage.getLearnCursor(otherGitDir)).toBe("2026-11-01T10:00:00.000Z");
    storage.close();
  });
});
