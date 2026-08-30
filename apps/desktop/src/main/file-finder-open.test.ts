import { describe, expect, it, vi } from "vitest";

import { revealStoredProjectFile } from "./file-finder-open.js";

describe("revealStoredProjectFile", () => {
  it("reveals a validated working-tree file in Finder", async () => {
    const showItemInFolder = vi.fn();

    await expect(
      revealStoredProjectFile("project-1", "src/App.tsx", {
        findProject: () => ({ path: "/workspace/project-1" }),
        findReviewFile: async () => ({ path: "src/App.tsx", status: "modified" }),
        resolveSafeFilePath: async () => "/workspace/project-1/src/App.tsx",
        showItemInFolder
      })
    ).resolves.toEqual({ status: "opened" });

    expect(showItemInFolder).toHaveBeenCalledWith("/workspace/project-1/src/App.tsx");
  });

  it("rejects deleted and missing files without opening Finder", async () => {
    const showItemInFolder = vi.fn();
    const dependencies = {
      findProject: () => ({ path: "/workspace/project-1" }),
      findReviewFile: async () => ({ path: "src/App.tsx", status: "deleted" }),
      resolveSafeFilePath: async () => "/workspace/project-1/src/App.tsx",
      showItemInFolder
    };

    await expect(
      revealStoredProjectFile("project-1", "src/App.tsx", dependencies)
    ).resolves.toEqual({ reason: "file_missing", status: "rejected" });

    await expect(
      revealStoredProjectFile("project-1", "missing.ts", {
        ...dependencies,
        findReviewFile: async () => undefined
      })
    ).resolves.toEqual({ reason: "file_missing", status: "rejected" });

    expect(showItemInFolder).not.toHaveBeenCalled();
  });

  it("rejects paths that fail safe project-path resolution", async () => {
    const showItemInFolder = vi.fn();

    await expect(
      revealStoredProjectFile("project-1", "../outside.ts", {
        findProject: () => ({ path: "/workspace/project-1" }),
        findReviewFile: async () => ({ path: "../outside.ts", status: "modified" }),
        resolveSafeFilePath: async () => undefined,
        showItemInFolder
      })
    ).resolves.toEqual({ reason: "file_missing", status: "rejected" });

    expect(showItemInFolder).not.toHaveBeenCalled();
  });

  it("rejects unknown projects", async () => {
    await expect(
      revealStoredProjectFile("missing-project", "src/App.tsx", {
        findProject: () => undefined,
        findReviewFile: async () => undefined,
        resolveSafeFilePath: async () => undefined,
        showItemInFolder: vi.fn()
      })
    ).rejects.toThrow("Project is not stored: missing-project");
  });
});
