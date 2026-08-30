import {
  Check,
  Code2,
  ExternalLink,
  FileCode2,
  Folder,
  FolderOpen,
  PanelLeftClose,
  RefreshCw,
  Settings,
  Trash2
} from "lucide-react";

import type { CommandItem } from "./command-palette.js";
import { reviewState, splitPath, type DiffMode } from "./review-view-model.js";

export type BuildCommandsInput = {
  readonly activeFile: ReviewFileView | undefined;
  readonly closePalette: () => void;
  readonly diffMode: DiffMode;
  readonly files: readonly ReviewFileView[];
  readonly forgetRepository: () => void;
  readonly loadProject: (projectId: string) => Promise<void>;
  readonly openFileInEditor: (path: string) => void;
  readonly openProject: () => void;
  readonly openSettings: () => void;
  readonly projects: readonly RecentProjectView[];
  readonly refresh: () => void;
  readonly scanRepositoryFolder?: () => void;
  readonly selectFile: (path: string) => void;
  readonly setDiffMode: (mode: DiffMode) => void;
  readonly showFileInFinder: (path: string) => void;
  readonly toggleFileList: () => void;
  readonly toggleReview: () => void;
  readonly workspace: ReviewWorkspaceView | undefined;
};

export function buildCommands({
  activeFile,
  closePalette,
  diffMode,
  files,
  forgetRepository,
  loadProject,
  openFileInEditor,
  openProject,
  openSettings,
  projects,
  refresh,
  scanRepositoryFolder,
  selectFile,
  setDiffMode,
  showFileInFinder,
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

  if (scanRepositoryFolder) {
    items.push({
      icon: <Folder size={14} strokeWidth={1.4} aria-hidden />,
      id: "action-scan-repositories",
      kind: "action",
      label: "Scan a folder for repositories…",
      run: scanRepositoryFolder,
      sub: "Add an approved repository search folder"
    });
  }

  if (workspace) {
    items.push({
      icon: <RefreshCw size={14} strokeWidth={1.4} aria-hidden />,
      id: "action-refresh",
      kind: "action",
      label: "Refresh project",
      run: refresh,
      sub: workspace.project.name
    });

    if (activeFile && activeFile.status !== "deleted") {
      items.push(
        {
          icon: <ExternalLink size={14} strokeWidth={1.4} aria-hidden />,
          id: "action-open-file-in-editor",
          kind: "action",
          label: "Open selected file in Editor",
          run: () => {
            openFileInEditor(activeFile.path);
          },
          sub: activeFile.path
        },
        {
          icon: <FolderOpen size={14} strokeWidth={1.4} aria-hidden />,
          id: "action-show-file-in-finder",
          kind: "action",
          label: "Show selected file in Finder",
          run: () => {
            showFileInFinder(activeFile.path);
          },
          sub: activeFile.path
        }
      );
    }

    items.push(
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
      },
      {
        icon: <Trash2 size={14} strokeWidth={1.4} aria-hidden />,
        id: "action-forget-repository",
        kind: "action",
        label: "Forget repository…",
        run: forgetRepository,
        sub: `Remove ${workspace.project.name} and its saved review state`
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
