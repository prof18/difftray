import path from "node:path";

export const defaultRepositoryDiscoveryExclusions = new Set([
  ".cache",
  ".git",
  ".gradle",
  ".Trash",
  "build",
  "DerivedData",
  "dist",
  "node_modules"
]);

export function shouldTraverseRepositoryDirectory(name: string): boolean {
  return !defaultRepositoryDiscoveryExclusions.has(name);
}

export function isPathInsideApprovedRoot(
  rootPath: string,
  candidatePath: string
): boolean {
  const relative = path.relative(path.normalize(rootPath), path.normalize(candidatePath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
