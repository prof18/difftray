import type { DifftrayStorage } from "@difftray/storage";

import {
  AgentProtocolError,
  type LearnMarkParams,
  type LearnMarkResult
} from "../shared/agent-protocol.js";
import {
  defaultLearnHistoryGit,
  refreshProjectRepository,
  type RefreshProjectRepositoryDependencies
} from "./learn-history-service.js";

export type LearnMarkServiceDependencies = {
  readonly storage: RefreshProjectRepositoryDependencies["storage"] &
    Pick<DifftrayStorage, "advanceLearnCursor" | "getProjectByPath">;
  readonly git?: NonNullable<RefreshProjectRepositoryDependencies["git"]>;
  readonly now?: () => number;
};

export type LearnMarkService = {
  readonly mark: (params: LearnMarkParams) => Promise<LearnMarkResult>;
};

/** Moves a repository's "last learned" cursor forward; it never moves back. */
export function createLearnMarkService(
  dependencies: LearnMarkServiceDependencies
): LearnMarkService {
  const git = dependencies.git ?? defaultLearnHistoryGit;
  const now = dependencies.now ?? Date.now;
  const { storage } = dependencies;

  async function mark(params: LearnMarkParams): Promise<LearnMarkResult> {
    const cursorMs = Date.parse(params.cursor);
    if (Number.isNaN(cursorMs))
      throw new AgentProtocolError("invalid_request", "The cursor must be a timestamp.");
    if (cursorMs > now())
      throw new AgentProtocolError(
        "invalid_request",
        "The cursor cannot be later than the current time."
      );

    let resolved: { readonly worktreeRoot: string; readonly commonGitDir: string };
    try {
      resolved = await git.resolveWorktree(params.repoPath);
    } catch {
      throw new AgentProtocolError(
        "repository_missing",
        "Repository is missing or unavailable."
      );
    }

    // Detect an in-place replacement first, so an old cursor never applies to it.
    const project = storage.getProjectByPath(resolved.worktreeRoot);
    if (project) {
      try {
        await refreshProjectRepository({ git, now, storage }, project);
      } catch {
        // A worktree that cannot be read keeps its stored repository key.
      }
    }

    const advanced = storage.advanceLearnCursor(
      resolved.commonGitDir,
      new Date(cursorMs).toISOString()
    );
    return { cursor: advanced.cursorAt, moved: advanced.moved };
  }

  return { mark };
}
