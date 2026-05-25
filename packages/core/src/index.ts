import { createHash } from "node:crypto";

export {
  commonEditorPresets,
  findEditorPresetByLaunchConfig,
  listInstalledEditorPresets,
  type EditorLaunchConfigPreset,
  type EditorPreset,
  type InstalledEditorPresetInput
} from "./editor-presets.js";

const reviewTargetFingerprintVersion = "difftray-review-target-v1";
const fileDiffFingerprintVersion = "difftray-file-diff-v1";

export type WorkingTreeReviewTarget = {
  readonly headRefName?: string;
  readonly headSha: string;
  readonly kind: "working_tree";
  readonly projectId: string;
};

export type BranchReviewTarget = {
  readonly baseRefName: string;
  readonly baseSha: string;
  readonly headRefName?: string;
  readonly headSha: string;
  readonly kind: "branch";
  readonly mergeBaseSha: string;
  readonly projectId: string;
};

export type ReviewTarget = BranchReviewTarget | WorkingTreeReviewTarget;

export type FileDiffStatus =
  | "added"
  | "deleted"
  | "modified"
  | "mode_changed"
  | "renamed";

export type TextDiffContent = {
  readonly kind: "text";
  readonly newText?: string;
  readonly oldText?: string;
  readonly patch: string;
};

export type BinaryDiffContent = {
  readonly byteSize: number;
  readonly digest: string;
  readonly kind: "binary";
};

export type SymlinkDiffContent = {
  readonly kind: "symlink";
  readonly newTarget?: string;
  readonly oldTarget?: string;
};

export type SubmoduleDiffContent = {
  readonly kind: "submodule";
  readonly newCommit?: string;
  readonly oldCommit?: string;
};

export type ModeOnlyDiffContent = {
  readonly kind: "mode_only";
};

export type FileDiffContent =
  | BinaryDiffContent
  | ModeOnlyDiffContent
  | SubmoduleDiffContent
  | SymlinkDiffContent
  | TextDiffContent;

export type FileDiff = {
  readonly content: FileDiffContent;
  readonly generated?: boolean;
  readonly newMode?: string;
  readonly newPath: string;
  readonly oldMode?: string;
  readonly oldPath?: string;
  readonly status: FileDiffStatus;
};

export type ReviewMark = {
  readonly path: string;
  readonly previousPath?: string;
  readonly reviewedDiffHash: string;
  readonly reviewTargetId: string;
};

export type FileReviewState = {
  readonly diff: FileDiff;
  readonly diffHash: string;
  readonly generated: boolean;
  readonly invalidated: boolean;
  readonly path: string;
  readonly reviewable: boolean;
  readonly reviewed: boolean;
  readonly visible: boolean;
};

export type ReviewProgress = {
  readonly reviewedVisibleFiles: number;
  readonly totalVisibleReviewableFiles: number;
};

export type GeneratedFileInput = {
  readonly path: string;
  readonly sample?: string;
};

export type GeneratedFileDetection = {
  readonly isGenerated: boolean;
  readonly reason?: "header" | "path_segment" | "suffix";
};

export type ResolveReviewStatesInput = {
  readonly diffs: readonly FileDiff[];
  readonly marks: readonly ReviewMark[];
  readonly reviewTarget: ReviewTarget;
  readonly showGeneratedFiles?: boolean;
};

export function createReviewTargetId(target: ReviewTarget): string {
  return `${reviewTargetFingerprintVersion}:${sha256(canonicalReviewTarget(target))}`;
}

export function createDiffHash(target: ReviewTarget, diff: FileDiff): string {
  return `${fileDiffFingerprintVersion}:${sha256([
    fileDiffFingerprintVersion,
    canonicalReviewTarget(target),
    canonicalFileDiff(diff)
  ])}`;
}

export function detectGeneratedFile(input: GeneratedFileInput): GeneratedFileDetection {
  const normalizedPath = input.path.replaceAll("\\", "/");
  const basename = normalizedPath.split("/").at(-1) ?? normalizedPath;

  if (lockfileNames.has(basename)) {
    return { isGenerated: false };
  }

  const sample = input.sample?.slice(0, 20 * 1024);
  if (sample && generatedHeaderPattern.test(sample)) {
    return { isGenerated: true, reason: "header" };
  }

  if (highConfidenceGeneratedSuffixes.some((suffix) => basename.endsWith(suffix))) {
    return { isGenerated: true, reason: "suffix" };
  }

  const pathSegments = normalizedPath.split("/").map((segment) => segment.toLowerCase());
  if (pathSegments.some((segment) => highConfidenceGeneratedSegments.has(segment))) {
    return { isGenerated: true, reason: "path_segment" };
  }

  return { isGenerated: false };
}

export function resolveReviewStates(
  input: ResolveReviewStatesInput
): readonly FileReviewState[] {
  const reviewTargetId = createReviewTargetId(input.reviewTarget);

  return input.diffs.map((diff) => {
    const diffHash = createDiffHash(input.reviewTarget, diff);
    const generatedSample = generatedDetectionSample(diff);
    const generated =
      diff.generated ??
      detectGeneratedFile({
        path: diff.newPath,
        ...(generatedSample !== undefined ? { sample: generatedSample } : {})
      }).isGenerated;
    const visible = input.showGeneratedFiles === true || !generated;
    const pathMarks = input.marks.filter(
      (mark) => mark.reviewTargetId === reviewTargetId && mark.path === diff.newPath
    );
    const reviewed = pathMarks.some((mark) => mark.reviewedDiffHash === diffHash);

    return {
      diff,
      diffHash,
      generated,
      invalidated:
        !reviewed && pathMarks.some((mark) => mark.reviewedDiffHash !== diffHash),
      path: diff.newPath,
      reviewable: true,
      reviewed,
      visible
    };
  });
}

export function calculateProgress(states: readonly FileReviewState[]): ReviewProgress {
  const visibleReviewableStates = states.filter(
    (state) => state.visible && state.reviewable
  );

  return {
    reviewedVisibleFiles: visibleReviewableStates.filter((state) => state.reviewed)
      .length,
    totalVisibleReviewableFiles: visibleReviewableStates.length
  };
}

function canonicalReviewTarget(target: ReviewTarget): readonly unknown[] {
  switch (target.kind) {
    case "branch":
      return [
        reviewTargetFingerprintVersion,
        target.projectId,
        target.kind,
        target.baseRefName,
        target.baseSha,
        target.headRefName ?? null,
        target.headSha,
        target.mergeBaseSha
      ];
    case "working_tree":
      return [
        reviewTargetFingerprintVersion,
        target.projectId,
        target.kind,
        target.headRefName ?? null,
        target.headSha
      ];
  }
}

function canonicalFileDiff(diff: FileDiff): readonly unknown[] {
  return [
    diff.status,
    diff.oldPath ?? null,
    diff.newPath,
    diff.oldMode ?? null,
    diff.newMode ?? null,
    canonicalContent(diff.content)
  ];
}

function generatedDetectionSample(diff: FileDiff): string | undefined {
  if (diff.content.kind !== "text") {
    return undefined;
  }

  return diff.content.newText ?? diff.content.oldText ?? diff.content.patch;
}

function canonicalContent(content: FileDiffContent): readonly unknown[] {
  switch (content.kind) {
    case "binary":
      return [content.kind, content.byteSize, content.digest];
    case "mode_only":
      return [content.kind];
    case "submodule":
      return [content.kind, content.oldCommit ?? null, content.newCommit ?? null];
    case "symlink":
      return [content.kind, content.oldTarget ?? null, content.newTarget ?? null];
    case "text":
      return [content.kind, normalizeLineEndings(content.patch)];
  }
}

function normalizeLineEndings(value: string): string {
  return value.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

const lockfileNames = new Set([
  "Cargo.lock",
  "Gemfile.lock",
  "Pipfile.lock",
  "composer.lock",
  "package-lock.json",
  "pnpm-lock.yaml",
  "pubspec.lock",
  "yarn.lock"
]);

const generatedHeaderPattern =
  /\b(@generated|auto-generated|automatically generated|code generated by|do not edit)\b/i;

const highConfidenceGeneratedSuffixes = [
  ".designer.cs",
  ".g.dart",
  ".generated.cs",
  ".generated.js",
  ".generated.jsx",
  ".generated.kt",
  ".generated.swift",
  ".generated.ts",
  ".generated.tsx",
  ".pb.cc",
  ".pb.go",
  ".pb.h",
  ".pb.swift"
] as const;

const highConfidenceGeneratedSegments = new Set([
  "__generated__",
  "generated",
  "generated-src",
  "generated-sources"
]);
