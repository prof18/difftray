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

class FailingWatcher implements ProjectWatcher {
  closeCount = 0;
  failClose = true;

  async close(): Promise<void> {
    this.closeCount += 1;
    if (this.failClose) {
      throw new Error("watcher close failed");
    }
  }
}

class DelayedWatcher implements ProjectWatcher {
  closeCount = 0;
  private resolveClose: (() => void) | undefined;
  private resolveCloseStarted: (() => void) | undefined;
  readonly closeStarted = new Promise<void>((resolve) => {
    this.resolveCloseStarted = resolve;
  });
  private readonly closeFinished = new Promise<void>((resolve) => {
    this.resolveClose = resolve;
  });

  async close(): Promise<void> {
    this.closeCount += 1;
    this.resolveCloseStarted?.();
    await this.closeFinished;
  }

  finishClose(): void {
    this.resolveClose?.();
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

  it("serializes replacement startup behind a delayed watcher close", async () => {
    const firstWatcher = new DelayedWatcher();
    const secondWatcher = new FakeWatcher();
    let createCount = 0;
    const service = new ProjectWatchService({
      createWatcher: async () => (createCount++ === 0 ? firstWatcher : secondWatcher),
      emitProjectChange: vi.fn(),
      resolveWatchPaths: async (watchedProject) => ({
        gitMetadataContainerPaths: [path.join(watchedProject.path, ".git")],
        gitMetadataPaths: [path.join(watchedProject.path, ".git", "HEAD")],
        worktreeRoot: watchedProject.path
      })
    });

    await service.watchProject(project("one"));
    const replacement = service.watchProject({
      id: "one",
      path: repoPath("replacement")
    });
    await firstWatcher.closeStarted;
    expect(createCount).toBe(1);

    firstWatcher.finishClose();
    await replacement;
    expect(createCount).toBe(2);
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

  it("releases lifecycle bookkeeping after closed projects churn", async () => {
    const { created, service } = serviceFixture({ debounceMs: 20 });

    for (const projectId of ["one", "two", "three"]) {
      await service.watchProject(project(projectId));
      created.at(-1)?.input.onEvent({
        kind: "change",
        path: repoPath(projectId, "changed.ts")
      });
      await vi.advanceTimersByTimeAsync(20);
      await service.stopProject(projectId);
    }

    expect(projectWatchBookkeeping(service)).toEqual({
      lifecycleQueues: 0,
      sequences: 0,
      stopRequestSerials: 0,
      watcherGenerations: 0
    });
  });

  it("retains a failed watcher close so a later stop can retry it", async () => {
    const watcher = new FailingWatcher();
    const service = new ProjectWatchService({
      createWatcher: async () => watcher,
      emitProjectChange: vi.fn(),
      resolveWatchPaths: async (watchedProject) => ({
        gitMetadataContainerPaths: [path.join(watchedProject.path, ".git")],
        gitMetadataPaths: [path.join(watchedProject.path, ".git", "HEAD")],
        worktreeRoot: watchedProject.path
      })
    });

    await service.watchProject(project("one"));
    await expect(service.stopProject("one")).rejects.toThrow("watcher close failed");
    expect(watcher.closeCount).toBe(2);

    watcher.failClose = false;
    await expect(service.stopProject("one")).resolves.toBeUndefined();
    expect(watcher.closeCount).toBe(3);
  });

  it("cleans up an active watcher when a stale sync reaches a closed project", async () => {
    let projectIsOpen = true;
    const { created, service } = serviceFixture({
      isProjectOpen: () => projectIsOpen
    });

    await service.watchProject(project("one"));
    projectIsOpen = false;

    await service.syncProjects([project("one")]);

    expect(created[0]?.watcher.closeCount).toBe(1);
  });

  it("surfaces cleanup failure when a stale sync reaches a closed project", async () => {
    let projectIsOpen = true;
    const watcher = new FailingWatcher();
    const service = new ProjectWatchService({
      createWatcher: async () => watcher,
      emitProjectChange: vi.fn(),
      isProjectOpen: () => projectIsOpen,
      resolveWatchPaths: async (watchedProject) => ({
        gitMetadataContainerPaths: [path.join(watchedProject.path, ".git")],
        gitMetadataPaths: [path.join(watchedProject.path, ".git", "HEAD")],
        worktreeRoot: watchedProject.path
      })
    });

    await service.watchProject(project("one"));
    projectIsOpen = false;

    await expect(service.syncProjects([project("one")])).rejects.toThrow(
      "watcher close failed"
    );
    expect(watcher.closeCount).toBe(2);
  });

  it("retries retained watcher cleanup before installing a reopened project", async () => {
    const watcher = new FailingWatcher();
    const replacement = new FakeWatcher();
    let createCount = 0;
    const created: ProjectWatcher[] = [];
    const service = new ProjectWatchService({
      createWatcher: async () => {
        const next = createCount++ === 0 ? watcher : replacement;
        created.push(next);
        return next;
      },
      emitProjectChange: vi.fn(),
      resolveWatchPaths: async (watchedProject) => ({
        gitMetadataContainerPaths: [path.join(watchedProject.path, ".git")],
        gitMetadataPaths: [path.join(watchedProject.path, ".git", "HEAD")],
        worktreeRoot: watchedProject.path
      })
    });

    await service.watchProject(project("one"));
    await expect(service.stopProject("one")).rejects.toThrow("watcher close failed");
    watcher.failClose = false;

    await service.watchProject({ id: "one", path: repoPath("replacement") });

    expect(watcher.closeCount).toBe(3);
    expect(created).toHaveLength(2);
  });

  it("does not install a replacement while retained watcher cleanup still fails", async () => {
    const watcher = new FailingWatcher();
    let createCount = 0;
    const service = new ProjectWatchService({
      createWatcher: async () => {
        createCount += 1;
        return watcher;
      },
      emitProjectChange: vi.fn(),
      resolveWatchPaths: async (watchedProject) => ({
        gitMetadataContainerPaths: [path.join(watchedProject.path, ".git")],
        gitMetadataPaths: [path.join(watchedProject.path, ".git", "HEAD")],
        worktreeRoot: watchedProject.path
      })
    });

    await service.watchProject(project("one"));
    await expect(service.stopProject("one")).rejects.toThrow("watcher close failed");

    await expect(
      service.watchProject({ id: "one", path: repoPath("replacement") })
    ).rejects.toThrow("watcher close failed");

    expect(createCount).toBe(1);
    expect(watcher.closeCount).toBe(3);
  });

  it("does not install a watcher whose startup was invalidated by stopProject", async () => {
    let resolveWatchPaths:
      | ((paths: {
          readonly gitMetadataContainerPaths: readonly string[];
          readonly gitMetadataPaths: readonly string[];
          readonly worktreeRoot: string;
        }) => void)
      | undefined;
    const created: FakeWatcher[] = [];
    const service = new ProjectWatchService({
      createWatcher: async () => {
        const watcher = new FakeWatcher();
        created.push(watcher);
        return watcher;
      },
      emitProjectChange: vi.fn(),
      resolveWatchPaths: () =>
        new Promise((resolve) => {
          resolveWatchPaths = resolve;
        })
    });

    const watch = service.watchProject(project("one"));
    await Promise.resolve();
    await service.stopProject("one");
    resolveWatchPaths?.({
      gitMetadataContainerPaths: [repoPath("one", ".git")],
      gitMetadataPaths: [repoPath("one", ".git", "HEAD")],
      worktreeRoot: repoPath("one")
    });
    await watch;

    expect(created).toHaveLength(0);
  });

  it("waits for an in-flight startup before completing shutdown", async () => {
    let resolveCreateWatcher: ((watcher: ProjectWatcher) => void) | undefined;
    const watcher = new FakeWatcher();
    const service = new ProjectWatchService({
      createWatcher: () =>
        new Promise((resolve) => {
          resolveCreateWatcher = resolve;
        }),
      emitProjectChange: vi.fn(),
      resolveWatchPaths: async (watchedProject) => ({
        gitMetadataContainerPaths: [path.join(watchedProject.path, ".git")],
        gitMetadataPaths: [path.join(watchedProject.path, ".git", "HEAD")],
        worktreeRoot: watchedProject.path
      })
    });

    const watch = service.watchProject(project("one"));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const shutdown = service.close();
    let shutdownFinished = false;
    void shutdown.then(() => {
      shutdownFinished = true;
    });

    await Promise.resolve();
    expect(shutdownFinished).toBe(false);
    resolveCreateWatcher?.(watcher);
    await Promise.all([watch, shutdown]);
    expect(shutdownFinished).toBe(true);
    expect(watcher.closeCount).toBe(1);
  });

  it("retains a watcher when canceled startup close fails so a later stop can retry it", async () => {
    let resolveCreateWatcher: ((watcher: ProjectWatcher) => void) | undefined;
    const watcher = new FailingWatcher();
    const service = new ProjectWatchService({
      createWatcher: () =>
        new Promise((resolve) => {
          resolveCreateWatcher = resolve;
        }),
      emitProjectChange: vi.fn(),
      resolveWatchPaths: async (watchedProject) => ({
        gitMetadataContainerPaths: [path.join(watchedProject.path, ".git")],
        gitMetadataPaths: [path.join(watchedProject.path, ".git", "HEAD")],
        worktreeRoot: watchedProject.path
      })
    });

    const watch = service.watchProject(project("one"));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const stop = service.stopProject("one");
    resolveCreateWatcher?.(watcher);
    await expect(stop).rejects.toThrow("watcher close failed");
    await watch;

    expect(watcher.closeCount).toBe(2);
    watcher.failClose = false;
    await service.stopProject("one");
    expect(watcher.closeCount).toBe(3);
  });

  it("ignores events from a retained old watcher after the project reopens", async () => {
    const firstWatcher = new FailingWatcher();
    const secondWatcher = new FakeWatcher();
    let createCount = 0;
    const createdInputs: ProjectWatcherInput[] = [];
    const { changes, service } = (() => {
      const changes: ProjectWatchChangeEvent[] = [];
      const service = new ProjectWatchService({
        createWatcher: async (input) => {
          createCount += 1;
          createdInputs.push(input);
          return createCount === 1 ? firstWatcher : secondWatcher;
        },
        debounceMs: 20,
        emitProjectChange: (change) => changes.push(change),
        resolveWatchPaths: async (watchedProject) => ({
          gitMetadataContainerPaths: [path.join(watchedProject.path, ".git")],
          gitMetadataPaths: [path.join(watchedProject.path, ".git", "HEAD")],
          worktreeRoot: watchedProject.path
        })
      });

      return { changes, service };
    })();

    await service.watchProject(project("one"));
    await expect(
      service.watchProject({ id: "one", path: repoPath("replacement") })
    ).rejects.toThrow("watcher close failed");

    firstWatcher.failClose = false;
    await service.watchProject({ id: "one", path: repoPath("replacement") });

    createdInputs[0]?.onEvent({
      kind: "change",
      path: repoPath("one", "stale.ts")
    });
    await vi.advanceTimersByTimeAsync(20);
    expect(changes).toEqual([]);

    // The replacement watcher is the only one allowed to produce a change.
    createdInputs[1]?.onEvent({
      kind: "change",
      path: repoPath("replacement", "current.ts")
    });
    await vi.advanceTimersByTimeAsync(20);
    expect(changes).toHaveLength(1);
  });

  it("does not emit startup errors from resolution canceled by stopProject", async () => {
    let rejectWatchPaths: ((error: Error) => void) | undefined;
    const changes: ProjectWatchChangeEvent[] = [];
    const service = new ProjectWatchService({
      createWatcher: async () => new FakeWatcher(),
      emitProjectChange: (change) => changes.push(change),
      resolveWatchPaths: () =>
        new Promise((_resolve, reject) => {
          rejectWatchPaths = reject;
        })
    });

    const watch = service.watchProject(project("one"));
    await Promise.resolve();
    await service.stopProject("one");
    rejectWatchPaths?.(new Error("stale resolver failure"));
    await watch;

    expect(changes).toEqual([]);
  });

  it("does not emit startup errors from watcher creation canceled by stopProject", async () => {
    let rejectCreateWatcher: ((error: Error) => void) | undefined;
    const changes: ProjectWatchChangeEvent[] = [];
    const service = new ProjectWatchService({
      createWatcher: () =>
        new Promise((_resolve, reject) => {
          rejectCreateWatcher = reject;
        }),
      emitProjectChange: (change) => changes.push(change),
      resolveWatchPaths: async (watchedProject) => ({
        gitMetadataContainerPaths: [path.join(watchedProject.path, ".git")],
        gitMetadataPaths: [path.join(watchedProject.path, ".git", "HEAD")],
        worktreeRoot: watchedProject.path
      })
    });

    const watch = service.watchProject(project("one"));
    await Promise.resolve();
    await Promise.resolve();
    await service.stopProject("one");
    rejectCreateWatcher?.(new Error("stale factory failure"));
    await watch;

    expect(changes).toEqual([]);
  });

  it("does not resurrect a watcher when a stale sync arrives after a project closes", async () => {
    let projectIsOpen = true;
    const { created, service } = serviceFixture({
      isProjectOpen: () => projectIsOpen
    });

    await service.watchProject(project("one"));
    projectIsOpen = false;
    await service.stopProject("one");

    await service.syncProjects([project("one")]);

    expect(created).toHaveLength(1);
    expect(created[0]?.watcher.closeCount).toBe(1);
  });

  it("cancels a running sync when the project closes", async () => {
    let projectIsOpen = true;
    let resolveWatchPaths:
      | ((paths: {
          readonly gitMetadataContainerPaths: readonly string[];
          readonly gitMetadataPaths: readonly string[];
          readonly worktreeRoot: string;
        }) => void)
      | undefined;
    const created: FakeWatcher[] = [];
    const service = new ProjectWatchService({
      createWatcher: async () => {
        const watcher = new FakeWatcher();
        created.push(watcher);
        return watcher;
      },
      emitProjectChange: vi.fn(),
      isProjectOpen: () => projectIsOpen,
      resolveWatchPaths: () =>
        new Promise((resolve) => {
          resolveWatchPaths = resolve;
        })
    });

    const sync = service.syncProjects([project("one")]);
    await Promise.resolve();
    await Promise.resolve();
    projectIsOpen = false;
    await service.stopProject("one");
    resolveWatchPaths?.({
      gitMetadataContainerPaths: [repoPath("one", ".git")],
      gitMetadataPaths: [repoPath("one", ".git", "HEAD")],
      worktreeRoot: repoPath("one")
    });
    await sync;

    expect(created).toHaveLength(0);
  });

  it("cancels queued startup when an overlapping sync removes the project", async () => {
    let resolveWatchPaths:
      | ((paths: {
          readonly gitMetadataContainerPaths: readonly string[];
          readonly gitMetadataPaths: readonly string[];
          readonly worktreeRoot: string;
        }) => void)
      | undefined;
    const created: FakeWatcher[] = [];
    const service = new ProjectWatchService({
      createWatcher: async () => {
        const watcher = new FakeWatcher();
        created.push(watcher);
        return watcher;
      },
      emitProjectChange: vi.fn(),
      resolveWatchPaths: () =>
        new Promise((resolve) => {
          resolveWatchPaths = resolve;
        })
    });

    const startup = service.syncProjects([project("one")]);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const stop = service.syncProjects([]);
    resolveWatchPaths?.({
      gitMetadataContainerPaths: [repoPath("one", ".git")],
      gitMetadataPaths: [repoPath("one", ".git", "HEAD")],
      worktreeRoot: repoPath("one")
    });

    await Promise.all([startup, stop]);

    expect(created).toHaveLength(0);
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
  isProjectOpen = () => true,
  maxWaitMs = 100
}: {
  readonly debounceMs?: number;
  readonly isProjectOpen?: (projectId: string) => boolean;
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
    isProjectOpen,
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

function projectWatchBookkeeping(service: ProjectWatchService): {
  readonly lifecycleQueues: number;
  readonly sequences: number;
  readonly stopRequestSerials: number;
  readonly watcherGenerations: number;
} {
  const bookkeeping = service as unknown as {
    readonly lifecycleQueues: ReadonlyMap<string, Promise<void>>;
    readonly sequences: ReadonlyMap<string, number>;
    readonly stopRequestSerials: ReadonlyMap<string, number>;
    readonly watcherGenerations: ReadonlyMap<string, number>;
  };

  return {
    lifecycleQueues: bookkeeping.lifecycleQueues.size,
    sequences: bookkeeping.sequences.size,
    stopRequestSerials: bookkeeping.stopRequestSerials.size,
    watcherGenerations: bookkeeping.watcherGenerations.size
  };
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
