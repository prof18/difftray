import { describe, expect, it } from "vitest";

import {
  defaultAppSettings,
  defaultProjectSettings,
  defaultWorkspaceLoadStatus,
  delayedCommentSaveIndicatorMs,
  delayedFileDiffLoaderMs
} from "./app-defaults.js";

describe("app defaults", () => {
  it("keeps the initial review preferences aligned with product defaults", () => {
    expect(defaultAppSettings).toEqual({
      autoCollapseHunksOver: 120,
      companionEnabled: false,
      companionPort: 48620,
      defaultDiffMode: "split",
      editorArgs: "",
      editorArgList: [],
      editorCommand: "",
      editorMode: "system",
      hideWhitespaceOnlyChanges: false,
      notifyOnDrift: true,
      reviewResetTrigger: "diff_content",
      showGeneratedFiles: false,
      themeMode: "system",
      wrapDiffLines: true
    });
  });

  it("keeps initial project and loading defaults stable", () => {
    expect(defaultProjectSettings).toEqual({
      fileListCollapsed: false,
      fileListWidth: 340,
      projectId: ""
    });
    expect(defaultWorkspaceLoadStatus).toEqual({
      detail: "Preparing local diffs",
      title: "Loading repository"
    });
  });

  it("keeps delayed UI indicators short enough to avoid flicker", () => {
    expect(delayedCommentSaveIndicatorMs).toBe(450);
    expect(delayedFileDiffLoaderMs).toBe(500);
  });
});
