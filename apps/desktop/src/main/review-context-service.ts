import { createHash, randomBytes } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import {
  calculateProgress,
  createReviewTargetId,
  resolveReviewStates,
  type ReviewTarget
} from "@difftray/core";
import {
  getWorktreeInfo,
  loadBranchDiffSummaries,
  loadCommitDiffSummaries,
  loadWorkingTreeDiffSummaries,
  loadBranchReviewTarget,
  loadCommitReviewTarget,
  loadWorkingTreeReviewTarget,
  loadBranchFileDiff,
  loadCommitFileDiff,
  loadWorkingTreeFileDiff,
  loadBranchFileDiffSummary,
  loadCommitFileDiffSummary,
  loadWorkingTreeFileDiffSummary,
  type DiffLoadProgress
} from "@difftray/git";
import {
  AgentContextCapacityError,
  type DifftrayStorage,
  type StoredProjectRecord
} from "@difftray/storage";
import {
  AgentProtocolError,
  CONTEXT_TTL_MS,
  MAX_LIVE_CONTEXTS,
  MAX_CONTEXT_FILES,
  type AgentSelector,
  type ExplicitAgentSelector,
  type AgentReviewContext,
  type AgentContextFile
} from "../shared/agent-protocol.js";
import {
  fileDiffFromGit,
  reviewTargetFromGit,
  reviewTargetRecord
} from "./view-models.js";

export function selectedReviewSelector(
  project: StoredProjectRecord
): ExplicitAgentSelector {
  if (project.defaultDiffTargetMode === "branch" && project.defaultBaseRef)
    return { kind: "branch", base: project.defaultBaseRef };
  if (project.defaultDiffTargetMode === "commit" && project.defaultCommitRef)
    return { kind: "commit", commit: project.defaultCommitRef };
  return { kind: "working-tree" };
}
export async function loadExplicitReviewTarget(
  repoPath: string,
  selector: ExplicitAgentSelector
): Promise<ReviewTarget> {
  return reviewTargetFromGit(
    selector.kind === "branch"
      ? await loadBranchReviewTarget(repoPath, selector.base)
      : selector.kind === "commit"
        ? await loadCommitReviewTarget(repoPath, selector.commit)
        : (await loadWorkingTreeReviewTarget(repoPath)).reviewTarget
  );
}
export async function loadExplicitReviewState(
  storage: DifftrayStorage,
  project: StoredProjectRecord,
  selector: ExplicitAgentSelector,
  showGeneratedFiles: boolean,
  onProgress?: (progress: DiffLoadProgress) => void
) {
  const options = onProgress ? { onProgress } : {};
  const result =
    selector.kind === "branch"
      ? await loadBranchDiffSummaries(project.path, selector.base, options)
      : selector.kind === "commit"
        ? await loadCommitDiffSummaries(project.path, selector.commit, options)
        : await loadWorkingTreeDiffSummaries(project.path, options);
  const reviewTarget = reviewTargetFromGit(result.reviewTarget);
  const reviewTargetId = createReviewTargetId(reviewTarget);
  storage.upsertReviewTarget(reviewTargetRecord(reviewTargetId, reviewTarget));
  const states = resolveReviewStates({
    diffs: result.files.map(fileDiffFromGit),
    marks: storage.listReviewMarks(reviewTargetId),
    reviewTarget,
    showGeneratedFiles
  });
  const files = states.map((state, index) => {
    const summary = result.files[index];
    if (!summary) throw new Error(`Review summary missing for ${state.path}`);
    return { state, summary };
  });
  return { files, progress: calculateProgress(states), reviewTarget, reviewTargetId };
}
export function loadExplicitFileDiff(
  repoPath: string,
  target: ReviewTarget,
  filePath: string,
  previousPath?: string
) {
  return target.kind === "branch"
    ? loadBranchFileDiff(repoPath, target.baseRefName, filePath, previousPath)
    : target.kind === "commit"
      ? loadCommitFileDiff(repoPath, target.commitSha, filePath, previousPath)
      : loadWorkingTreeFileDiff(repoPath, filePath, previousPath);
}

export function loadExplicitFileSummary(
  repoPath: string,
  target: ReviewTarget,
  filePath: string,
  previousPath?: string
) {
  return target.kind === "branch"
    ? loadBranchFileDiffSummary(repoPath, target.baseRefName, filePath, previousPath)
    : target.kind === "commit"
      ? loadCommitFileDiffSummary(repoPath, target.commitSha, filePath, previousPath)
      : loadWorkingTreeFileDiffSummary(repoPath, filePath, previousPath);
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
async function repositoryIdentity(repoPath: string) {
  try {
    const info = await getWorktreeInfo(await realpath(repoPath));
    const [canonicalWorktreePath, gitDir, commonGitDir] = await Promise.all([
      realpath(info.root),
      realpath(info.gitDir),
      realpath(info.commonGitDir)
    ]);
    const identities = await Promise.all(
      [canonicalWorktreePath, gitDir, commonGitDir].map(async (entry) => {
        const value = await stat(entry);
        return [entry, value.dev, value.ino, value.birthtimeMs];
      })
    );
    return {
      canonicalWorktreePath,
      gitDir,
      commonGitDir,
      repositoryIdentity: hash(identities)
    };
  } catch {
    throw new AgentProtocolError(
      "repository_missing",
      "Repository is missing or unavailable."
    );
  }
}

export function createReviewContextService(
  storage: DifftrayStorage,
  options: {
    readonly now?: () => number;
    readonly ttl?: number;
    readonly maxContexts?: number;
  } = {}
) {
  const now = options.now ?? Date.now;
  async function snapshot(
    project: StoredProjectRecord,
    selector: ExplicitAgentSelector,
    showGeneratedFiles: boolean
  ) {
    const before = await loadExplicitReviewTarget(project.path, selector);
    const loaded = await loadExplicitReviewState(
      storage,
      project,
      selector,
      showGeneratedFiles
    );
    const after = await loadExplicitReviewTarget(project.path, selector);
    if (
      createReviewTargetId(before) !== loaded.reviewTargetId ||
      createReviewTargetId(after) !== loaded.reviewTargetId
    ) {
      throw new AgentProtocolError(
        "stale_review",
        "Review target changed while loading; inspect again."
      );
    }
    if (loaded.files.length > MAX_CONTEXT_FILES)
      throw new AgentProtocolError("limit_exceeded", "Too many files in review context.");
    const files: AgentContextFile[] = loaded.files
      .map(({ state, summary }) => ({
        path: state.path,
        ...(summary.oldPath ? { previousPath: summary.oldPath } : {}),
        diffHash: state.diffHash,
        kind: summary.content.kind,
        visible: state.visible
      }))
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    return {
      reviewTarget: loaded.reviewTarget,
      reviewTargetId: loaded.reviewTargetId,
      files,
      snapshotHash: hash([loaded.reviewTargetId, files, showGeneratedFiles])
    };
  }
  async function inspect(
    repoPath: string,
    requested: AgentSelector
  ): Promise<AgentReviewContext> {
    const identity = await repositoryIdentity(repoPath);
    const canonical = identity.canonicalWorktreePath;
    let project = storage.getProjectByPath(canonical);
    if (!project) {
      storage.upsertProject({
        id: canonical,
        path: canonical,
        name: path.basename(canonical)
      });
      project = storage.getProject(canonical);
    }
    if (!project)
      throw new AgentProtocolError("internal_error", "Unable to register repository.");
    const selector =
      requested.kind === "selected" ? selectedReviewSelector(project) : requested;
    const showGeneratedFiles = storage.getAppSettings().showGeneratedFiles;
    let loaded;
    try {
      loaded = await snapshot(project, selector, showGeneratedFiles);
    } catch (error) {
      if (error instanceof AgentProtocolError) throw error;
      throw new AgentProtocolError(
        "invalid_target",
        "Cannot resolve the requested target."
      );
    }
    const pinnedSelector: ExplicitAgentSelector =
      loaded.reviewTarget.kind === "commit"
        ? { kind: "commit", commit: loaded.reviewTarget.commitSha }
        : selector;
    const context: AgentReviewContext = {
      id: `ctx_${randomBytes(16).toString("hex")}`,
      projectId: project.id,
      ...identity,
      selector: pinnedSelector,
      ...loaded,
      showGeneratedFiles,
      createdAt: now(),
      expiresAt: now() + (options.ttl ?? CONTEXT_TTL_MS)
    };
    await validateSnapshot(context);
    try {
      storage.createAgentReviewContext(
        {
          id: context.id,
          projectId: project.id,
          contextJson: JSON.stringify(context),
          expiresAt: context.expiresAt
        },
        { now: now(), maxContexts: options.maxContexts ?? MAX_LIVE_CONTEXTS }
      );
    } catch (error) {
      if (error instanceof AgentContextCapacityError)
        throw new AgentProtocolError("limit_exceeded", error.message);
      throw error;
    }
    return context;
  }
  async function validateSnapshot(context: AgentReviewContext): Promise<void> {
    const identity = await repositoryIdentity(context.canonicalWorktreePath);
    if (
      identity.repositoryIdentity !== context.repositoryIdentity ||
      identity.gitDir !== context.gitDir ||
      identity.commonGitDir !== context.commonGitDir
    )
      throw new AgentProtocolError(
        "stale_review",
        "Repository identity changed; inspect again."
      );
    const project = storage.getProject(context.projectId);
    if (project?.path !== context.canonicalWorktreePath)
      throw new AgentProtocolError(
        "repository_missing",
        "Context repository is no longer registered."
      );
    try {
      const current = await snapshot(
        project,
        context.selector,
        context.showGeneratedFiles
      );
      const after = await repositoryIdentity(context.canonicalWorktreePath);
      if (
        current.snapshotHash !== context.snapshotHash ||
        after.repositoryIdentity !== context.repositoryIdentity
      )
        throw new AgentProtocolError("stale_review", "Review changed; inspect again.");
    } catch (error) {
      if (error instanceof AgentProtocolError) throw error;
      throw new AgentProtocolError(
        "stale_review",
        "Context target no longer resolves; inspect again."
      );
    }
  }
  async function validate(id: string): Promise<AgentReviewContext> {
    const stored = storage.getAgentReviewContext(id);
    if (!stored)
      throw new AgentProtocolError(
        "context_missing",
        "Context not found; inspect again."
      );
    if (stored.expiresAt <= now())
      throw new AgentProtocolError("context_expired", "Context expired; inspect again.");
    const context = JSON.parse(stored.contextJson) as AgentReviewContext;
    await validateSnapshot(context);
    return context;
  }
  async function withContext<T>(
    id: string,
    read: (context: AgentReviewContext) => Promise<T>
  ): Promise<T> {
    const context = await validate(id);
    const result = await read(context);
    await validate(id);
    return result;
  }
  return { inspect, validate, withContext };
}
