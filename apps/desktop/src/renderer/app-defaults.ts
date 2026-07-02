import type { WorkspaceLoadStatus } from "./workspace-load-status.js";

export const defaultAppSettings: AppSettingsView = {
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
};

export const defaultProjectSettings: ProjectSettingsView = {
  fileListCollapsed: false,
  fileListWidth: 340,
  projectId: ""
};

export const defaultWorkspaceLoadStatus: WorkspaceLoadStatus = {
  detail: "Preparing local diffs",
  title: "Loading repository"
};

export const delayedCommentSaveIndicatorMs = 450;
export const delayedFileDiffLoaderMs = 500;
