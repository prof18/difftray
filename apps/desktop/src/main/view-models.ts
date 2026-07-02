import type {
  FileDiff,
  FileReviewState,
  ReviewCommentReportContext,
  ReviewProgress,
  ReviewTarget
} from "@difftray/core";
import type {
  ProjectReviewSummaryView,
  RecentProjectView,
  ReviewCommentView,
  ReviewFileDiffContentView,
  ReviewFileView,
  ReviewProgressView,
  ReviewWorkspaceView
} from "@difftray/companion-protocol";
import type {
  DiffLoadProgress,
  GitBranchReviewTarget,
  GitCommitReviewTarget,
  GitFileDiffSummary,
  GitLoadedFileDiff,
  GitWorkingTreeReviewTarget
} from "@difftray/git";
import type {
  AppSettingsRecord,
  ProjectRecord,
  ProjectSettingsRecord,
  ReviewCommentRecord,
  ReviewTargetRecord,
  StoredProjectRecord
} from "@difftray/storage";

import { trustedEditorLaunchConfig } from "./security.js";

export type {
  ProjectReviewSummaryView,
  RecentProjectView,
  ReviewCommentView,
  ReviewFileDiffContentView,
  ReviewFileView,
  ReviewProgressView,
  ReviewWorkspaceView
} from "@difftray/companion-protocol";

export type ProjectLoadProgressView = {
  readonly loadedFiles?: number;
  readonly message: string;
  readonly path?: string;
  readonly phase:
    | "loading_files"
    | "preparing_workspace"
    | "resolving_review_state"
    | "resolving_target"
    | "scanning_files";
  readonly projectId: string;
  readonly projectName: string;
  readonly projectPath: string;
  readonly totalFiles?: number;
};

export type ProjectLoadProgressPatch = Omit<
  ProjectLoadProgressView,
  "projectId" | "projectName" | "projectPath"
>;

export type FileReviewStateWithSummary = {
  readonly state: FileReviewState;
  readonly summary: GitFileDiffSummary;
};

export type ProjectSettingsView = {
  readonly fileListCollapsed: boolean;
  readonly fileListWidth: number;
  readonly projectId: string;
};

export type ThemeMode = "dark" | "light" | "system";

export type AppSettingsView = {
  readonly autoCollapseHunksOver: number;
  readonly companionEnabled: boolean;
  readonly companionPort: number;
  readonly defaultDiffMode: "split" | "unified";
  readonly editorArgs: string;
  readonly editorArgList: readonly string[];
  readonly editorCommand: string;
  readonly editorMode: "preset" | "system";
  readonly hideWhitespaceOnlyChanges: boolean;
  readonly notifyOnDrift: boolean;
  readonly reviewResetTrigger: "commit_sha" | "diff_content" | "line_count";
  readonly showGeneratedFiles: boolean;
  readonly themeMode: ThemeMode;
  readonly wrapDiffLines: boolean;
};

export function settingsView(settings: ProjectSettingsRecord): ProjectSettingsView {
  return {
    fileListCollapsed: settings.fileListCollapsed,
    fileListWidth: settings.fileListWidth,
    projectId: settings.projectId
  };
}

export function appSettingsView(settings: AppSettingsRecord): AppSettingsView {
  const editorLaunchConfig = trustedEditorLaunchConfig(settings.editorLaunchConfig);

  return {
    autoCollapseHunksOver: settings.autoCollapseHunksOver,
    companionEnabled: settings.companionEnabled,
    companionPort: settings.companionPort,
    defaultDiffMode: settings.defaultDiffMode,
    editorArgs: editorLaunchConfig?.args.join(" ") ?? "",
    editorArgList: editorLaunchConfig?.args ?? [],
    editorCommand: editorLaunchConfig?.command ?? "",
    editorMode: editorLaunchConfig ? "preset" : "system",
    hideWhitespaceOnlyChanges: settings.hideWhitespaceOnlyChanges,
    notifyOnDrift: settings.notifyOnDrift,
    reviewResetTrigger: settings.reviewResetTrigger,
    showGeneratedFiles: settings.showGeneratedFiles,
    themeMode: settings.themeMode,
    wrapDiffLines: settings.wrapDiffLines
  };
}

export function projectView(
  project: ProjectRecord | StoredProjectRecord,
  reviewSummary?: ProjectReviewSummaryView
): RecentProjectView {
  return {
    ...(project.defaultBaseRef ? { defaultBaseRef: project.defaultBaseRef } : {}),
    ...(project.defaultCommitRef ? { defaultCommitRef: project.defaultCommitRef } : {}),
    ...(project.defaultDiffTargetMode
      ? { defaultDiffTargetMode: project.defaultDiffTargetMode }
      : {}),
    id: project.id,
    ...(project.lastOpenedAt ? { lastOpenedAt: project.lastOpenedAt } : {}),
    name: project.name,
    path: project.path,
    ...(reviewSummary ? { reviewSummary } : {})
  };
}

export function projectProgressFromGit(
  progress: DiffLoadProgress
): ProjectLoadProgressPatch {
  return {
    ...(progress.loadedFiles !== undefined ? { loadedFiles: progress.loadedFiles } : {}),
    message: gitProgressMessage(progress.phase),
    ...(progress.path ? { path: progress.path } : {}),
    phase: progress.phase,
    ...(progress.totalFiles !== undefined ? { totalFiles: progress.totalFiles } : {})
  };
}

function gitProgressMessage(progress: DiffLoadProgress["phase"]): string {
  switch (progress) {
    case "resolving_target":
      return "Resolving review target";
    case "scanning_files":
      return "Scanning changed files";
    case "loading_files":
      return "Loading changed files";
  }
}

export function reviewTargetFromGit(
  target: GitBranchReviewTarget | GitCommitReviewTarget | GitWorkingTreeReviewTarget
): ReviewTarget {
  switch (target.kind) {
    case "branch":
      return {
        baseRefName: target.baseRefName,
        baseSha: target.baseSha,
        ...(target.headRefName ? { headRefName: target.headRefName } : {}),
        headSha: target.headSha,
        kind: "branch",
        mergeBaseSha: target.mergeBaseSha,
        projectId: target.projectId
      };
    case "commit":
      return {
        commitSha: target.commitSha,
        commitShortSha: target.commitShortSha,
        ...(target.commitSubject ? { commitSubject: target.commitSubject } : {}),
        headSha: target.headSha,
        kind: "commit",
        parentSha: target.parentSha,
        projectId: target.projectId
      };
    case "working_tree":
      return {
        ...(target.headRefName ? { headRefName: target.headRefName } : {}),
        headSha: target.headSha,
        kind: "working_tree",
        projectId: target.projectId
      };
  }
}

export function reviewTargetFromRecord(
  record: ReviewTargetRecord
): ReviewTarget | undefined {
  if (!record.headRefSha) {
    return undefined;
  }

  switch (record.mode) {
    case "branch":
      if (!record.baseRefName || !record.baseRefSha || !record.mergeBaseSha) {
        return undefined;
      }

      return {
        baseRefName: record.baseRefName,
        baseSha: record.baseRefSha,
        ...(record.headRefName ? { headRefName: record.headRefName } : {}),
        headSha: record.headRefSha,
        kind: "branch",
        mergeBaseSha: record.mergeBaseSha,
        projectId: record.projectId
      };
    case "commit":
      if (!record.commitSha || !record.commitShortSha || !record.parentSha) {
        return undefined;
      }

      return {
        commitSha: record.commitSha,
        commitShortSha: record.commitShortSha,
        ...(record.commitSubject ? { commitSubject: record.commitSubject } : {}),
        headSha: record.headRefSha,
        kind: "commit",
        parentSha: record.parentSha,
        projectId: record.projectId
      };
    case "working_tree":
      return {
        ...(record.headRefName ? { headRefName: record.headRefName } : {}),
        headSha: record.headRefSha,
        kind: "working_tree",
        projectId: record.projectId
      };
  }
}

export function reviewTargetRecord(id: string, target: ReviewTarget): ReviewTargetRecord {
  switch (target.kind) {
    case "working_tree":
      return {
        headKind: "working_tree",
        ...(target.headRefName ? { headRefName: target.headRefName } : {}),
        headRefSha: target.headSha,
        id,
        mode: "working_tree",
        projectId: target.projectId
      };
    case "branch":
      return {
        baseRefName: target.baseRefName,
        baseRefSha: target.baseSha,
        headKind: "ref",
        ...(target.headRefName ? { headRefName: target.headRefName } : {}),
        headRefSha: target.headSha,
        id,
        mergeBaseSha: target.mergeBaseSha,
        mode: "branch",
        projectId: target.projectId
      };
    case "commit":
      return {
        commitSha: target.commitSha,
        commitShortSha: target.commitShortSha,
        ...(target.commitSubject ? { commitSubject: target.commitSubject } : {}),
        headKind: "ref",
        headRefSha: target.headSha,
        id,
        mode: "commit",
        parentSha: target.parentSha,
        projectId: target.projectId
      };
  }
}

export function reviewFileView(
  file: FileReviewStateWithSummary,
  detailedDiff?: FileDiff
): ReviewFileView {
  const patch = detailedDiff ? patchForDiff(detailedDiff) : undefined;
  const patchSummary = patch ? summarizePatch(patch) : undefined;
  const textContent =
    detailedDiff?.content.kind === "text" ? detailedDiff.content : undefined;

  return {
    additions: patchSummary?.additions ?? file.summary.additions,
    deletions: patchSummary?.deletions ?? file.summary.deletions,
    diffHash: file.state.diffHash,
    diffLoaded: detailedDiff !== undefined,
    generated: file.state.generated,
    invalidated: file.state.invalidated,
    ...(textContent?.newText !== undefined ? { newText: textContent.newText } : {}),
    ...(textContent?.oldText !== undefined ? { oldText: textContent.oldText } : {}),
    path: file.state.path,
    ...(patch !== undefined ? { patch } : {}),
    ...(file.state.diff.oldPath ? { previousPath: file.state.diff.oldPath } : {}),
    reviewable: file.state.reviewable,
    reviewed: file.state.reviewed,
    status: file.state.diff.status,
    visible: file.state.visible
  };
}

export function reviewCommentView(comment: ReviewCommentRecord): ReviewCommentView {
  return {
    body: comment.body,
    createdAt: comment.createdAt,
    diffHash: comment.diffHash,
    id: comment.id,
    lineEnd: comment.lineEnd,
    lineStart: comment.lineStart,
    path: comment.path,
    ...(comment.previousPath ? { previousPath: comment.previousPath } : {}),
    side: comment.side,
    updatedAt: comment.updatedAt
  };
}

export function sameCommentIds(
  comments: readonly Pick<ReviewCommentView, "id">[],
  expectedIds: readonly string[]
): boolean {
  if (comments.length !== expectedIds.length) {
    return false;
  }

  const expectedIdSet = new Set(expectedIds);

  return (
    expectedIdSet.size === expectedIds.length &&
    comments.every((comment) => expectedIdSet.has(comment.id))
  );
}

export function commentReportContext(
  comment: ReviewCommentView,
  diff: ReviewFileDiffContentView | null
): ReviewCommentReportContext | undefined {
  const text = comment.side === "additions" ? diff?.newText : diff?.oldText;

  if (text === undefined) {
    return undefined;
  }

  const lines = textLines(text);

  if (comment.lineStart > lines.length) {
    return undefined;
  }

  const contextRadius = 3;
  const lineStart = Math.max(1, comment.lineStart - contextRadius);
  const lineEnd = Math.min(lines.length, comment.lineEnd + contextRadius);

  return {
    lines: Array.from({ length: lineEnd - lineStart + 1 }, (_, index) => {
      const lineNumber = lineStart + index;

      return {
        kind:
          lineNumber >= comment.lineStart && lineNumber <= comment.lineEnd
            ? "commented"
            : "context",
        lineNumber,
        text: lines[lineNumber - 1] ?? ""
      };
    }),
    side: comment.side
  };
}

function textLines(text: string): readonly string[] {
  const lines = text.split("\n");

  return lines.at(-1) === "" ? lines.slice(0, -1) : lines;
}

export function projectReviewSummaryView(
  files: readonly FileReviewStateWithSummary[],
  progress: ReviewProgress
): ProjectReviewSummaryView {
  return {
    attentionCount: files.filter((file) => file.state.visible && file.state.invalidated)
      .length,
    progress
  };
}

export function reviewProgressView(files: readonly ReviewFileView[]): ReviewProgressView {
  const visibleReviewableFiles = files.filter((file) => file.visible && file.reviewable);

  return {
    reviewedVisibleFiles: visibleReviewableFiles.filter((file) => file.reviewed).length,
    totalVisibleReviewableFiles: visibleReviewableFiles.length
  };
}

export function workspaceWithUpdatedReviewState(
  workspace: ReviewWorkspaceView,
  pathName: string,
  reviewState: Pick<ReviewFileView, "invalidated" | "reviewed">
): ReviewWorkspaceView {
  const files = workspace.files.map((file) =>
    file.path === pathName ? { ...file, ...reviewState } : file
  );
  const progress = reviewProgressView(files);

  return {
    ...workspace,
    files,
    progress,
    project: {
      ...workspace.project,
      reviewSummary: {
        attentionCount: files.filter((file) => file.visible && file.invalidated).length,
        progress
      }
    }
  };
}

export function reviewTargetLabel(
  reviewTarget: Pick<
    ReviewWorkspaceView["reviewTarget"],
    "baseRefName" | "commitShortSha" | "kind"
  >
): string {
  switch (reviewTarget.kind) {
    case "branch":
      return reviewTarget.baseRefName ? `Against ${reviewTarget.baseRefName}` : "Branch";
    case "commit":
      return reviewTarget.commitShortSha
        ? `Commit ${reviewTarget.commitShortSha}`
        : "Commit";
    case "working_tree":
      return "Git changes";
  }
}

export function fileDiffFromGit(file: GitLoadedFileDiff | GitFileDiffSummary): FileDiff {
  return {
    content: file.content,
    ...(file.newMode ? { newMode: file.newMode } : {}),
    newPath: file.newPath,
    ...(file.oldMode ? { oldMode: file.oldMode } : {}),
    ...(file.oldPath ? { oldPath: file.oldPath } : {}),
    status: file.status
  };
}

export function patchForDiff(diff: FileDiff): string {
  switch (diff.content.kind) {
    case "text":
      return diff.content.patch;
    case "binary":
      return [
        `diff --git a/${diff.oldPath ?? diff.newPath} b/${diff.newPath}`,
        `Binary file changed (${String(diff.content.byteSize)} bytes)`,
        `sha256 ${diff.content.digest}`
      ].join("\n");
    case "mode_only":
      return `Mode changed: ${diff.oldMode ?? "unknown"} -> ${diff.newMode ?? "unknown"}`;
    case "submodule":
      return `Submodule changed: ${diff.content.oldCommit ?? "unknown"} -> ${diff.content.newCommit ?? "unknown"}`;
    case "symlink":
      return `Symlink changed: ${diff.content.oldTarget ?? "unknown"} -> ${diff.content.newTarget ?? "unknown"}`;
  }
}

export function summarizePatch(patch: string): {
  readonly additions: number;
  readonly deletions: number;
} {
  const lines = patch.split("\n");

  return lines.reduce(
    (summary, line) => {
      if (line.startsWith("+++") || line.startsWith("---")) {
        return summary;
      }

      if (line.startsWith("+")) {
        return { ...summary, additions: summary.additions + 1 };
      }

      if (line.startsWith("-")) {
        return { ...summary, deletions: summary.deletions + 1 };
      }

      return summary;
    },
    { additions: 0, deletions: 0 }
  );
}
