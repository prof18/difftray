import path from "node:path";

import type { ProjectRecord } from "@difftray/storage";

export type RepositoryOpenServiceDependencies = {
  readonly findRepository: (
    selectedPath: string
  ) => Promise<{ readonly root: string } | null>;
  readonly isLinkedWorktree: (repositoryPath: string) => Promise<boolean>;
  readonly isProjectOpen: (projectId: string) => boolean;
  readonly now: () => Date;
  readonly clearProjectWorktreeIdentity: (projectId: string) => void;
  readonly registerProject: (project: ProjectRecord) => void;
};

export type RepositoryOpenDuplicate = {
  readonly projectId: string;
  readonly selectedPath: string;
};

export type RepositoryOpenFailure = {
  readonly reason: "not_git_repository" | "validation_failed";
  readonly selectedPath: string;
};

export type RepositoryOpenBatchResult = {
  readonly duplicates: readonly RepositoryOpenDuplicate[];
  readonly failures: readonly RepositoryOpenFailure[];
  readonly newlyOpenedCount: number;
  readonly projects: readonly ProjectRecord[];
};

export type RepositoryOpenService = {
  readonly openPaths: (
    selectedPaths: readonly string[]
  ) => Promise<RepositoryOpenBatchResult>;
};

export function createRepositoryOpenService(
  dependencies: RepositoryOpenServiceDependencies
): RepositoryOpenService {
  return {
    openPaths: async (selectedPaths) => {
      const duplicates: RepositoryOpenDuplicate[] = [];
      const failures: RepositoryOpenFailure[] = [];
      const projects: ProjectRecord[] = [];
      let newlyOpenedCount = 0;
      const registeredProjectIds = new Set<string>();

      for (const selectedPath of selectedPaths) {
        let repository: { readonly root: string } | null;

        try {
          repository = await dependencies.findRepository(selectedPath);
        } catch {
          failures.push({ reason: "validation_failed", selectedPath });
          continue;
        }

        if (!repository) {
          failures.push({ reason: "not_git_repository", selectedPath });
          continue;
        }

        const projectId = repository.root;

        if (registeredProjectIds.has(projectId)) {
          duplicates.push({ projectId, selectedPath });
          continue;
        }

        let isLinkedWorktree: boolean;

        try {
          isLinkedWorktree = await dependencies.isLinkedWorktree(projectId);
        } catch {
          failures.push({ reason: "validation_failed", selectedPath });
          continue;
        }

        registeredProjectIds.add(projectId);

        if (dependencies.isProjectOpen(projectId)) {
          duplicates.push({ projectId, selectedPath });
        } else {
          newlyOpenedCount += 1;
        }

        const project = {
          id: projectId,
          lastOpenedAt: dependencies.now().toISOString(),
          name: path.basename(repository.root),
          path: repository.root
        } satisfies ProjectRecord;

        dependencies.registerProject(project);
        if (!isLinkedWorktree) {
          dependencies.clearProjectWorktreeIdentity(project.id);
        }
        projects.push(project);
      }

      return { duplicates, failures, newlyOpenedCount, projects };
    }
  };
}
