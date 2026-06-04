import type {
  FileDiff,
  FileReviewState,
  ReviewProgress,
  ReviewCommentSide,
  ReviewTarget
} from "@difftray/core";
import type {
  GitBranchReviewTarget,
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

export type RecentProjectView = {
  readonly defaultBaseRef?: string;
  readonly id: string;
  readonly lastOpenedAt?: string;
  readonly name: string;
  readonly path: string;
  readonly reviewSummary?: ProjectReviewSummaryView;
};

export type ProjectReviewSummaryView = {
  readonly attentionCount: number;
  readonly progress: ReviewProgressView;
};

export type ReviewProgressView = {
  readonly reviewedVisibleFiles: number;
  readonly totalVisibleReviewableFiles: number;
};

export type ReviewFileView = {
  readonly additions: number;
  readonly deletions: number;
  readonly diffHash: string;
  readonly diffLoaded: boolean;
  readonly generated: boolean;
  readonly invalidated: boolean;
  readonly newText?: string;
  readonly oldText?: string;
  readonly path: string;
  readonly patch?: string;
  readonly previousPath?: string;
  readonly reviewable: boolean;
  readonly reviewed: boolean;
  readonly status: FileDiff["status"];
  readonly visible: boolean;
};

export type ReviewWorkspaceView = {
  readonly comments: readonly ReviewCommentView[];
  readonly files: readonly ReviewFileView[];
  readonly project: RecentProjectView;
  readonly progress: ReviewProgressView;
  readonly reviewTarget: {
    readonly baseRefName?: string;
    readonly headRefName?: string;
    readonly headSha: string;
    readonly id: string;
    readonly kind: ReviewTarget["kind"];
  };
};

export type ReviewCommentView = {
  readonly body: string;
  readonly createdAt: string;
  readonly diffHash: string;
  readonly id: string;
  readonly lineEnd: number;
  readonly lineStart: number;
  readonly path: string;
  readonly previousPath?: string;
  readonly side: ReviewCommentSide;
  readonly updatedAt: string;
};

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
    id: project.id,
    ...(project.lastOpenedAt ? { lastOpenedAt: project.lastOpenedAt } : {}),
    name: project.name,
    path: project.path,
    ...(reviewSummary ? { reviewSummary } : {})
  };
}

export function reviewTargetFromGit(
  target: GitBranchReviewTarget | GitWorkingTreeReviewTarget
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

export function reviewTargetLabel(
  reviewTarget: Pick<ReviewWorkspaceView["reviewTarget"], "baseRefName" | "kind">
): string {
  return reviewTarget.kind === "branch" && reviewTarget.baseRefName
    ? `Against ${reviewTarget.baseRefName}`
    : "Git changes";
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
