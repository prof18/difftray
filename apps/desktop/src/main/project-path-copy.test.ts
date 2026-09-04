import { describe, expect, it, vi } from "vitest";

import { copyStoredProjectPath } from "./project-path-copy.js";

describe("copyStoredProjectPath", () => {
  it("copies the authoritative stored project path", () => {
    const writeText = vi.fn();

    copyStoredProjectPath("project-1", {
      findProject: (projectId) =>
        projectId === "project-1" ? { path: "/workspace/project-1" } : undefined,
      writeText
    });

    expect(writeText).toHaveBeenCalledWith("/workspace/project-1");
  });

  it("rejects an unknown project without changing the clipboard", () => {
    const writeText = vi.fn();

    expect(() =>
      copyStoredProjectPath("missing-project", {
        findProject: () => undefined,
        writeText
      })
    ).toThrow("Project is not stored: missing-project");
    expect(writeText).not.toHaveBeenCalled();
  });
});
