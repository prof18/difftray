import { describe, expect, it } from "vitest";

import {
  parseProjectChangedEvent,
  parseProjectLoadProgress,
  parseUpdatePhase
} from "./event-parsers.js";

describe("preload event parsers", () => {
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
});
