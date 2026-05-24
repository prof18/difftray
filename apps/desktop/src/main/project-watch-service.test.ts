import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getWorktreeInfo } from "@difftray/git";

import {
  ProjectWatchService,
  createProjectWatchIgnoreMatcher,
  resolveGitProjectWatchPaths,
  type ProjectWatchChangeEvent,
  type ProjectRawWatchEvent,
  type ProjectWatcher,
  type ProjectWatcherInput
} from "./project-watch-service.js";

const execFileAsync = promisify(execFile);
const tempRoots: string[] = [];

afterEach(async () => {
  vi.useRealTimers();

  await Promise.all(
    tempRoots.splice(0).map(async (tempRoot) => {
      await rm(tempRoot, { force: true, recursive: true });
    })
  );
});

class FakeWatcher implements ProjectWatcher {
  closeCount = 0;

  async close(): Promise<void> {
    this.closeCount += 1;
  }
}

type CreatedWatcher = {
  readonly input: ProjectWatcherInput;
  readonly watcher: FakeWatcher;
};

describe("ProjectWatchService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("starts one watcher per project and ignores duplicate starts", async () => {
    const { created, service } = serviceFixture();

    await service.watchProject(project("one"));
    await service.watchProject(project("one"));

    expect(created).toHaveLength(1);
    expect(created[0]?.input.watchPaths).toEqual([
      repoPath("one"),
      repoPath("one", ".git"),
      repoPath("one", ".git", "HEAD"),
      repoPath("one", ".git", "index"),
      repoPath("one", ".git", "refs")
    ]);
  });

  it("restarts a project watcher when the path changes", async () => {
    const { created, service } = serviceFixture();

    await service.watchProject(project("one"));
    await service.watchProject({ id: "one", path: repoPath("renamed") });

    expect(created).toHaveLength(2);
    expect(created[0]?.watcher.closeCount).toBe(1);
    expect(created[1]?.input.projectPath).toBe(repoPath("renamed"));
  });

  it("stops removed projects and closes all watchers on shutdown", async () => {
    const { created, service } = serviceFixture();

    await service.watchProject(project("one"));
    await service.watchProject(project("two"));
    await service.stopProject("one");

    expect(created[0]?.watcher.closeCount).toBe(1);
    expect(created[1]?.watcher.closeCount).toBe(0);

    await service.close();

    expect(created[0]?.watcher.closeCount).toBe(1);
    expect(created[1]?.watcher.closeCount).toBe(1);
  });

  it("debounces raw events and coalesces worktree, Git metadata, and deleted reasons", async () => {
    const { changes, created, service } = serviceFixture({ debounceMs: 40 });
    await service.watchProject(project("one"));

    emit(created[0], { kind: "change", path: repoPath("one", "src", "file.ts") });
    emit(created[0], { kind: "change", path: repoPath("one", ".git", "HEAD") });
    emit(created[0], { kind: "unlink", path: repoPath("one", "src", "old.ts") });

    await vi.advanceTimersByTimeAsync(39);
    expect(changes).toEqual([]);

    await vi.advanceTimersByTimeAsync(1);
    expect(changes).toEqual([
      {
        projectId: "one",
        projectPath: repoPath("one"),
        reasons: ["worktree", "git_metadata", "deleted"],
        sequence: 1
      }
    ]);
  });

  it("uses independent debounce timers and sequences per project", async () => {
    const { changes, created, service } = serviceFixture({ debounceMs: 25 });
    await service.watchProject(project("one"));
    await service.watchProject(project("two"));

    emit(created[0], { kind: "change", path: repoPath("one", "src", "file.ts") });
    emit(created[1], { kind: "change", path: repoPath("two", "src", "file.ts") });
    await vi.advanceTimersByTimeAsync(25);

    emit(created[0], { kind: "change", path: repoPath("one", "src", "file.ts") });
    await vi.advanceTimersByTimeAsync(25);

    expect(changes.map(({ projectId, sequence }) => ({ projectId, sequence }))).toEqual([
      { projectId: "one", sequence: 1 },
      { projectId: "two", sequence: 1 },
      { projectId: "one", sequence: 2 }
    ]);
  });

  it("uses a maximum wait so continuous churn cannot starve notifications", async () => {
    const { changes, created, service } = serviceFixture({
      debounceMs: 50,
      maxWaitMs: 120
    });
    await service.watchProject(project("one"));

    emit(created[0], { kind: "change", path: repoPath("one", "first.ts") });
    await vi.advanceTimersByTimeAsync(40);
    emit(created[0], { kind: "change", path: repoPath("one", "second.ts") });
    await vi.advanceTimersByTimeAsync(40);
    emit(created[0], { kind: "change", path: repoPath("one", "third.ts") });
    await vi.advanceTimersByTimeAsync(39);

    expect(changes).toEqual([]);

    await vi.advanceTimersByTimeAsync(1);

    expect(changes).toHaveLength(1);
    expect(changes[0]?.reasons).toEqual(["worktree"]);
  });

  it("emits bounded watcher errors without throwing", async () => {
    const { changes, created, service } = serviceFixture({ debounceMs: 20 });
    await service.watchProject(project("one"));

    emit(created[0], {
      error: new Error("x".repeat(400)),
      kind: "error"
    });
    await vi.advanceTimersByTimeAsync(20);

    expect(changes).toHaveLength(1);
    expect(changes[0]?.reasons).toEqual(["watcher_error"]);
    expect(changes[0]?.errorMessage).toHaveLength(240);
  });

  it("syncs the active watcher set to the opened project list", async () => {
    const { created, service } = serviceFixture();

    await service.syncProjects([project("one"), project("two")]);
    await service.syncProjects([project("two"), project("three")]);

    expect(created).toHaveLength(3);
    expect(created[0]?.watcher.closeCount).toBe(1);
    expect(created[1]?.watcher.closeCount).toBe(0);
    expect(created[2]?.input.projectId).toBe("three");
  });
});

describe("createProjectWatchIgnoreMatcher", () => {
  it("ignores noisy worktree paths without ignoring selected Git metadata paths", () => {
    const matcher = createProjectWatchIgnoreMatcher({
      gitMetadataContainerPaths: [repoPath("one", ".git")],
      gitMetadataPaths: [
        repoPath("one", ".git", "HEAD"),
        repoPath("one", ".git", "index"),
        repoPath("one", ".git", "refs")
      ],
      projectPath: repoPath("one")
    });

    expect(matcher(repoPath("one", "node_modules", "pkg", "index.js"))).toBe(true);
    expect(matcher(repoPath("one", "dist", "bundle.js"))).toBe(true);
    expect(matcher(repoPath("one", ".next", "cache", "page.js"))).toBe(true);
    expect(matcher(repoPath("one", ".git", "objects", "aa", "bb"))).toBe(true);
    expect(matcher(repoPath("one", ".git"))).toBe(false);
    expect(matcher(repoPath("one", ".git", "HEAD"))).toBe(false);
    expect(matcher(repoPath("one", ".git", "refs", "heads", "main"))).toBe(false);
  });
});

describe("resolveGitProjectWatchPaths", () => {
  it("resolves linked worktree Git metadata from Git instead of assuming .git is a directory", async () => {
    const repo = await createRepo();
    const linkedParent = await createTempRoot();
    const linkedWorktree = path.join(linkedParent, "linked-worktree");
    await git(repo, "worktree", "add", "-b", "feature/watch", linkedWorktree);
    const worktreeInfo = await getWorktreeInfo(linkedWorktree);

    const watchPaths = await resolveGitProjectWatchPaths(linkedWorktree);

    expect(watchPaths.worktreeRoot).toBe(worktreeInfo.root);
    expect(watchPaths.gitMetadataContainerPaths).toEqual(
      expect.arrayContaining([worktreeInfo.gitDir, worktreeInfo.commonGitDir])
    );
    expect(watchPaths.gitMetadataContainerPaths).not.toContain(
      path.join(linkedWorktree, ".git")
    );
    expect(watchPaths.gitMetadataPaths).toEqual(
      expect.arrayContaining([
        path.join(worktreeInfo.gitDir, "HEAD"),
        path.join(worktreeInfo.gitDir, "index"),
        path.join(worktreeInfo.commonGitDir, "refs"),
        path.join(worktreeInfo.commonGitDir, "packed-refs")
      ])
    );
  });
});

function serviceFixture({
  debounceMs = 25,
  maxWaitMs = 100
}: {
  readonly debounceMs?: number;
  readonly maxWaitMs?: number;
} = {}) {
  const created: CreatedWatcher[] = [];
  const changes: ProjectWatchChangeEvent[] = [];
  const service = new ProjectWatchService({
    createWatcher: async (input) => {
      const watcher = new FakeWatcher();
      created.push({ input, watcher });
      return watcher;
    },
    debounceMs,
    emitProjectChange: (change) => {
      changes.push(change);
    },
    maxWaitMs,
    resolveWatchPaths: async (watchedProject) => ({
      gitMetadataContainerPaths: [path.join(watchedProject.path, ".git")],
      gitMetadataPaths: [
        path.join(watchedProject.path, ".git", "HEAD"),
        path.join(watchedProject.path, ".git", "index"),
        path.join(watchedProject.path, ".git", "refs")
      ],
      worktreeRoot: watchedProject.path
    })
  });

  return { changes, created, service };
}

function emit(
  createdWatcher: CreatedWatcher | undefined,
  event: ProjectRawWatchEvent
): void {
  if (!createdWatcher) {
    throw new Error("Expected watcher to have been created");
  }

  createdWatcher.input.onEvent(event);
}

function project(id: string): { readonly id: string; readonly path: string } {
  return {
    id,
    path: repoPath(id)
  };
}

function repoPath(...segments: readonly string[]): string {
  return path.join("/tmp/difftray-watch-tests", ...segments);
}

async function createRepo(): Promise<string> {
  const repo = await createTempRoot();

  await git(repo, "init", "-b", "main");
  await git(repo, "config", "user.email", "difftray@example.test");
  await git(repo, "config", "user.name", "Difftray Test");
  await writeFile(path.join(repo, "tracked.txt"), "tracked\n");
  await git(repo, "add", "tracked.txt");
  await git(repo, "commit", "-m", "initial");

  return repo;
}

async function createTempRoot(): Promise<string> {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "difftray-watch-"));

  tempRoots.push(tempRoot);
  return tempRoot;
}

async function git(repoPath: string, ...args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", repoPath, ...args], {
    encoding: "utf8"
  });

  return stdout.trim();
}
