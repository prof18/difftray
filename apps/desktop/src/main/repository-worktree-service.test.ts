import { describe, expect, it, vi } from "vitest";

import type { GitWorktreeCandidate } from "@difftray/git";

import {
  createRepositoryWorktreeService,
  ExpectedUnavailableWorktreeError,
  type RepositoryWorktreeServiceDependencies
} from "./repository-worktree-service.js";

describe("repository worktree service", () => {
  it("lists current, open, and available worktrees with distinct paths", async () => {
    const dependencies = createDependencies();
    dependencies.changeCount = (worktreePath) =>
      worktreePath === "/workspace/source" ? 3 : undefined;
    const service = createRepositoryWorktreeService(dependencies);

    await expect(service.list("source")).resolves.toEqual([
      expect.objectContaining({
        branchName: "main",
        changeCount: 3,
        displayName: "main",
        state: "current"
      }),
      expect.objectContaining({
        displayName: "Detached @ 2222222",
        state: "open"
      }),
      expect.objectContaining({
        branchName: "codex/feature",
        locked: true,
        state: "available"
      })
    ]);
    expect(dependencies.queueChangeCount).toHaveBeenCalledTimes(3);
    expect(dependencies.queueChangeCount).toHaveBeenNthCalledWith(
      1,
      "/workspace/source",
      { refresh: true }
    );
  });

  it("re-lists and opens an available candidate through the shared service", async () => {
    const dependencies = createDependencies();
    const service = createRepositoryWorktreeService(dependencies);

    const result = await service.open("source", "candidate-3");

    expect(dependencies.openPaths).toHaveBeenCalledWith(["/workspace/agent"]);
    expect(result).toEqual(expect.objectContaining({ id: "/workspace/agent" }));
    expect(dependencies.persistProject).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "/workspace/agent",
        repositoryName: "Source repository",
        worktreeName: "codex/feature"
      })
    );
  });

  it("resolves only a listed worktree path for clipboard actions", async () => {
    const dependencies = createDependencies();
    const service = createRepositoryWorktreeService(dependencies);

    await expect(service.resolvePath("source", "candidate-2")).resolves.toBe(
      "/workspace/agent-copy"
    );
    await expect(service.resolvePath("source", "forged")).rejects.toBeInstanceOf(
      ExpectedUnavailableWorktreeError
    );

    dependencies.listWorktrees.mockResolvedValueOnce([
      { ...worktrees[1], prunable: true }
    ]);
    await expect(service.resolvePath("source", "candidate-2")).rejects.toBeInstanceOf(
      ExpectedUnavailableWorktreeError
    );
  });

  it("batches availability by shared common Git directory without queuing change counts", async () => {
    const dependencies = createDependencies();
    const service = createRepositoryWorktreeService(dependencies);

    await expect(service.availability(["copy", "missing", "source"])).resolves.toEqual([
      { hasSiblingWorktrees: true, projectId: "copy" },
      { hasSiblingWorktrees: false, projectId: "missing" },
      { hasSiblingWorktrees: true, projectId: "source" }
    ]);

    expect(dependencies.listWorktrees).toHaveBeenCalledTimes(1);
    expect(dependencies.queueChangeCount).not.toHaveBeenCalled();
  });

  it("bounds concurrent Git discovery across distinct repositories", async () => {
    let activeInfoCalls = 0;
    let activeListCalls = 0;
    let peakInfoCalls = 0;
    let peakListCalls = 0;
    const dependencies = createDependencies();
    const projectIds = Array.from({ length: 5 }, (_, index) => `project-${index}`);
    const dynamicDependencies = {
      ...dependencies,
      findProject: vi.fn((projectId: string) => ({
        id: projectId,
        name: projectId,
        path: `/workspace/${projectId}`
      }))
    };
    dependencies.worktreeInfo.mockImplementation(async (worktreePath: string) => {
      activeInfoCalls += 1;
      peakInfoCalls = Math.max(peakInfoCalls, activeInfoCalls);
      await new Promise((resolve) => setTimeout(resolve, 1));
      activeInfoCalls -= 1;
      return { commonGitDir: `${worktreePath}/.git`, root: worktreePath };
    });
    dependencies.listWorktrees.mockImplementation(async () => {
      activeListCalls += 1;
      peakListCalls = Math.max(peakListCalls, activeListCalls);
      await new Promise((resolve) => setTimeout(resolve, 1));
      activeListCalls -= 1;
      return [{ ...worktrees[0] }];
    });
    const service = createRepositoryWorktreeService(dynamicDependencies);

    await service.availability(projectIds);

    expect(peakInfoCalls).toBeLessThanOrEqual(4);
    expect(peakListCalls).toBeLessThanOrEqual(4);
    expect(dependencies.listWorktrees).toHaveBeenCalledTimes(5);
  });

  it("rejects forged, stale, prunable, and common-directory mismatched candidates", async () => {
    const dependencies = createDependencies();
    const service = createRepositoryWorktreeService(dependencies);

    await expect(service.open("source", "candidate-1")).rejects.toBeInstanceOf(
      ExpectedUnavailableWorktreeError
    );
    expect(dependencies.openPaths).not.toHaveBeenCalled();

    await expect(service.open("source", "forged")).rejects.toThrow(
      "Worktree is no longer available"
    );

    dependencies.pathExists.mockReturnValueOnce(false);
    await expect(service.open("source", "candidate-3")).rejects.toThrow(
      "Worktree path is no longer available"
    );

    dependencies.listWorktrees.mockResolvedValueOnce([
      { ...worktrees[2], prunable: true }
    ]);
    await expect(service.open("source", "candidate-3")).rejects.toThrow(
      "Worktree cannot be opened"
    );

    dependencies.worktreeInfo.mockImplementation(async (worktreePath) => ({
      commonGitDir:
        worktreePath === "/workspace/source"
          ? "/workspace/source/.git"
          : "/workspace/other/.git",
      root: worktreePath
    }));
    await expect(service.open("source", "candidate-3")).rejects.toThrow(
      "Worktree belongs to a different repository"
    );
  });

  it("preserves discovery, validation probe, and open failures as real errors", async () => {
    const dependencies = createDependencies();
    const service = createRepositoryWorktreeService(dependencies);

    dependencies.listWorktrees.mockRejectedValueOnce(new Error("git unavailable"));
    await expect(service.open("source", "candidate-3")).rejects.toThrow(
      "git unavailable"
    );

    dependencies.worktreeInfo.mockRejectedValueOnce(new Error("git probe failed"));
    await expect(service.open("source", "candidate-3")).rejects.toThrow(
      "git probe failed"
    );

    dependencies.openPaths.mockRejectedValueOnce(new Error("open failed"));
    await expect(service.open("source", "candidate-3")).rejects.toThrow("open failed");

    dependencies.listWorktrees.mockResolvedValueOnce([]);
    await expect(service.open("source", "candidate-3")).rejects.toBeInstanceOf(
      ExpectedUnavailableWorktreeError
    );
  });
});

const worktrees: readonly GitWorktreeCandidate[] = [
  {
    branchName: "main",
    commonGitDir: "/workspace/source/.git",
    current: true,
    headSha: "1".repeat(40),
    id: "candidate-1",
    locked: false,
    path: "/workspace/source"
  },
  {
    commonGitDir: "/workspace/source/.git",
    current: false,
    detached: true,
    headSha: "2".repeat(40),
    id: "candidate-2",
    locked: false,
    path: "/workspace/agent-copy"
  },
  {
    branchName: "codex/feature",
    commonGitDir: "/workspace/source/.git",
    current: false,
    headSha: "3".repeat(40),
    id: "candidate-3",
    locked: true,
    path: "/workspace/agent"
  }
];

function createDependencies(): RepositoryWorktreeServiceDependencies & {
  changeCount?: (worktreePath: string) => number | null | undefined;
  readonly listWorktrees: ReturnType<typeof vi.fn>;
  readonly openPaths: ReturnType<typeof vi.fn>;
  readonly persistProject: ReturnType<typeof vi.fn>;
  readonly pathExists: ReturnType<typeof vi.fn>;
  readonly queueChangeCount: ReturnType<typeof vi.fn>;
  readonly worktreeInfo: ReturnType<typeof vi.fn>;
} {
  const listWorktrees = vi.fn(async () => worktrees);
  const openPaths = vi.fn(async () => ({
    duplicates: [],
    failures: [],
    newlyOpenedCount: 1,
    projects: [
      {
        id: "/workspace/agent",
        name: "agent",
        path: "/workspace/agent"
      }
    ]
  }));
  const pathExists = vi.fn(() => true);
  const persistProject = vi.fn();
  const queueChangeCount = vi.fn();
  const worktreeInfo = vi.fn(async (worktreePath: string) => ({
    commonGitDir: "/workspace/source/.git",
    root: worktreePath
  }));

  return {
    findProject: (projectId) =>
      projectId === "source"
        ? { id: "source", name: "Source repository", path: "/workspace/source" }
        : projectId === "copy"
          ? { id: "copy", name: "Agent copy", path: "/workspace/agent-copy" }
          : undefined,
    findRepository: async (worktreePath) => ({ root: worktreePath }),
    listOpenProjects: () => [
      { id: "source", path: "/workspace/source" },
      { id: "copy", path: "/workspace/agent-copy" }
    ],
    listWorktrees,
    openPaths,
    persistProject,
    pathExists,
    queueChangeCount,
    worktreeInfo
  };
}
