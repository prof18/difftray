import { describe, expect, it, vi } from "vitest";

import {
  createRepositoryOpenService,
  type RepositoryOpenServiceDependencies
} from "./repository-open-service.js";

describe("repository open service", () => {
  it("canonicalizes a nested selection and registers its Git root", async () => {
    const dependencies = createDependencies();
    const service = createRepositoryOpenService(dependencies);

    const result = await service.openPaths(["/workspace/difftray/apps/desktop"]);

    expect(result).toEqual({
      duplicates: [],
      failures: [],
      newlyOpenedCount: 1,
      projects: [
        {
          id: "/workspace/difftray",
          lastOpenedAt: "2026-08-10T12:00:00.000Z",
          name: "difftray",
          path: "/workspace/difftray"
        }
      ]
    });
    expect(dependencies.registerProject).toHaveBeenCalledWith(
      expect.objectContaining({ id: "/workspace/difftray" })
    );
    expect(dependencies.clearProjectWorktreeIdentity).toHaveBeenCalledWith(
      "/workspace/difftray"
    );
  });

  it("clears stale worktree identity after registering an ordinary repository open", async () => {
    const dependencies = createDependencies();
    const calls: string[] = [];
    dependencies.registerProject.mockImplementation(() => calls.push("register"));
    dependencies.clearProjectWorktreeIdentity.mockImplementation(() =>
      calls.push("clear")
    );
    const service = createRepositoryOpenService(dependencies);

    await service.openPaths(["/workspace/difftray"]);

    expect(calls).toEqual(["register", "clear"]);
  });

  it("preserves worktree identity when reopening a linked worktree", async () => {
    const dependencies = createDependencies({
      isLinkedWorktree: vi.fn(async () => true)
    });
    const service = createRepositoryOpenService(dependencies);

    await service.openPaths(["/workspace/difftray"]);

    expect(dependencies.isLinkedWorktree).toHaveBeenCalledWith("/workspace/difftray");
    expect(dependencies.clearProjectWorktreeIdentity).not.toHaveBeenCalled();
  });

  it("clears identity when a previously linked path is now an ordinary repository", async () => {
    const dependencies = createDependencies({
      isLinkedWorktree: vi
        .fn<() => Promise<boolean>>()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)
    });
    const service = createRepositoryOpenService(dependencies);

    await service.openPaths(["/workspace/difftray"]);
    await service.openPaths(["/workspace/difftray"]);

    expect(dependencies.clearProjectWorktreeIdentity).toHaveBeenCalledOnce();
    expect(dependencies.clearProjectWorktreeIdentity).toHaveBeenCalledWith(
      "/workspace/difftray"
    );
  });

  it("rejects an open when current Git metadata cannot classify the worktree", async () => {
    const dependencies = createDependencies({
      isLinkedWorktree: vi.fn(async () => {
        throw new Error("worktree disappeared");
      })
    });
    const service = createRepositoryOpenService(dependencies);

    await expect(service.openPaths(["/workspace/difftray"])).resolves.toEqual({
      duplicates: [],
      failures: [
        {
          reason: "validation_failed",
          selectedPath: "/workspace/difftray"
        }
      ],
      newlyOpenedCount: 0,
      projects: []
    });
    expect(dependencies.registerProject).not.toHaveBeenCalled();
    expect(dependencies.clearProjectWorktreeIdentity).not.toHaveBeenCalled();
  });

  it("deduplicates canonical roots while preserving first-seen order", async () => {
    const dependencies = createDependencies({
      findRepository: async (selectedPath) => {
        if (selectedPath.includes("difftray")) {
          return { root: "/workspace/difftray" };
        }

        return { root: "/workspace/feed-flow" };
      }
    });
    const service = createRepositoryOpenService(dependencies);

    const result = await service.openPaths([
      "/workspace/difftray",
      "/workspace/feed-flow",
      "/workspace/difftray/apps/desktop"
    ]);

    expect(result.projects.map(({ id }) => id)).toEqual([
      "/workspace/difftray",
      "/workspace/feed-flow"
    ]);
    expect(result.duplicates).toEqual([
      {
        projectId: "/workspace/difftray",
        selectedPath: "/workspace/difftray/apps/desktop"
      }
    ]);
    expect(dependencies.registerProject).toHaveBeenCalledTimes(2);
    expect(result.newlyOpenedCount).toBe(2);
  });

  it("focuses an already-open repository idempotently", async () => {
    const dependencies = createDependencies({
      isProjectOpen: () => true
    });
    const service = createRepositoryOpenService(dependencies);

    const result = await service.openPaths(["/workspace/difftray"]);

    expect(result.projects).toHaveLength(1);
    expect(result.duplicates).toEqual([
      {
        projectId: "/workspace/difftray",
        selectedPath: "/workspace/difftray"
      }
    ]);
    expect(dependencies.registerProject).toHaveBeenCalledOnce();
    expect(result.newlyOpenedCount).toBe(0);
  });

  it("returns partial failures without discarding valid repositories", async () => {
    const dependencies = createDependencies({
      findRepository: async (selectedPath) =>
        selectedPath.includes("invalid") ? null : { root: "/workspace/difftray" }
    });
    const service = createRepositoryOpenService(dependencies);

    const result = await service.openPaths(["/workspace/invalid", "/workspace/difftray"]);

    expect(result.projects.map(({ id }) => id)).toEqual(["/workspace/difftray"]);
    expect(result.failures).toEqual([
      {
        reason: "not_git_repository",
        selectedPath: "/workspace/invalid"
      }
    ]);
  });
});

function createDependencies(
  overrides: Omit<
    Partial<RepositoryOpenServiceDependencies>,
    "clearProjectWorktreeIdentity" | "registerProject"
  > = {}
): RepositoryOpenServiceDependencies & {
  readonly clearProjectWorktreeIdentity: ReturnType<typeof vi.fn>;
  readonly registerProject: ReturnType<typeof vi.fn>;
} {
  return {
    clearProjectWorktreeIdentity: vi.fn(),
    findRepository: async () => ({ root: "/workspace/difftray" }),
    isLinkedWorktree: vi.fn(async () => false),
    isProjectOpen: () => false,
    now: () => new Date("2026-08-10T12:00:00.000Z"),
    registerProject: vi.fn(),
    ...overrides
  };
}
