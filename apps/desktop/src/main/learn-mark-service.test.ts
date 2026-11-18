import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { openStorage, type DifftrayStorage } from "@difftray/storage";
import { afterEach, describe, expect, it } from "vitest";

import { AgentProtocolError } from "../shared/agent-protocol.js";
import { createLearnMarkService } from "./learn-mark-service.js";

const roots: string[] = [];
const stores: DifftrayStorage[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function tempDir(): string {
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(), "difftray-mark-")));
  roots.push(directory);
  return directory;
}

function initRepo(): string {
  const directory = tempDir();
  git(directory, "init", "-b", "main");
  git(directory, "config", "user.email", "test@example.com");
  git(directory, "config", "user.name", "Test");
  writeFileSync(path.join(directory, "a.txt"), "a\n");
  git(directory, "add", ".");
  git(directory, "commit", "-m", "initial");
  return directory;
}

function fixture(nowIso = "2026-11-18T12:00:00.000Z") {
  const storage = openStorage(path.join(tempDir(), "difftray.sqlite"));
  stores.push(storage);
  const repo = initRepo();
  storage.upsertProject({ id: repo, name: path.basename(repo), path: repo });
  const commonGitDir = realpathSync(path.join(repo, ".git"));
  const service = createLearnMarkService({ now: () => Date.parse(nowIso), storage });
  return { commonGitDir, repo, service, storage };
}

async function rejection(promise: Promise<unknown>): Promise<AgentProtocolError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AgentProtocolError);
    return error as AgentProtocolError;
  }
  throw new Error("expected a rejection");
}

describe("createLearnMarkService", () => {
  it("moves the repository cursor forward", async () => {
    const { commonGitDir, repo, service, storage } = fixture();

    await expect(
      service.mark({ cursor: "2026-11-18T10:00:00.000Z", repoPath: repo })
    ).resolves.toEqual({ cursor: "2026-11-18T10:00:00.000Z", moved: true });
    expect(storage.getLearnCursor(commonGitDir)).toBe("2026-11-18T10:00:00.000Z");
    expect(storage.getProjectRepositoryKey(repo)?.commonGitDir).toBe(commonGitDir);
  });

  it("keeps a later cursor and reports it unchanged", async () => {
    const { commonGitDir, repo, service, storage } = fixture();
    await service.mark({ cursor: "2026-11-18T11:00:00.000Z", repoPath: repo });

    await expect(
      service.mark({ cursor: "2026-11-18T10:00:00.000Z", repoPath: repo })
    ).resolves.toEqual({ cursor: "2026-11-18T11:00:00.000Z", moved: false });
    expect(storage.getLearnCursor(commonGitDir)).toBe("2026-11-18T11:00:00.000Z");
  });

  it("shares the cursor across worktrees of one repository", async () => {
    const { commonGitDir, repo, service, storage } = fixture();
    const worktree = `${repo}-feature`;
    roots.push(worktree);
    git(repo, "worktree", "add", "-b", "feature", worktree);

    await service.mark({ cursor: "2026-11-18T10:00:00.000Z", repoPath: worktree });
    expect(storage.getLearnCursor(commonGitDir)).toBe("2026-11-18T10:00:00.000Z");
  });

  it("rejects a cursor later than the current time", async () => {
    const { commonGitDir, repo, service, storage } = fixture();

    const error = await rejection(
      service.mark({ cursor: "2026-11-18T12:00:00.001Z", repoPath: repo })
    );
    expect(error.code).toBe("invalid_request");
    expect(storage.getLearnCursor(commonGitDir)).toBeNull();
  });

  it("returns repository_missing for a path that is not a Git worktree", async () => {
    const { service } = fixture();

    const error = await rejection(
      service.mark({ cursor: "2026-11-18T10:00:00.000Z", repoPath: tempDir() })
    );
    expect(error.code).toBe("repository_missing");
  });

  it("forgets the old cursor when the path now holds another repository", async () => {
    const { commonGitDir, repo, service, storage } = fixture();
    await service.mark({ cursor: "2026-11-18T11:00:00.000Z", repoPath: repo });

    rmSync(path.join(repo, ".git"), { force: true, recursive: true });
    git(repo, "init", "-b", "main");
    git(repo, "config", "user.email", "test@example.com");
    git(repo, "config", "user.name", "Test");
    git(repo, "add", ".");
    git(repo, "commit", "-m", "replacement");

    await expect(
      service.mark({ cursor: "2026-11-18T10:00:00.000Z", repoPath: repo })
    ).resolves.toEqual({ cursor: "2026-11-18T10:00:00.000Z", moved: true });
    expect(storage.getLearnCursor(commonGitDir)).toBe("2026-11-18T10:00:00.000Z");
  });
});
