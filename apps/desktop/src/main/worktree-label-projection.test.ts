import { describe, expect, it, vi } from "vitest";

import { worktreeOpaqueId } from "@difftray/git";
import type { WorktreeLabelRecord } from "@difftray/storage";

import type { RecentProjectView } from "./view-models.js";
import {
  projectViewsWithLabels,
  projectViewWithLabel,
  type WorktreeLabelProjectionDependencies
} from "./worktree-label-projection.js";

const commonGitDir = "/workspace/source/.git";

function project(projectPath: string): RecentProjectView {
  return {
    id: projectPath,
    name: projectPath.split("/").at(-1) ?? projectPath,
    path: projectPath,
    repositoryName: "Source",
    worktreeName: "feature/branch"
  };
}

function labelRecord(
  worktreePath: string,
  label: string,
  gitDir = commonGitDir
): WorktreeLabelRecord {
  return {
    commonGitDir: gitDir,
    label,
    updatedAt: "2026-10-17T10:00:00.000Z",
    worktreeId: worktreeOpaqueId(gitDir, worktreePath),
    worktreePath
  };
}

function createDependencies(records: WorktreeLabelRecord[]) {
  const rows = new Map(records.map((record) => [record.worktreeId, record]));
  const dependencies = {
    getLabel: vi.fn((worktreeId: string) => rows.get(worktreeId) ?? null),
    listLabels: vi.fn((paths: readonly string[]) =>
      [...rows.values()].filter((row) => paths.includes(row.worktreePath))
    ),
    worktreeInfo: vi.fn(async (worktreePath: string) => ({
      commonGitDir,
      root: worktreePath
    }))
  } satisfies WorktreeLabelProjectionDependencies;

  return { dependencies, rows };
}

describe("projectViewsWithLabels", () => {
  it("makes no Git calls when no requested path has a label", async () => {
    const { dependencies } = createDependencies([
      labelRecord("/workspace/unrelated", "Unrelated")
    ]);
    const views = [project("/workspace/source")];

    await expect(projectViewsWithLabels(views, dependencies)).resolves.toBe(views);
    expect(dependencies.listLabels).toHaveBeenCalledWith(["/workspace/source"]);
    expect(dependencies.worktreeInfo).not.toHaveBeenCalled();
  });

  it("overlays verified labels and preserves generated names", async () => {
    const { dependencies } = createDependencies([
      labelRecord("/workspace/agent", "Checkout rework")
    ]);

    await expect(
      projectViewsWithLabels(
        [project("/workspace/source"), project("/workspace/agent")],
        dependencies
      )
    ).resolves.toEqual([
      project("/workspace/source"),
      { ...project("/workspace/agent"), customLabel: "Checkout rework" }
    ]);
    expect(dependencies.worktreeInfo).toHaveBeenCalledTimes(1);
    expect(dependencies.worktreeInfo).toHaveBeenCalledWith("/workspace/agent");
  });

  it("labels views from a fresh dependency set after a cold start", async () => {
    const records = [labelRecord("/workspace/agent", "Persisted")];
    const first = createDependencies(records);
    const restarted = createDependencies(records);

    const before = await projectViewWithLabel(
      project("/workspace/agent"),
      first.dependencies
    );
    const after = await projectViewWithLabel(
      project("/workspace/agent"),
      restarted.dependencies
    );

    expect(before.customLabel).toBe("Persisted");
    expect(after).toEqual(before);
  });

  it("bounds concurrent identity verification", async () => {
    const paths = Array.from({ length: 10 }, (_, index) => `/workspace/wt-${index}`);
    const { dependencies } = createDependencies(
      paths.map((worktreePath, index) => labelRecord(worktreePath, `Label ${index}`))
    );
    let active = 0;
    let peak = 0;
    dependencies.worktreeInfo.mockImplementation(async (worktreePath: string) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return { commonGitDir, root: worktreePath };
    });

    const views = await projectViewsWithLabels(paths.map(project), dependencies);

    expect(peak).toBe(4);
    expect(views.map((view) => view.customLabel)).toEqual(
      paths.map((_, index) => `Label ${index}`)
    );
  });

  it("omits a label whose common Git directory no longer matches", async () => {
    const { dependencies } = createDependencies([
      labelRecord("/workspace/agent", "Old repository", "/workspace/old/.git")
    ]);

    await expect(
      projectViewsWithLabels([project("/workspace/agent")], dependencies)
    ).resolves.toEqual([project("/workspace/agent")]);
  });

  it("omits labels for missing worktrees without failing the list", async () => {
    const { dependencies } = createDependencies([
      labelRecord("/workspace/missing", "Missing"),
      labelRecord("/workspace/agent", "Present")
    ]);
    dependencies.worktreeInfo.mockImplementation(async (worktreePath: string) => {
      if (worktreePath === "/workspace/missing") throw new Error("not a git repository");
      return { commonGitDir, root: worktreePath };
    });

    await expect(
      projectViewsWithLabels(
        [project("/workspace/missing"), project("/workspace/agent")],
        dependencies
      )
    ).resolves.toEqual([
      project("/workspace/missing"),
      { ...project("/workspace/agent"), customLabel: "Present" }
    ]);
  });

  it("omits a label when the path now resolves to a different root", async () => {
    const { dependencies } = createDependencies([
      labelRecord("/workspace/agent", "Moved")
    ]);
    dependencies.worktreeInfo.mockResolvedValue({ commonGitDir, root: "/workspace" });

    await expect(
      projectViewsWithLabels([project("/workspace/agent")], dependencies)
    ).resolves.toEqual([project("/workspace/agent")]);
  });

  it("reflects a set or reset that lands during pending verification", async () => {
    const { dependencies, rows } = createDependencies([
      labelRecord("/workspace/agent", "Before"),
      labelRecord("/workspace/reset", "Will reset")
    ]);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    dependencies.worktreeInfo.mockImplementation(async (worktreePath: string) => {
      await gate;
      return { commonGitDir, root: worktreePath };
    });

    const pending = projectViewsWithLabels(
      [project("/workspace/agent"), project("/workspace/reset")],
      dependencies
    );
    const updated = labelRecord("/workspace/agent", "After");
    rows.set(updated.worktreeId, updated);
    rows.delete(labelRecord("/workspace/reset", "").worktreeId);
    release();

    await expect(pending).resolves.toEqual([
      { ...project("/workspace/agent"), customLabel: "After" },
      project("/workspace/reset")
    ]);
  });
});
