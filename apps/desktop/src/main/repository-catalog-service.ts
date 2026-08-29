import type { RepositoryCatalogEntry } from "@difftray/companion-protocol";

type RepositoryCatalogRecord = {
  readonly available: boolean;
  readonly id: string;
  readonly lastSeenAt: string;
  readonly name: string;
  readonly path: string;
};

export type CompanionRepositoryCatalogDependencies = {
  readonly listOpenProjects: () => readonly { readonly path: string }[];
  readonly listRepositoryCatalog: () => readonly RepositoryCatalogRecord[];
  readonly scheduleStaleScans: () => void;
};

export function listCompanionRepositoryCatalog(
  dependencies: CompanionRepositoryCatalogDependencies
): readonly RepositoryCatalogEntry[] {
  const openPaths = new Set(
    dependencies.listOpenProjects().map((project) => project.path)
  );

  const catalog = dependencies
    .listRepositoryCatalog()
    .filter((entry) => entry.available)
    .map((entry) => ({
      displayPath: entry.path,
      id: entry.id,
      lastSeenAt: entry.lastSeenAt,
      name: entry.name,
      state: openPaths.has(entry.path) ? ("open" as const) : ("available" as const)
    }));

  dependencies.scheduleStaleScans();
  return catalog;
}
