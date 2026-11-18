import { access, realpath } from "node:fs/promises";

import {
  EARLIER_BODY_MAX_CHARS,
  EXCERPT_MAX_LINES,
  buildLineExcerpt,
  buildPatchExcerpt,
  createDiffHash,
  createReviewNoteScopeId,
  createReviewTargetId,
  parseFeedbackExcerpt,
  type FeedbackExcerpt,
  type LearnExcerptSource,
  type LearnStatus,
  type ReviewTarget
} from "@difftray/core";
import {
  commitExists,
  firstCommitTouchingPathSince,
  getWorktreeInfo,
  listPathCommits,
  readFileAtRef,
  readPatchBetween,
  readRootCommit,
  type GitFileDiffSummary,
  type PathCommit
} from "@difftray/git";
import type {
  DifftrayStorage,
  FeedbackActor,
  LearnHistoryRow,
  StoredProjectRecord,
  StoredProjectWithRepositoryKey,
  StoredReviewTargetRecord
} from "@difftray/storage";

import { AgentProtocolError } from "../shared/agent-protocol.js";
import type { ExcerptDiff } from "./feedback-excerpt-capture.js";
import {
  loadExplicitFileDiff,
  loadExplicitReviewTarget,
  loadTargetSummaries,
  selectedReviewSelector
} from "./review-context-service.js";
import { fileDiffFromGit } from "./view-models.js";

export const GIT_LOOKUP_CAP = 500;
export const RECOVERY_BUDGET_MS = 45_000;
export const EARLIER_MAX_AGE_DAYS = 183;
export const EARLIER_MAX_ITEMS = 500;
// The formatter cuts earlier bodies with the same limit.
export { EARLIER_BODY_MAX_CHARS };

const dayMs = 86_400_000;

export type LearnHistoryItem = {
  readonly id: string;
  readonly kind: "line" | "file" | "note";
  readonly worktreePath: string;
  readonly path: string | null;
  readonly previousPath: string | null;
  readonly side: "additions" | "deletions" | null;
  readonly lineStart: number | null;
  readonly lineEnd: number | null;
  readonly body: string;
  readonly author: FeedbackActor;
  readonly status: LearnStatus;
  readonly dismissed: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly targetLabel: string;
  readonly excerpt: FeedbackExcerpt | null;
  readonly excerptSource: LearnExcerptSource;
  readonly excerptCommit: string | null;
};

export type LearnEarlierItem = Pick<
  LearnHistoryItem,
  "id" | "kind" | "path" | "author" | "status" | "dismissed" | "createdAt" | "updatedAt"
> & { readonly bodyFirstLine: string };

export type LearnHistoryResult = {
  readonly worktreeRoot: string;
  readonly commonGitDir: string;
  readonly reportStartedAt: string;
  // The stored cursor of the repository, whatever window was requested.
  readonly lastLearnedAt: string | null;
  // The newest updatedAt among new items, or null when there are none.
  readonly cursor: string | null;
  readonly newItems: readonly LearnHistoryItem[];
  readonly earlierItems: readonly LearnEarlierItem[];
};

export type LearnHistoryCollectInput = {
  readonly repoPath: string;
  readonly since?: string;
  readonly all?: boolean;
  readonly signal?: AbortSignal;
};

type TargetSummaries = {
  readonly reviewTarget: ReviewTarget;
  readonly files: readonly GitFileDiffSummary[];
};

export type LearnHistoryGit = {
  // realpath, getWorktreeInfo, realpath of the root and of the common directory.
  readonly resolveWorktree: (
    repoPath: string
  ) => Promise<{ readonly worktreeRoot: string; readonly commonGitDir: string }>;
  readonly pathExists: (fsPath: string) => Promise<boolean>;
  readonly readRootCommit: (repoPath: string) => Promise<string | null>;
  readonly commitExists: (repoPath: string, sha: string) => Promise<boolean>;
  readonly readFileAtRef: (
    repoPath: string,
    ref: string,
    filePath: string
  ) => Promise<string | null>;
  readonly readPatchBetween: (
    repoPath: string,
    oldRef: string,
    newRef: string,
    oldPath: string,
    newPath: string
  ) => Promise<string | null>;
  readonly listPathCommits: (
    repoPath: string,
    filePath: string
  ) => Promise<readonly PathCommit[]>;
  readonly loadCurrentTarget: (project: StoredProjectRecord) => Promise<ReviewTarget>;
  readonly loadTargetSummaries: (
    project: StoredProjectRecord
  ) => Promise<TargetSummaries>;
  readonly loadFileDiff: (
    projectPath: string,
    target: ReviewTarget,
    filePath: string,
    previousPath?: string
  ) => Promise<ExcerptDiff | null>;
};

export const defaultLearnHistoryGit: LearnHistoryGit = {
  commitExists,
  listPathCommits,
  loadCurrentTarget: (project) =>
    loadExplicitReviewTarget(project.path, selectedReviewSelector(project)),
  loadFileDiff: (projectPath, target, filePath, previousPath) =>
    loadExplicitFileDiff(projectPath, target, filePath, previousPath),
  loadTargetSummaries: (project) =>
    loadTargetSummaries(project.path, selectedReviewSelector(project)),
  pathExists: async (fsPath) => {
    try {
      await access(fsPath);
      return true;
    } catch {
      return false;
    }
  },
  readFileAtRef,
  readPatchBetween,
  readRootCommit,
  resolveWorktree: async (repoPath) => {
    const requested = await realpath(repoPath);
    const first = await getWorktreeInfo(requested);
    const worktreeRoot = await realpath(first.root);
    // Git prints the common directory relative to the working directory, so read it
    // again from the root when the request came from a subdirectory.
    const info = worktreeRoot === requested ? first : await getWorktreeInfo(worktreeRoot);
    return { commonGitDir: await realpath(info.commonGitDir), worktreeRoot };
  }
};

type RefreshStorage = Pick<
  DifftrayStorage,
  | "deleteLearnCursor"
  | "getProjectRepositoryKey"
  | "listProjectsByCommonGitDir"
  | "setProjectCommonGitDir"
>;

export type RefreshProjectRepositoryDependencies = {
  readonly storage: RefreshStorage;
  readonly git?: Pick<
    LearnHistoryGit,
    "commitExists" | "pathExists" | "readRootCommit" | "resolveWorktree"
  >;
  readonly now?: () => number;
};

/**
 * Records which repository a project path holds now. A path whose common directory
 * or root commit no longer matches the stored one was replaced: its older feedback
 * stops counting from now on, and so does that of removed worktrees that shared the
 * same common directory string.
 */
export async function refreshProjectRepository(
  dependencies: RefreshProjectRepositoryDependencies,
  project: { readonly id: string; readonly path: string }
): Promise<void> {
  const git = dependencies.git ?? defaultLearnHistoryGit;
  const now = dependencies.now ?? Date.now;
  const { storage } = dependencies;
  const { commonGitDir } = await git.resolveWorktree(project.path);
  const rootCommit = await git.readRootCommit(project.path);
  const stored = storage.getProjectRepositoryKey(project.id);

  if (!stored) return;

  if (stored.commonGitDir === null) {
    storage.setProjectCommonGitDir(project.id, commonGitDir, null, rootCommit);
    return;
  }

  if (
    stored.commonGitDir === commonGitDir &&
    (stored.repositoryRootCommit === null ||
      (await git.commitExists(project.path, stored.repositoryRootCommit)))
  ) {
    if (stored.repositoryRootCommit === null)
      storage.setProjectCommonGitDir(
        project.id,
        commonGitDir,
        stored.commonGitDirSince,
        rootCommit
      );
    return;
  }

  const replacedAt = new Date(now()).toISOString();
  storage.setProjectCommonGitDir(project.id, commonGitDir, replacedAt, rootCommit);

  if (stored.commonGitDir !== commonGitDir) return;

  storage.deleteLearnCursor(commonGitDir);
  for (const sibling of storage.listProjectsByCommonGitDir(commonGitDir)) {
    if (sibling.id === project.id || (await git.pathExists(sibling.path))) continue;
    storage.setProjectCommonGitDir(
      sibling.id,
      commonGitDir,
      replacedAt,
      sibling.repositoryRootCommit
    );
  }
}

export type LearnHistoryServiceDependencies = {
  readonly storage: RefreshStorage &
    Pick<
      DifftrayStorage,
      | "getLearnCursor"
      | "getProjectByPath"
      | "listLearnHistoryRows"
      | "listLearnReviewTargets"
      | "listProjectsMissingCommonGitDir"
    >;
  readonly git?: LearnHistoryGit;
  readonly now?: () => number;
  readonly gitLookupCap?: number;
  readonly recoveryBudgetMs?: number;
};

export type LearnHistoryService = {
  readonly collect: (input: LearnHistoryCollectInput) => Promise<LearnHistoryResult>;
};

type ProjectState = {
  readonly project: StoredProjectWithRepositoryKey;
  readonly exists: boolean;
  // Null when the worktree is gone or its current target does not resolve.
  readonly target: ReviewTarget | null;
  readonly targetId: string | null;
  readonly noteScopeId: string | null;
  readonly summaryHashes: ReadonlyMap<string, string> | null;
};

type Lookup<T> = { readonly done: true; readonly value: T } | { readonly done: false };

type ResolvedExcerpt = {
  readonly excerpt: FeedbackExcerpt | null;
  readonly excerptSource: LearnExcerptSource;
  readonly excerptCommit: string | null;
};

const notLookedUp: ResolvedExcerpt = {
  excerpt: null,
  excerptCommit: null,
  excerptSource: "not_looked_up"
};
const unavailable: ResolvedExcerpt = {
  excerpt: null,
  excerptCommit: null,
  excerptSource: "unavailable"
};

export function createLearnHistoryService(
  dependencies: LearnHistoryServiceDependencies
): LearnHistoryService {
  const git = dependencies.git ?? defaultLearnHistoryGit;
  const now = dependencies.now ?? Date.now;
  const cap = dependencies.gitLookupCap ?? GIT_LOOKUP_CAP;
  const budgetMs = dependencies.recoveryBudgetMs ?? RECOVERY_BUDGET_MS;
  const { storage } = dependencies;
  const refreshDependencies = { git, now, storage };

  async function collect(input: LearnHistoryCollectInput): Promise<LearnHistoryResult> {
    const { signal } = input;
    const reportStartedMs = now();
    const reportStartedAt = new Date(reportStartedMs).toISOString();
    const upperBound = new Date(reportStartedMs - 1).toISOString();

    assertActive(signal);
    let resolved: { readonly worktreeRoot: string; readonly commonGitDir: string };
    try {
      resolved = await git.resolveWorktree(input.repoPath);
    } catch {
      throw new AgentProtocolError(
        "repository_missing",
        "Repository is missing or unavailable."
      );
    }
    const { commonGitDir, worktreeRoot } = resolved;

    const requested = storage.getProjectByPath(worktreeRoot);
    if (requested) await refreshIgnoringErrors(requested);

    for (const project of storage.listProjectsMissingCommonGitDir()) {
      assertActive(signal);
      try {
        if (!(await git.pathExists(project.path))) continue;
        const backfilled = await git.resolveWorktree(project.path);
        storage.setProjectCommonGitDir(project.id, backfilled.commonGitDir, null, null);
      } catch {
        // A path that is no longer a Git worktree keeps no common directory.
      }
    }

    for (const project of storage.listProjectsByCommonGitDir(commonGitDir)) {
      if (project.id === requested?.id) continue;
      assertActive(signal);
      if (await git.pathExists(project.path)) await refreshIgnoringErrors(project);
    }

    const requestedRoot = requested
      ? (storage.getProjectRepositoryKey(requested.id)?.repositoryRootCommit ?? null)
      : await git.readRootCommit(worktreeRoot).catch(() => null);
    const grouped: { project: StoredProjectWithRepositoryKey; exists: boolean }[] = [];
    for (const project of storage.listProjectsByCommonGitDir(commonGitDir)) {
      const exists = await git.pathExists(project.path);
      if (
        exists ||
        project.repositoryRootCommit === null ||
        project.repositoryRootCommit === requestedRoot
      )
        grouped.push({ exists, project });
    }

    const lastLearnedAt = storage.getLearnCursor(commonGitDir);
    const lowerBound = input.since ?? (input.all ? null : lastLearnedAt);
    const rows = storage.listLearnHistoryRows({
      after: lowerBound,
      earlierFrom: new Date(reportStartedMs - EARLIER_MAX_AGE_DAYS * dayMs).toISOString(),
      earlierLimit: EARLIER_MAX_ITEMS,
      projects: grouped.map(({ project }) => ({
        projectId: project.id,
        since: project.commonGitDirSince
      })),
      upTo: upperBound
    });

    const allRows = [...rows.newRows, ...rows.earlierRows];
    const states = new Map<string, ProjectState>();
    for (const { exists, project } of grouped) {
      const projectRows = allRows.filter((row) => row.projectId === project.id);
      if (projectRows.length === 0) continue;
      assertActive(signal);
      states.set(project.id, await projectState(project, exists, projectRows));
    }

    const excerptStartedMs = now();
    let lookups = 0;
    const pathCommits = new Map<string, Promise<readonly PathCommit[] | null>>();
    const laterTargets = new Map<string, readonly StoredReviewTargetRecord[]>();

    async function lookup<T>(read: () => Promise<T>): Promise<Lookup<T>> {
      if (lookups >= cap || now() - excerptStartedMs > budgetMs) return { done: false };
      lookups += 1;
      const value = await read();
      assertActive(signal);
      return { done: true, value };
    }

    async function commitsTouching(
      filePath: string
    ): Promise<Lookup<readonly PathCommit[] | null>> {
      const memo = pathCommits.get(filePath);
      if (memo) return { done: true, value: await memo };
      const listed = await lookup(async () => {
        const pending = git.listPathCommits(worktreeRoot, filePath).catch(() => null);
        pathCommits.set(filePath, pending);
        return pending;
      });
      return listed;
    }

    function targetsOf(projectId: string): readonly StoredReviewTargetRecord[] {
      let targets = laterTargets.get(projectId);
      if (!targets) {
        targets = storage.listLearnReviewTargets(projectId);
        laterTargets.set(projectId, targets);
      }
      return targets;
    }

    async function lineFromRef(
      ref: string | undefined,
      filePath: string,
      row: LearnHistoryRow
    ): Promise<Lookup<FeedbackExcerpt | null>> {
      if (!ref) return { done: true, value: null };
      const text = await lookup(() =>
        git.readFileAtRef(worktreeRoot, ref, filePath).catch(() => null)
      );
      if (!text.done) return text;
      return {
        done: true,
        value: text.value === null ? null : lineExcerpt(row, text.value)
      };
    }

    async function resolveExcerpt(
      row: LearnHistoryRow,
      status: LearnStatus,
      state: ProjectState | undefined
    ): Promise<ResolvedExcerpt> {
      const saved = parseFeedbackExcerpt(row.excerptJson);
      if (saved) return { excerpt: saved, excerptCommit: null, excerptSource: "saved" };
      if (row.kind === "note" || row.path === null) return unavailable;
      if (lookups >= cap || now() - excerptStartedMs > budgetMs) return notLookedUp;

      const filePath = row.path;
      const oldPath = row.previousPath ?? filePath;
      const target = row.target;

      // Rule 2: the live diff of the item's own worktree.
      if (status === "active" && state?.target) {
        const currentTarget = state.target;
        const loaded = await lookup(() =>
          git
            .loadFileDiff(
              state.project.path,
              currentTarget,
              filePath,
              row.previousPath ?? undefined
            )
            .catch(() => null)
        );
        if (!loaded.done) return notLookedUp;
        const excerpt = loaded.value ? liveExcerpt(row, loaded.value) : null;
        if (excerpt) return recovered(excerpt);
      }

      if (!target) return unavailable;
      const mode = target.mode;

      if (row.kind === "line") {
        // Rule 3: branch and commit targets name both sides of the diff.
        if (mode === "branch" || mode === "commit") {
          const additions = row.side === "additions";
          const ref = additions
            ? mode === "branch"
              ? target.headRefSha
              : target.commitSha
            : mode === "branch"
              ? target.mergeBaseSha
              : target.parentSha;
          const read = await lineFromRef(ref, additions ? filePath : oldPath, row);
          if (!read.done) return notLookedUp;
          if (read.value) return recovered(read.value);
          return unavailable;
        }

        // Rule 4: working-tree deletions show the head commit.
        if (row.side === "deletions") {
          const read = await lineFromRef(target.headRefSha, oldPath, row);
          if (!read.done) return notLookedUp;
          return read.value ? recovered(read.value) : unavailable;
        }

        // Rule 5a: the same branch reviewed later.
        const later = target.headRefName
          ? targetsOf(row.projectId).find(
              (candidate) =>
                candidate.id !== target.id &&
                candidate.headRefName === target.headRefName &&
                candidate.headRefSha !== undefined &&
                candidate.createdAt > row.createdAt
            )
          : undefined;
        if (later?.headRefSha) {
          const read = await lineFromRef(later.headRefSha, filePath, row);
          if (!read.done) return notLookedUp;
          if (read.value) return approximate(read.value, later.headRefSha);
        }

        // Rule 5b: the first commit that touched the path after the comment.
        const commits = await commitsTouching(filePath);
        if (!commits.done) return notLookedUp;
        if (commits.value === null) return unavailable;
        const first = firstCommitTouchingPathSince(commits.value, row.createdAt);
        if (!first) return unavailable;
        const read = await lineFromRef(first.sha, filePath, row);
        if (!read.done) return notLookedUp;
        return read.value ? approximate(read.value, first.sha) : unavailable;
      }

      // Rule 6: the file patch between the target refs.
      if (mode === "branch" || mode === "commit") {
        const oldRef = mode === "branch" ? target.mergeBaseSha : target.parentSha;
        const newRef = mode === "branch" ? target.headRefSha : target.commitSha;
        if (!oldRef || !newRef) return unavailable;
        const patch = await lookup(() =>
          git
            .readPatchBetween(worktreeRoot, oldRef, newRef, oldPath, filePath)
            .catch(() => null)
        );
        if (!patch.done) return notLookedUp;
        const excerpt = patch.value ? buildPatchExcerpt(patch.value) : null;
        if (excerpt) return recovered(excerpt);
      }

      return unavailable;
    }

    const newItems: LearnHistoryItem[] = [];
    for (const row of rows.newRows) {
      assertActive(signal);
      const state = states.get(row.projectId);
      const status = rowStatus(row, state);
      const excerpt = await resolveExcerpt(row, status, state);
      newItems.push({
        author: rowAuthor(row),
        body: row.body,
        createdAt: row.createdAt,
        dismissed: row.dismissedAt !== null,
        id: row.id,
        kind: row.kind,
        lineEnd: row.lineEnd,
        lineStart: row.lineStart,
        path: row.path,
        previousPath: row.previousPath,
        side: row.side,
        status,
        targetLabel: rowTargetLabel(row, state),
        updatedAt: row.updatedAt,
        worktreePath: state?.project.path ?? projectPathOf(grouped, row.projectId),
        ...excerpt
      });
    }
    assertActive(signal);

    const earlierItems: LearnEarlierItem[] = rows.earlierRows.map((row) => ({
      author: rowAuthor(row),
      bodyFirstLine: (row.body.split(/\r?\n/, 1)[0] ?? "").slice(
        0,
        EARLIER_BODY_MAX_CHARS
      ),
      createdAt: row.createdAt,
      dismissed: row.dismissedAt !== null,
      id: row.id,
      kind: row.kind,
      path: row.path,
      status: rowStatus(row, states.get(row.projectId)),
      updatedAt: row.updatedAt
    }));

    const cursor = newItems.reduce<string | null>(
      (newest, entry) =>
        newest === null || Date.parse(entry.updatedAt) > Date.parse(newest)
          ? entry.updatedAt
          : newest,
      null
    );

    return {
      commonGitDir,
      cursor,
      earlierItems,
      lastLearnedAt,
      newItems,
      reportStartedAt,
      worktreeRoot
    };
  }

  async function refreshIgnoringErrors(project: {
    readonly id: string;
    readonly path: string;
  }): Promise<void> {
    try {
      await refreshProjectRepository(refreshDependencies, project);
    } catch {
      // A worktree that cannot be read keeps its stored repository key.
    }
  }

  async function projectState(
    project: StoredProjectWithRepositoryKey,
    exists: boolean,
    projectRows: readonly LearnHistoryRow[]
  ): Promise<ProjectState> {
    const missing: ProjectState = {
      exists,
      noteScopeId: null,
      project,
      summaryHashes: null,
      target: null,
      targetId: null
    };
    if (!exists) return missing;
    try {
      const target = await git.loadCurrentTarget(project);
      const targetId = createReviewTargetId(target);
      const needsSummaries = projectRows.some(
        (row) => row.kind !== "note" && row.reviewTargetId === targetId
      );
      let summaryHashes: Map<string, string> | null = null;
      if (needsSummaries) {
        const summaries = await git.loadTargetSummaries(project);
        // A target that moved between the two reads cannot vouch for the hashes.
        if (createReviewTargetId(summaries.reviewTarget) !== targetId) return missing;
        summaryHashes = new Map(
          summaries.files.map((file) => [
            file.newPath,
            createDiffHash(target, fileDiffFromGit(file))
          ])
        );
      }
      return {
        exists,
        noteScopeId: createReviewNoteScopeId(target),
        project,
        summaryHashes,
        target,
        targetId
      };
    } catch {
      return missing;
    }
  }

  return { collect };
}

function assertActive(signal: AbortSignal | undefined): void {
  if (signal?.aborted)
    throw new AgentProtocolError("request_timeout", "Learn report was cancelled.");
}

function rowStatus(row: LearnHistoryRow, state: ProjectState | undefined): LearnStatus {
  if (!state?.target) return "target_changed";
  if (row.kind === "note") {
    if (row.scopeId !== state.noteScopeId) return "target_changed";
    return row.dismissedAt !== null ? "dismissed" : "active";
  }
  if (row.reviewTargetId !== state.targetId) return "target_changed";
  const currentHash = row.path !== null ? state.summaryHashes?.get(row.path) : undefined;
  return currentHash === undefined || currentHash !== row.diffHash
    ? "diff_changed"
    : "active";
}

function rowAuthor(row: LearnHistoryRow): FeedbackActor {
  return row.kind === "note" ? row.lastEditedBy : (row.createdBy ?? row.lastEditedBy);
}

function rowTargetLabel(row: LearnHistoryRow, state: ProjectState | undefined): string {
  if (row.kind === "note")
    return state?.target && row.scopeId === state.noteScopeId
      ? currentTargetLabel(state.target)
      : "earlier target";
  return row.target ? storedTargetLabel(row.target) : "earlier target";
}

function currentTargetLabel(target: ReviewTarget): string {
  if (target.kind === "working_tree") return "working tree";
  if (target.kind === "branch")
    return `${target.baseRefName}...${target.headRefName ?? target.headSha.slice(0, 7)}`;
  return `commit ${target.commitSha.slice(0, 7)}`;
}

function storedTargetLabel(target: StoredReviewTargetRecord): string {
  if (target.mode === "working_tree") return "working tree";
  if (target.mode === "branch")
    return `${target.baseRefName ?? "?"}...${
      target.headRefName ?? target.headRefSha?.slice(0, 7) ?? "?"
    }`;
  return `commit ${(target.commitSha ?? "").slice(0, 7)}`;
}

function projectPathOf(
  grouped: readonly { readonly project: StoredProjectWithRepositoryKey }[],
  projectId: string
): string {
  return (
    grouped.find(({ project }) => project.id === projectId)?.project.path ?? projectId
  );
}

function lineExcerpt(row: LearnHistoryRow, text: string): FeedbackExcerpt | null {
  if (row.side === null || row.lineStart === null || row.lineEnd === null) return null;
  return buildLineExcerpt({
    lineEnd: row.lineEnd,
    lineStart: row.lineStart,
    maxLines: EXCERPT_MAX_LINES,
    side: row.side,
    text
  });
}

function liveExcerpt(row: LearnHistoryRow, loaded: ExcerptDiff): FeedbackExcerpt | null {
  if (loaded.oversized || loaded.content.kind !== "text") return null;
  if (row.kind === "file")
    return typeof loaded.content.patch === "string"
      ? buildPatchExcerpt(loaded.content.patch)
      : null;
  const text = row.side === "additions" ? loaded.content.newText : loaded.content.oldText;
  return text === undefined ? null : lineExcerpt(row, text);
}

function recovered(excerpt: FeedbackExcerpt): ResolvedExcerpt {
  return { excerpt, excerptCommit: null, excerptSource: "recovered" };
}

function approximate(excerpt: FeedbackExcerpt, commit: string): ResolvedExcerpt {
  return { excerpt, excerptCommit: commit, excerptSource: "approximate" };
}
