import { describe, expect, it, vi } from "vitest";

import { buildCommands, type BuildCommandsInput } from "./command-builders.js";

describe("buildCommands", () => {
  it("always includes the open repository action", () => {
    const input = buildCommandsInput();

    const commands = buildCommands(input);

    expect(commands.map((command) => command.id)).toEqual(["action-open"]);
    commands[0]?.run();
    expect(input.openProject).toHaveBeenCalledOnce();
  });

  it("adds workspace actions and wires command callbacks", () => {
    const input = buildCommandsInput({
      activeFile: reviewFile({ path: "src/App.tsx", reviewed: false }),
      diffMode: "split",
      files: [reviewFile({ path: "src/App.tsx" })],
      workspace: reviewWorkspace()
    });

    const commands = buildCommands(input);

    expect(commands.map((command) => [command.id, command.label])).toEqual([
      ["action-open", "Open Repository"],
      ["action-refresh", "Refresh project"],
      ["action-review", "Mark reviewed"],
      ["action-file-list", "Toggle file list"],
      ["action-diff-mode", "Switch to unified diff"],
      ["action-settings", "Settings"],
      ["file-src/App.tsx", "App.tsx"]
    ]);

    commands.find((command) => command.id === "action-refresh")?.run();
    commands.find((command) => command.id === "action-review")?.run();
    commands.find((command) => command.id === "action-file-list")?.run();
    commands.find((command) => command.id === "action-settings")?.run();
    commands.find((command) => command.id === "action-diff-mode")?.run();
    commands.find((command) => command.id === "file-src/App.tsx")?.run();

    expect(input.refresh).toHaveBeenCalledOnce();
    expect(input.toggleReview).toHaveBeenCalledOnce();
    expect(input.toggleFileList).toHaveBeenCalledOnce();
    expect(input.openSettings).toHaveBeenCalledOnce();
    expect(input.setDiffMode).toHaveBeenCalledWith("unified");
    expect(input.selectFile).toHaveBeenCalledWith("src/App.tsx");
    expect(input.closePalette).toHaveBeenCalledOnce();
  });

  it("uses unmark copy for reviewed files and toggles back to split mode", () => {
    const input = buildCommandsInput({
      activeFile: reviewFile({ reviewed: true }),
      diffMode: "unified",
      workspace: reviewWorkspace()
    });

    const commands = buildCommands(input);

    expect(commands.find((command) => command.id === "action-review")).toMatchObject({
      label: "Unmark reviewed"
    });

    commands.find((command) => command.id === "action-diff-mode")?.run();

    expect(input.setDiffMode).toHaveBeenCalledWith("split");
  });

  it("adds recent project commands that close the palette before loading", () => {
    const input = buildCommandsInput({
      projects: [
        {
          id: "project-1",
          name: "Difftray",
          path: "/Users/mg/Workspace/difftray"
        }
      ]
    });

    const commands = buildCommands(input);
    const projectCommand = commands.find((command) => command.id === "project-project-1");

    expect(projectCommand).toMatchObject({
      kind: "project",
      label: "Difftray",
      sub: "/Users/mg/Workspace/difftray"
    });

    projectCommand?.run();

    expect(input.closePalette).toHaveBeenCalledOnce();
    expect(input.loadProject).toHaveBeenCalledWith("project-1");
  });
});

function buildCommandsInput(input: Partial<BuildCommandsInput> = {}): BuildCommandsInput {
  return {
    activeFile: undefined,
    closePalette: vi.fn(),
    diffMode: "split",
    files: [],
    loadProject: vi.fn(),
    openProject: vi.fn(),
    openSettings: vi.fn(),
    projects: [],
    refresh: vi.fn(),
    selectFile: vi.fn(),
    setDiffMode: vi.fn(),
    toggleFileList: vi.fn(),
    toggleReview: vi.fn(),
    workspace: undefined,
    ...input
  };
}

function reviewFile(input: Partial<ReviewFileView> = {}): ReviewFileView {
  return {
    additions: 1,
    deletions: 0,
    diffHash: "hash-a",
    diffLoaded: true,
    generated: false,
    invalidated: false,
    path: "src/example.ts",
    reviewable: true,
    reviewed: false,
    status: "modified",
    visible: true,
    ...input
  };
}

function reviewWorkspace(): ReviewWorkspaceView {
  return {
    comments: [],
    files: [],
    progress: {
      reviewedVisibleFiles: 0,
      totalVisibleReviewableFiles: 1
    },
    project: {
      id: "project-1",
      name: "Difftray",
      path: "/Users/mg/Workspace/difftray"
    },
    reviewTarget: {
      headSha: "1111111111111111111111111111111111111111",
      id: "target-1",
      kind: "working_tree"
    }
  };
}
