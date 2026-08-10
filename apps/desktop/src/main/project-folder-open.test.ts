import { describe, expect, it, vi } from "vitest";

import { openStoredProjectDirectory } from "./project-folder-open.js";

describe("openStoredProjectDirectory", () => {
  it("opens the stored project path", async () => {
    const openPath = vi.fn(async () => "");

    await openStoredProjectDirectory("project-1", {
      findProject: (projectId) =>
        projectId === "project-1" ? { path: "/workspace/project-1" } : undefined,
      openPath
    });

    expect(openPath).toHaveBeenCalledWith("/workspace/project-1");
  });

  it("rejects unknown projects without opening a path", async () => {
    const openPath = vi.fn(async () => "");

    await expect(
      openStoredProjectDirectory("missing-project", {
        findProject: () => undefined,
        openPath
      })
    ).rejects.toThrow("Project is not stored: missing-project");
    expect(openPath).not.toHaveBeenCalled();
  });

  it("rejects Finder launch failures", async () => {
    await expect(
      openStoredProjectDirectory("project-1", {
        findProject: () => ({ path: "/workspace/project-1" }),
        openPath: async () => "Finder is unavailable"
      })
    ).rejects.toThrow("Unable to open project in Finder: Finder is unavailable");
  });
});
