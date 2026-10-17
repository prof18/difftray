import path from "node:path";

import type { GitWorktreeCandidate } from "@difftray/git";
import type {
  ProjectWorktreeAvailabilityView,
  RepositoryWorktreeView
} from "@difftray/companion-protocol";
import type { ProjectRecord, WorktreeLabelRecord } from "@difftray/storage";

import type { RepositoryOpenBatchResult } from "./repository-open-service.js";
import type { WorktreeLabelService } from "./worktree-label-service.js";

type StoredProjectPath = {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly repositoryName?: string;
};

const availabilityConcurrency = 4;

export type RepositoryWorktreeServiceDependencies = {
  readonly changeCount?: (worktreePath: string) => number | null | undefined;
  readonly findProject: (projectId: string) => StoredProjectPath | null | undefined;
  readonly findRepository: (
    worktreePath: string
  ) => Promise<{ readonly root: string } | null>;
  readonly labelService?: Pick<WorktreeLabelService, "setForCandidate">;
  readonly listLabels?: (
    worktreePaths: readonly string[]
  ) => readonly WorktreeLabelRecord[];
  readonly listOpenProjects: () => readonly Pick<StoredProjectPath, "id" | "path">[];
  readonly listWorktrees: (
    repositoryPath: string
  ) => Promise<readonly GitWorktreeCandidate[]>;
  readonly openPaths: (
    selectedPaths: readonly string[]
  ) => Promise<RepositoryOpenBatchResult>;
  readonly persistProject: (project: ProjectRecord) => void;
  readonly queueChangeCount?: (
    worktreePath: string,
    options?: { readonly refresh?: boolean }
  ) => void;
  readonly pathExists: (worktreePath: string) => boolean;
  readonly worktreeInfo: (
    worktreePath: string
  ) => Promise<{ readonly commonGitDir: string; readonly root: string }>;
};

export type RepositoryWorktreeService = {
  readonly availability: (
    projectIds: readonly string[]
  ) => Promise<readonly ProjectWorktreeAvailabilityView[]>;
  readonly list: (projectId: string) => Promise<readonly RepositoryWorktreeView[]>;
  readonly open: (projectId: string, worktreeId: string) => Promise<ProjectRecord>;
  readonly resolvePath: (projectId: string, worktreeId: string) => Promise<string>;
  /** Sets (or with `null` resets) a worktree display label; metadata only. */
  readonly setLabel: (
    projectId: string,
    worktreeId: string,
    label: unknown
  ) => Promise<RepositoryWorktreeView>;
};

/** An expected stale or unavailable worktree validation outcome. */
export class ExpectedUnavailableWorktreeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpectedUnavailableWorktreeError";
  }
}

export function createRepositoryWorktreeService(
  dependencies: RepositoryWorktreeServiceDependencies
): RepositoryWorktreeService {
  return {
    availability: async (projectIds) => {
      const projects = projectIds.map((projectId) => ({
        projectId,
        project: dependencies.findProject(projectId)
      }));
      const groups = new Map<string, StoredProjectPath[]>();

      await forEachBounded(projects, availabilityConcurrency, async ({ project }) => {
        if (!project) return;

        try {
          const info = await dependencies.worktreeInfo(project.path);
          const commonGitDir = path.normalize(info.commonGitDir);
          const group = groups.get(commonGitDir);
          if (group) {
            group.push(project);
          } else {
            groups.set(commonGitDir, [project]);
          }
        } catch {
          // A project may have been removed or stopped being a Git worktree.
        }
      });

      const availability = new Map<string, boolean>();
      await forEachBounded(
        [...groups.values()],
        availabilityConcurrency,
        async (projectsInRepository) => {
          const representative = projectsInRepository[0];
          if (!representative) return;

          try {
            const candidates = await dependencies.listWorktrees(representative.path);
            const hasSiblingWorktrees =
              candidates.filter((candidate) => !candidate.bare && !candidate.prunable)
                .length > 1;
            for (const project of projectsInRepository) {
              availability.set(project.id, hasSiblingWorktrees);
            }
          } catch {
            for (const project of projectsInRepository) {
              availability.set(project.id, false);
            }
          }
        }
      );

      return projects.map(({ projectId }) => ({
        hasSiblingWorktrees: availability.get(projectId) ?? false,
        projectId
      }));
    },
    list: async (projectId) => {
      const source = requireProject(dependencies, projectId);
      const [candidates, openProjects] = await Promise.all([
        dependencies.listWorktrees(source.path),
        Promise.resolve(dependencies.listOpenProjects())
      ]);
      const openPaths = new Set(
        openProjects.map((project) => path.normalize(project.path))
      );

      const listed = candidates.filter(
        (candidate) => !candidate.bare && !candidate.prunable
      );
      const labels = labelsById(
        dependencies.listLabels?.(listed.map((candidate) => candidate.path)) ?? []
      );
      const views = listed.map((candidate) =>
        worktreeView(
          candidate,
          openPaths,
          dependencies.changeCount?.(candidate.path),
          labels.get(candidate.id)
        )
      );

      for (const candidate of candidates) {
        if (!candidate.bare && !candidate.prunable) {
          dependencies.queueChangeCount?.(candidate.path, { refresh: true });
        }
      }

      return views;
    },
    open: async (projectId, worktreeId) => {
      const source = requireProject(dependencies, projectId);
      const candidates = await dependencies.listWorktrees(source.path);
      const candidate = candidates.find(({ id }) => id === worktreeId);

      if (!candidate) {
        throw new ExpectedUnavailableWorktreeError(
          "Worktree is no longer available. Refresh and try again."
        );
      }

      if (candidate.current || candidate.bare || candidate.prunable) {
        throw new ExpectedUnavailableWorktreeError("Worktree cannot be opened.");
      }

      if (!dependencies.pathExists(candidate.path)) {
        throw new ExpectedUnavailableWorktreeError(
          "Worktree path is no longer available."
        );
      }

      const [sourceInfo, candidateInfo, repository] = await Promise.all([
        dependencies.worktreeInfo(source.path),
        dependencies.worktreeInfo(candidate.path),
        dependencies.findRepository(candidate.path)
      ]);

      if (
        path.normalize(sourceInfo.commonGitDir) !==
        path.normalize(candidateInfo.commonGitDir)
      ) {
        throw new ExpectedUnavailableWorktreeError(
          "Worktree belongs to a different repository."
        );
      }

      if (
        !repository ||
        path.normalize(repository.root) !== path.normalize(candidate.path)
      ) {
        throw new ExpectedUnavailableWorktreeError(
          "Worktree path is no longer a valid Git root."
        );
      }

      const result = await dependencies.openPaths([candidate.path]);
      const project = result.projects[0];

      if (!project) {
        throw new ExpectedUnavailableWorktreeError("Worktree could not be opened.");
      }

      const enrichedProject: ProjectRecord = {
        ...project,
        repositoryName: source.repositoryName ?? source.name,
        worktreeName: worktreeDisplayName(candidate)
      };
      dependencies.persistProject(enrichedProject);
      return enrichedProject;
    },
    resolvePath: async (projectId, worktreeId) => {
      const source = requireProject(dependencies, projectId);
      const candidates = await dependencies.listWorktrees(source.path);
      const candidate = candidates.find(
        ({ bare, id, prunable }) => id === worktreeId && !bare && !prunable
      );

      if (!candidate) {
        throw new ExpectedUnavailableWorktreeError(
          "Worktree is no longer available. Refresh and try again."
        );
      }

      return candidate.path;
    },
    setLabel: async (projectId, worktreeId, label) => {
      const source = requireProject(dependencies, projectId);
      const labelService = dependencies.labelService;

      if (!labelService) {
        throw new Error("Worktree labels are not available.");
      }

      const [candidates, sourceInfo, openProjects] = await Promise.all([
        dependencies.listWorktrees(source.path),
        dependencies.worktreeInfo(source.path),
        Promise.resolve(dependencies.listOpenProjects())
      ]);
      const candidate = candidates.find(({ id }) => id === worktreeId);

      if (!candidate || candidate.bare || candidate.prunable) {
        throw new ExpectedUnavailableWorktreeError(
          "Worktree is no longer available. Refresh and try again."
        );
      }

      if (
        path.normalize(sourceInfo.commonGitDir) !== path.normalize(candidate.commonGitDir)
      ) {
        throw new ExpectedUnavailableWorktreeError(
          "Worktree belongs to a different repository."
        );
      }

      const result = await labelService.setForCandidate(candidate, label);
      return worktreeView(
        result.candidate,
        new Set(openProjects.map((project) => path.normalize(project.path))),
        dependencies.changeCount?.(result.candidate.path),
        result.label ?? undefined
      );
    }
  };
}

function labelsById(labels: readonly WorktreeLabelRecord[]): ReadonlyMap<string, string> {
  return new Map(labels.map((label) => [label.worktreeId, label.label]));
}

async function forEachBounded<T>(
  values: readonly T[],
  concurrency: number,
  callback: (value: T) => Promise<void>
): Promise<void> {
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, values.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        const value = values[index];
        if (value !== undefined) await callback(value);
      }
    })
  );
}

function requireProject(
  dependencies: RepositoryWorktreeServiceDependencies,
  projectId: string
): StoredProjectPath {
  const project = dependencies.findProject(projectId);

  if (!project) {
    throw new ExpectedUnavailableWorktreeError(`Project is not stored: ${projectId}`);
  }

  return project;
}

/** Builds the picker view for one candidate; `customLabel` overrides the name. */
export function worktreeView(
  candidate: GitWorktreeCandidate,
  openPaths: ReadonlySet<string>,
  changeCount: number | null | undefined,
  customLabel?: string
): RepositoryWorktreeView {
  const shortHeadSha = candidate.headSha?.slice(0, 7);

  return {
    ...(candidate.branchName ? { branchName: candidate.branchName } : {}),
    ...(changeCount === undefined || changeCount === null ? {} : { changeCount }),
    ...(customLabel === undefined ? {} : { customLabel }),
    displayName: customLabel ?? worktreeDisplayName(candidate),
    displayPath: candidate.path,
    ...(candidate.headSha ? { headSha: candidate.headSha } : {}),
    id: candidate.id,
    locked: candidate.locked,
    ...(shortHeadSha ? { shortHeadSha } : {}),
    state: candidate.current
      ? "current"
      : openPaths.has(path.normalize(candidate.path))
        ? "open"
        : "available"
  };
}

function worktreeDisplayName(candidate: GitWorktreeCandidate): string {
  return generatedWorktreeDisplayName({
    ...(candidate.branchName ? { branchName: candidate.branchName } : {}),
    ...(candidate.headSha ? { shortHeadSha: candidate.headSha.slice(0, 7) } : {})
  });
}

/** The Git-derived worktree name: branch, then detached short hash. */
export function generatedWorktreeDisplayName(
  worktree: Pick<RepositoryWorktreeView, "branchName" | "shortHeadSha">
): string {
  return (
    worktree.branchName ??
    (worktree.shortHeadSha ? `Detached @ ${worktree.shortHeadSha}` : "Detached worktree")
  );
}
