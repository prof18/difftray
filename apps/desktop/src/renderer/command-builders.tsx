import {
  Check,
  Code2,
  FileCode2,
  Folder,
  FolderOpen,
  PanelLeftClose,
  RefreshCw,
  Settings
} from "lucide-react";

import type { CommandItem } from "./command-palette.js";
import { reviewState, splitPath, type DiffMode } from "./review-view-model.js";

export type BuildCommandsInput = {
  readonly activeFile: ReviewFileView | undefined;
  readonly closePalette: () => void;
  readonly diffMode: DiffMode;
  readonly files: readonly ReviewFileView[];
  readonly loadProject: (projectId: string) => Promise<void>;
  readonly openProject: () => void;
  readonly openSettings: () => void;
  readonly projects: readonly RecentProjectView[];
  readonly refresh: () => void;
  readonly selectFile: (path: string) => void;
  readonly setDiffMode: (mode: DiffMode) => void;
  readonly toggleFileList: () => void;
  readonly toggleReview: () => void;
  readonly workspace: ReviewWorkspaceView | undefined;
};

export function buildCommands({
  activeFile,
  closePalette,
  diffMode,
  files,
  loadProject,
  openProject,
  openSettings,
  projects,
  refresh,
  selectFile,
  setDiffMode,
  toggleFileList,
  toggleReview,
  workspace
}: BuildCommandsInput): readonly CommandItem[] {
  const items: CommandItem[] = [
    {
      icon: <FolderOpen size={14} strokeWidth={1.4} aria-hidden />,
      id: "action-open",
      kind: "action",
      label: "Open Repository",
      run: openProject,
      shortcut: "⌘O",
      sub: "Choose a local Git repository"
    }
  ];

  if (workspace) {
    items.push(
      {
        icon: <RefreshCw size={14} strokeWidth={1.4} aria-hidden />,
        id: "action-refresh",
        kind: "action",
        label: "Refresh project",
        run: refresh,
        sub: workspace.project.name
      },
      {
        icon: <Check size={14} strokeWidth={1.4} aria-hidden />,
        id: "action-review",
        kind: "action",
        label: activeFile?.reviewed ? "Unmark reviewed" : "Mark reviewed",
        run: toggleReview,
        shortcut: "R",
        sub: activeFile?.path ?? "No file selected"
      },
      {
        icon: <PanelLeftClose size={14} strokeWidth={1.4} aria-hidden />,
        id: "action-file-list",
        kind: "action",
        label: "Toggle file list",
        run: toggleFileList,
        shortcut: "⌘1",
        sub: "Collapse or expand the changed file list"
      },
      {
        icon: <Code2 size={14} strokeWidth={1.4} aria-hidden />,
        id: "action-diff-mode",
        kind: "action",
        label: diffMode === "split" ? "Switch to unified diff" : "Switch to split diff",
        run: () => {
          setDiffMode(diffMode === "split" ? "unified" : "split");
        },
        sub: "Diff display mode"
      },
      {
        icon: <Settings size={14} strokeWidth={1.4} aria-hidden />,
        id: "action-settings",
        kind: "action",
        label: "Settings",
        run: openSettings,
        sub: "Review preferences"
      }
    );
  }

  for (const project of projects) {
    items.push({
      icon: <Folder size={14} strokeWidth={1.4} aria-hidden />,
      id: `project-${project.id}`,
      kind: "project",
      label: project.name,
      run: () => {
        closePalette();
        void loadProject(project.id);
      },
      sub: project.path
    });
  }

  for (const file of files) {
    items.push({
      hint: reviewState(file),
      icon: <FileCode2 size={14} strokeWidth={1.4} aria-hidden />,
      id: `file-${file.path}`,
      kind: "file",
      label: splitPath(file.path).filename,
      run: () => {
        selectFile(file.path);
        closePalette();
      },
      sub: file.path
    });
  }

  return items;
}
