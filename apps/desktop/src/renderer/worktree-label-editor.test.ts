import { afterEach, describe, expect, it, vi } from "vitest";

import {
  currentWorktreeForLabel,
  ipcErrorMessage,
  loadLabelRefresh,
  withProjectLabel
} from "./worktree-label-editor.js";

function worktree(
  id: string,
  state: RepositoryWorktreeView["state"]
): RepositoryWorktreeView {
  return { displayName: id, displayPath: `/repo/${id}`, id, locked: false, state };
}

function stubListWorktrees(
  implementation: (projectId: string) => Promise<readonly RepositoryWorktreeView[]>
) {
  const listProjectWorktrees = vi.fn(implementation);
  vi.stubGlobal("window", { difftray: { listProjectWorktrees } });
  return listProjectWorktrees;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("currentWorktreeForLabel", () => {
  it("resolves the single current row of a main-only project", async () => {
    const listProjectWorktrees = stubListWorktrees(async () => [
      worktree("main", "current")
    ]);

    await expect(currentWorktreeForLabel("project-1")).resolves.toEqual({
      worktree: worktree("main", "current")
    });
    expect(listProjectWorktrees).toHaveBeenCalledWith("project-1");
  });

  it("never treats the project id as a worktree id when no current row exists", async () => {
    stubListWorktrees(async () => [worktree("other", "available")]);

    await expect(currentWorktreeForLabel("project-1")).resolves.toEqual({
      error: "Current worktree is not available. Retry."
    });
  });

  it("reports discovery failures as retryable", async () => {
    stubListWorktrees(async () => {
      throw new Error("git unavailable");
    });

    await expect(currentWorktreeForLabel("project-1")).resolves.toEqual({
      error: "Current worktree is not available. Retry."
    });
  });
});

describe("loadLabelRefresh", () => {
  it("still returns the project list when the worktree listing fails", async () => {
    const projects = [{ customLabel: "New", id: "p", name: "agent", path: "/repo" }];
    vi.stubGlobal("window", {
      difftray: {
        listProjectWorktrees: vi.fn(async () => {
          throw new Error("missing directory");
        }),
        listRecentProjects: vi.fn(async () => projects)
      }
    });

    await expect(loadLabelRefresh("p")).resolves.toEqual({ projects });
  });

  it("returns both lists and skips worktrees without an active project", async () => {
    const worktrees = [worktree("main", "current")];
    const listProjectWorktrees = vi.fn(async () => worktrees);
    vi.stubGlobal("window", {
      difftray: { listProjectWorktrees, listRecentProjects: vi.fn(async () => []) }
    });

    await expect(loadLabelRefresh("p")).resolves.toEqual({ projects: [], worktrees });
    await expect(loadLabelRefresh(undefined)).resolves.toEqual({ projects: [] });
    expect(listProjectWorktrees).toHaveBeenCalledTimes(1);
  });
});

describe("withProjectLabel", () => {
  it("copies the refreshed label onto the matching project", () => {
    expect(
      withProjectLabel({ id: "p", name: "agent", path: "/repo/agent" }, [
        { customLabel: "Checkout", id: "p", name: "agent", path: "/repo/agent" }
      ])
    ).toEqual({ customLabel: "Checkout", id: "p", name: "agent", path: "/repo/agent" });
  });

  it("removes a reset label and leaves unknown projects alone", () => {
    const labeled = { customLabel: "Old", id: "p", name: "agent", path: "/repo/agent" };

    expect(
      withProjectLabel(labeled, [{ id: "p", name: "agent", path: "/repo/agent" }])
    ).toEqual({ id: "p", name: "agent", path: "/repo/agent" });
    expect(withProjectLabel(labeled, [])).toBe(labeled);
  });
});

describe("ipcErrorMessage", () => {
  it("strips the Electron remote-invocation prefix", () => {
    expect(
      ipcErrorMessage(
        new Error(
          "Error invoking remote method 'projects:setWorktreeLabel': WorktreeLabelValidationError: label must be 1 to 80 characters"
        )
      )
    ).toBe("label must be 1 to 80 characters");
    expect(ipcErrorMessage(new Error("plain"))).toBe("plain");
  });
});
