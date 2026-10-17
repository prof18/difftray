import path from "node:path";

import { normalizeWorktreeLabel } from "@difftray/companion-protocol";
import type { GitWorktreeCandidate } from "@difftray/git";
import type { SetWorktreeLabelInput } from "@difftray/storage";

import type { RepositoryWorktreeView } from "@difftray/companion-protocol";

import { AgentProtocolError } from "../shared/agent-protocol.js";
import { ExpectedUnavailableWorktreeError } from "./repository-worktree-service.js";

export type WorktreeLabelChange = {
  readonly worktreeId: string;
  readonly worktreePath: string;
};

export type WorktreeLabelResult = {
  readonly candidate: GitWorktreeCandidate;
  readonly label: string | null;
};

export type WorktreeLabelServiceDependencies = {
  /** Resolves symlinks like Git's own root does; defaults to the normalized path. */
  readonly canonicalPath?: (requestedPath: string) => Promise<string>;
  readonly findRepository: (
    worktreePath: string
  ) => Promise<{ readonly root: string } | null>;
  readonly listWorktrees: (
    repositoryPath: string
  ) => Promise<readonly GitWorktreeCandidate[]>;
  readonly onChanged?: (change: WorktreeLabelChange) => void;
  readonly pathExists: (worktreePath: string) => boolean;
  readonly resetLabel: (worktreeId: string) => unknown;
  readonly setLabel: (input: SetWorktreeLabelInput) => unknown;
  readonly worktreeInfo: (
    worktreePath: string
  ) => Promise<{ readonly commonGitDir: string; readonly root: string }>;
};

export type WorktreeLabelService = {
  /** Labels the worktree whose exact Git root is `repoPath`. */
  readonly setForPath: (repoPath: string, label: unknown) => Promise<WorktreeLabelResult>;
  /** Labels an enumerated candidate after rechecking that it is still live. */
  readonly setForCandidate: (
    candidate: GitWorktreeCandidate,
    label: unknown
  ) => Promise<WorktreeLabelResult>;
};

/** The requested path is not inside any Git worktree. */
class WorktreeLabelRepositoryMissingError extends ExpectedUnavailableWorktreeError {}

/** The label text failed shared validation. Nothing was written. */
export class WorktreeLabelValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorktreeLabelValidationError";
  }
}

export function createWorktreeLabelService(
  dependencies: WorktreeLabelServiceDependencies
): WorktreeLabelService {
  const setForCandidate = async (
    candidate: GitWorktreeCandidate,
    label: unknown
  ): Promise<WorktreeLabelResult> => {
    const normalized = requireValidLabel(label);
    const live = await requireLiveCandidate(dependencies, candidate);
    return writeLabel(dependencies, live, normalized);
  };

  return {
    setForCandidate,
    setForPath: async (repoPath, label) => {
      const normalized = requireValidLabel(label);
      const requestedPath = path.normalize(
        (await dependencies.canonicalPath?.(repoPath).catch(() => undefined)) ?? repoPath
      );
      const repository = await dependencies.findRepository(requestedPath);

      if (!repository) {
        throw new WorktreeLabelRepositoryMissingError(
          "Path is not inside a Git worktree."
        );
      }

      if (path.normalize(repository.root) !== requestedPath) {
        throw new ExpectedUnavailableWorktreeError(
          `Path is not a worktree root. Use ${repository.root}.`
        );
      }

      const candidates = await dependencies.listWorktrees(requestedPath);
      const candidate = candidates.find(
        (worktree) => path.normalize(worktree.path) === requestedPath
      );

      if (!candidate) {
        throw new ExpectedUnavailableWorktreeError("Worktree is no longer available.");
      }

      const live = await requireLiveCandidate(dependencies, candidate);
      return writeLabel(dependencies, live, normalized);
    }
  };
}

function requireValidLabel(label: unknown): string | null {
  const normalized = normalizeWorktreeLabel(label);

  if (!normalized.ok) {
    throw new WorktreeLabelValidationError(normalized.error);
  }

  return normalized.value;
}

async function requireLiveCandidate(
  dependencies: WorktreeLabelServiceDependencies,
  candidate: GitWorktreeCandidate
): Promise<GitWorktreeCandidate> {
  if (candidate.bare || candidate.prunable) {
    throw new ExpectedUnavailableWorktreeError("Worktree cannot be labeled.");
  }

  if (!dependencies.pathExists(candidate.path)) {
    throw new ExpectedUnavailableWorktreeError("Worktree path is no longer available.");
  }

  const [candidates, info, repository] = await Promise.all([
    dependencies.listWorktrees(candidate.path),
    dependencies.worktreeInfo(candidate.path),
    dependencies.findRepository(candidate.path)
  ]);
  const live = candidates.find((worktree) => worktree.id === candidate.id);

  if (!live || live.bare || live.prunable) {
    throw new ExpectedUnavailableWorktreeError(
      "Worktree is no longer available. Refresh and try again."
    );
  }

  if (path.normalize(info.commonGitDir) !== path.normalize(candidate.commonGitDir)) {
    throw new ExpectedUnavailableWorktreeError(
      "Worktree belongs to a different repository."
    );
  }

  if (!repository || path.normalize(repository.root) !== path.normalize(candidate.path)) {
    throw new ExpectedUnavailableWorktreeError(
      "Worktree path is no longer a valid Git root."
    );
  }

  // Git marks the worktree it runs in as current; keep the caller's view.
  return { ...live, current: candidate.current };
}

function writeLabel(
  dependencies: WorktreeLabelServiceDependencies,
  candidate: GitWorktreeCandidate,
  label: string | null
): WorktreeLabelResult {
  if (label === null) {
    dependencies.resetLabel(candidate.id);
  } else {
    dependencies.setLabel({
      commonGitDir: candidate.commonGitDir,
      label,
      worktreeId: candidate.id,
      worktreePath: candidate.path
    });
  }

  dependencies.onChanged?.({
    worktreeId: candidate.id,
    worktreePath: path.normalize(candidate.path)
  });

  return { candidate, label };
}

/**
 * Agent entry point: labels the exact worktree root and maps expected failures
 * to agent protocol errors. It never opens the worktree.
 */
export async function setAgentWorktreeLabel(
  service: Pick<WorktreeLabelService, "setForPath">,
  params: { readonly repoPath: string; readonly label: string | null },
  view: (candidate: GitWorktreeCandidate, label: string | null) => RepositoryWorktreeView
): Promise<{ readonly repoPath: string; readonly worktree: RepositoryWorktreeView }> {
  try {
    const result = await service.setForPath(params.repoPath, params.label);
    return {
      repoPath: path.normalize(result.candidate.path),
      worktree: view(result.candidate, result.label)
    };
  } catch (error) {
    if (error instanceof WorktreeLabelValidationError)
      throw new AgentProtocolError("invalid_request", error.message);
    if (error instanceof WorktreeLabelRepositoryMissingError)
      throw new AgentProtocolError("repository_missing", error.message);
    if (error instanceof ExpectedUnavailableWorktreeError)
      throw new AgentProtocolError("invalid_target", error.message);
    throw error;
  }
}
