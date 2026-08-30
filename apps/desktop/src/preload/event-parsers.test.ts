import { describe, expect, it } from "vitest";

import {
  parseApplicationCommand,
  parseProjectChangedEvent,
  parseProjectLoadProgress,
  parseRepositoryScanProgress,
  parseUpdatePhase
} from "./event-parsers.js";

describe("preload event parsers", () => {
  it("accepts only known application commands", () => {
    expect(parseApplicationCommand("open-settings")).toBe("open-settings");
    expect(parseApplicationCommand("file-show-in-finder")).toBe("file-show-in-finder");
    expect(parseApplicationCommand("repository-worktrees")).toBe("repository-worktrees");
    expect(parseApplicationCommand("delete-everything")).toBeUndefined();
    expect(parseApplicationCommand({ command: "open-settings" })).toBeUndefined();
  });

  it("parses update phases and rejects malformed payloads", () => {
    expect(parseUpdatePhase({ kind: "idle" })).toEqual({ kind: "idle" });
    expect(parseUpdatePhase({ kind: "checking" })).toEqual({ kind: "checking" });
    expect(parseUpdatePhase({ kind: "available", version: "1.2.3" })).toEqual({
      kind: "available",
      version: "1.2.3"
    });
    expect(
      parseUpdatePhase({ kind: "downloading", percent: 42, version: "1.2.3" })
    ).toEqual({
      kind: "downloading",
      percent: 42,
      version: "1.2.3"
    });
    expect(parseUpdatePhase({ kind: "downloaded", version: "1.2.3" })).toEqual({
      kind: "downloaded",
      version: "1.2.3"
    });
    expect(parseUpdatePhase({ kind: "error", message: "failed" })).toEqual({
      kind: "error",
      message: "failed"
    });

    expect(parseUpdatePhase({ kind: "available" })).toBeUndefined();
    expect(
      parseUpdatePhase({ kind: "downloading", percent: "42", version: "1.2.3" })
    ).toBeUndefined();
    expect(parseUpdatePhase({ kind: "unexpected" })).toBeUndefined();
    expect(parseUpdatePhase(null)).toBeUndefined();
  });

  it("parses project change events and drops invalid watcher reasons", () => {
    expect(
      parseProjectChangedEvent({
        errorMessage: "watch failed",
        projectId: "project-1",
        projectPath: "/repo",
        reasons: ["worktree", "git_metadata"],
        sequence: 4
      })
    ).toEqual({
      errorMessage: "watch failed",
      projectId: "project-1",
      projectPath: "/repo",
      reasons: ["worktree", "git_metadata"],
      sequence: 4
    });

    expect(
      parseProjectChangedEvent({
        projectId: "project-1",
        projectPath: "/repo",
        reasons: ["unsupported"],
        sequence: 4
      })
    ).toBeUndefined();
    expect(
      parseProjectChangedEvent({
        projectId: "project-1",
        projectPath: "/repo",
        reasons: ["worktree"],
        sequence: "4"
      })
    ).toBeUndefined();
  });

  it("parses project load progress events and ignores malformed optional fields", () => {
    expect(
      parseProjectLoadProgress({
        loadedFiles: 2,
        message: "Loading files",
        path: "src/index.ts",
        phase: "loading_files",
        projectId: "project-1",
        projectName: "Repo",
        projectPath: "/repo",
        totalFiles: 5
      })
    ).toEqual({
      loadedFiles: 2,
      message: "Loading files",
      path: "src/index.ts",
      phase: "loading_files",
      projectId: "project-1",
      projectName: "Repo",
      projectPath: "/repo",
      totalFiles: 5
    });

    expect(
      parseProjectLoadProgress({
        loadedFiles: "2",
        message: "Loading files",
        path: 42,
        phase: "loading_files",
        projectId: "project-1",
        projectName: "Repo",
        projectPath: "/repo",
        totalFiles: "5"
      })
    ).toEqual({
      message: "Loading files",
      phase: "loading_files",
      projectId: "project-1",
      projectName: "Repo",
      projectPath: "/repo"
    });

    expect(
      parseProjectLoadProgress({
        message: "Loading files",
        phase: "unsupported",
        projectId: "project-1",
        projectName: "Repo",
        projectPath: "/repo"
      })
    ).toBeUndefined();
  });

  it("parses repository scan progress only with valid statuses and safe counters", () => {
    expect(
      parseRepositoryScanProgress({
        rootId: "root-1",
        scannedDirectories: 12,
        skippedDirectories: 3,
        status: "scanning"
      })
    ).toEqual({
      rootId: "root-1",
      scannedDirectories: 12,
      skippedDirectories: 3,
      status: "scanning"
    });
    expect(
      parseRepositoryScanProgress({
        rootId: "root-1",
        scannedDirectories: 0,
        skippedDirectories: 0,
        status: "cancelled"
      })
    ).toEqual({
      rootId: "root-1",
      scannedDirectories: 0,
      skippedDirectories: 0,
      status: "cancelled"
    });

    for (const payload of [
      {
        rootId: "root-1",
        scannedDirectories: -1,
        skippedDirectories: 0,
        status: "complete"
      },
      {
        rootId: "root-1",
        scannedDirectories: Number.MAX_SAFE_INTEGER + 1,
        skippedDirectories: 0,
        status: "complete"
      },
      {
        rootId: "root-1",
        scannedDirectories: 0,
        skippedDirectories: 0.5,
        status: "failed"
      },
      {
        rootId: "root-1",
        scannedDirectories: 0,
        skippedDirectories: 0,
        status: "unknown"
      }
    ]) {
      expect(parseRepositoryScanProgress(payload)).toBeUndefined();
    }
    expect(parseRepositoryScanProgress(null)).toBeUndefined();
  });
});
