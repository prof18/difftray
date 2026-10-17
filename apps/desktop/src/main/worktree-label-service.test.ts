import { describe, expect, it, vi } from "vitest";

import type { GitWorktreeCandidate } from "@difftray/git";

import { ExpectedUnavailableWorktreeError } from "./repository-worktree-service.js";
import {
  createWorktreeLabelService,
  WorktreeLabelValidationError,
  type WorktreeLabelServiceDependencies
} from "./worktree-label-service.js";

describe("worktree label service", () => {
  it("labels an exact worktree root and reports the change", async () => {
    const dependencies = createDependencies();
    const service = createWorktreeLabelService(dependencies);

    const result = await service.setForPath("/workspace/agent", "  Checkout rework ");

    expect(result).toEqual({ candidate: worktrees[1], label: "Checkout rework" });
    expect(dependencies.setLabel).toHaveBeenCalledWith({
      commonGitDir: "/workspace/source/.git",
      label: "Checkout rework",
      worktreeId: "candidate-2",
      worktreePath: "/workspace/agent"
    });
    expect(dependencies.onChanged).toHaveBeenCalledWith({
      worktreeId: "candidate-2",
      worktreePath: "/workspace/agent"
    });
  });

  it("resets a label with null and is idempotent", async () => {
    const dependencies = createDependencies();
    const service = createWorktreeLabelService(dependencies);

    await service.setForPath("/workspace/agent", null);
    await service.setForPath("/workspace/agent", null);

    expect(dependencies.resetLabel).toHaveBeenCalledTimes(2);
    expect(dependencies.resetLabel).toHaveBeenCalledWith("candidate-2");
    expect(dependencies.setLabel).not.toHaveBeenCalled();
  });

  it("rejects a subdirectory instead of choosing its parent worktree", async () => {
    const dependencies = createDependencies();
    dependencies.findRepository.mockResolvedValue({ root: "/workspace/agent" });
    const service = createWorktreeLabelService(dependencies);

    await expect(service.setForPath("/workspace/agent/src", "Label")).rejects.toThrow(
      "Path is not a worktree root"
    );
    expect(dependencies.setLabel).not.toHaveBeenCalled();
    expect(dependencies.onChanged).not.toHaveBeenCalled();
  });

  it("rejects paths outside Git without writing", async () => {
    const dependencies = createDependencies();
    dependencies.findRepository.mockResolvedValue(null);
    const service = createWorktreeLabelService(dependencies);

    await expect(service.setForPath("/tmp/plain", "Label")).rejects.toBeInstanceOf(
      ExpectedUnavailableWorktreeError
    );
    expect(dependencies.setLabel).not.toHaveBeenCalled();
  });

  it("validates the label before touching Git", async () => {
    const dependencies = createDependencies();
    const service = createWorktreeLabelService(dependencies);

    await expect(service.setForPath("/workspace/agent", "  ")).rejects.toBeInstanceOf(
      WorktreeLabelValidationError
    );
    await expect(
      service.setForCandidate(worktrees[1] as GitWorktreeCandidate, "\tLabel")
    ).rejects.toBeInstanceOf(WorktreeLabelValidationError);
    expect(dependencies.findRepository).not.toHaveBeenCalled();
    expect(dependencies.listWorktrees).not.toHaveBeenCalled();
    expect(dependencies.setLabel).not.toHaveBeenCalled();
  });

  it("allows the current, main and locked worktrees", async () => {
    const dependencies = createDependencies();
    const service = createWorktreeLabelService(dependencies);

    await service.setForCandidate(worktrees[0] as GitWorktreeCandidate, "Main checkout");
    await service.setForCandidate(worktrees[2] as GitWorktreeCandidate, "Locked work");

    expect(dependencies.setLabel).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ worktreeId: "candidate-1" })
    );
    expect(dependencies.setLabel).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ worktreeId: "candidate-3" })
    );
  });

  it("rejects stale, missing, prunable, bare and foreign candidates without writing", async () => {
    const dependencies = createDependencies();
    const service = createWorktreeLabelService(dependencies);
    const candidate = worktrees[1] as GitWorktreeCandidate;

    dependencies.listWorktrees.mockResolvedValueOnce([
      worktrees[0] as GitWorktreeCandidate
    ]);
    await expect(service.setForCandidate(candidate, "Label")).rejects.toThrow(
      "Worktree is no longer available"
    );

    dependencies.pathExists.mockReturnValueOnce(false);
    await expect(service.setForCandidate(candidate, "Label")).rejects.toThrow(
      "Worktree path is no longer available"
    );

    await expect(
      service.setForCandidate({ ...candidate, prunable: true }, "Label")
    ).rejects.toThrow("Worktree cannot be labeled");
    await expect(
      service.setForCandidate({ ...candidate, bare: true }, "Label")
    ).rejects.toThrow("Worktree cannot be labeled");

    dependencies.worktreeInfo.mockResolvedValueOnce({
      commonGitDir: "/workspace/other/.git",
      root: "/workspace/agent"
    });
    await expect(service.setForCandidate(candidate, "Label")).rejects.toThrow(
      "Worktree belongs to a different repository"
    );

    dependencies.findRepository.mockResolvedValueOnce({ root: "/workspace" });
    await expect(service.setForCandidate(candidate, "Label")).rejects.toThrow(
      "Worktree path is no longer a valid Git root"
    );

    expect(dependencies.setLabel).not.toHaveBeenCalled();
    expect(dependencies.resetLabel).not.toHaveBeenCalled();
    expect(dependencies.onChanged).not.toHaveBeenCalled();
  });

  it("writes through one path for both entry points", async () => {
    const dependencies = createDependencies();
    const service = createWorktreeLabelService(dependencies);

    await service.setForPath("/workspace/agent", "From path");
    await service.setForCandidate(worktrees[1] as GitWorktreeCandidate, "From candidate");

    expect(dependencies.setLabel.mock.calls.map(([input]) => input.label)).toEqual([
      "From path",
      "From candidate"
    ]);
    expect(dependencies.onChanged).toHaveBeenCalledTimes(2);
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
    branchName: "codex/checkout",
    commonGitDir: "/workspace/source/.git",
    current: false,
    headSha: "2".repeat(40),
    id: "candidate-2",
    locked: false,
    path: "/workspace/agent"
  },
  {
    branchName: "codex/locked",
    commonGitDir: "/workspace/source/.git",
    current: false,
    headSha: "3".repeat(40),
    id: "candidate-3",
    locked: true,
    path: "/workspace/locked"
  }
];

function createDependencies() {
  return {
    findRepository: vi.fn(
      async (worktreePath: string): Promise<{ readonly root: string } | null> => ({
        root: worktreePath
      })
    ),
    listWorktrees: vi.fn(async (): Promise<readonly GitWorktreeCandidate[]> => worktrees),
    onChanged: vi.fn(),
    pathExists: vi.fn(() => true),
    resetLabel: vi.fn(),
    setLabel: vi.fn(),
    worktreeInfo: vi.fn(async (worktreePath: string) => ({
      commonGitDir: "/workspace/source/.git",
      root: worktreePath
    }))
  } satisfies WorktreeLabelServiceDependencies;
}
