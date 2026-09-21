import path from "node:path";

export type DroppedRepositoryCandidate = {
  readonly path: string;
  readonly searchRootPath?: string;
};

type DiscoveredRepository = {
  readonly name: string;
  readonly path: string;
};

type RepositoryMatch = { readonly root: string };

export type DroppedRepositoryPreviewDependencies = {
  readonly discoverRepositories: (input: {
    readonly findRepository: (markerPath: string) => Promise<RepositoryMatch | null>;
    readonly rootPath: string;
  }) => Promise<{ readonly candidates: readonly DiscoveredRepository[] }>;
  readonly findRepository: (markerPath: string) => Promise<RepositoryMatch | null>;
  readonly isDirectory: (pathName: string) => boolean;
  readonly realpath: (pathName: string) => string;
};

export type RememberDroppedRepositorySearchRootsDependencies = {
  readonly isDirectory: (pathName: string) => boolean;
  readonly remember: (pathName: string) => void;
};

export function rememberDroppedRepositorySearchRoots(
  candidates: readonly DroppedRepositoryCandidate[],
  dependencies: RememberDroppedRepositorySearchRootsDependencies
): void {
  const rememberedPaths = new Set<string>();

  for (const candidate of candidates) {
    const rootPath = candidate.searchRootPath;
    if (!rootPath || rememberedPaths.has(rootPath)) continue;
    rememberedPaths.add(rootPath);

    let isDirectory = false;
    try {
      isDirectory = dependencies.isDirectory(rootPath);
    } catch {
      // The folder may have been deleted or replaced after its preview.
    }
    if (isDirectory) dependencies.remember(rootPath);
  }
}

export async function previewDroppedRepositoryCandidates(
  droppedPaths: readonly string[],
  dependencies: DroppedRepositoryPreviewDependencies
): Promise<readonly DroppedRepositoryCandidate[]> {
  const candidates = new Map<string, DroppedRepositoryCandidate>();

  for (const droppedPath of droppedPaths) {
    try {
      if (!dependencies.isDirectory(droppedPath)) continue;
    } catch {
      // Only existing folders can be repository drop targets.
      continue;
    }

    let containingRepository: RepositoryMatch | undefined;
    let exactRepository = false;
    try {
      const repository = await dependencies.findRepository(droppedPath);
      if (
        repository &&
        dependencies.realpath(repository.root) === dependencies.realpath(droppedPath)
      ) {
        candidates.set(repository.root, { path: repository.root });
        exactRepository = true;
      } else if (repository) {
        // A folder dropped inside a repository still represents that containing
        // repository, even though discovery below the dropped folder may find
        // additional repositories.
        containingRepository = repository;
        candidates.set(repository.root, { path: repository.root });
      }
    } catch {
      // Invalid drops are omitted from the preview.
    }
    if (exactRepository) continue;

    try {
      const discovery = await dependencies.discoverRepositories({
        findRepository: dependencies.findRepository,
        rootPath: droppedPath
      });
      for (const candidate of discovery.candidates) {
        const discovered: DroppedRepositoryCandidate = containingRepository
          ? { path: candidate.path }
          : { path: candidate.path, searchRootPath: droppedPath };
        candidates.set(path.normalize(candidate.path), discovered);
      }
    } catch {
      // A failed folder stays absent; the preview can still show other drops.
    }
  }

  return [...candidates.values()];
}
