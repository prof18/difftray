import { join } from "node:path";

export type PathExists = (pathName: string) => boolean;

/**
 * A project is stored at its Git top level, which always holds a `.git`
 * directory (main checkout) or file (linked worktree). A folder left behind
 * with only ignored files has neither, so it counts as gone too.
 */
export function isProjectPathPresent(
  projectPath: string,
  pathExists: PathExists
): boolean {
  return pathExists(projectPath) && pathExists(join(projectPath, ".git"));
}

export function vanishedProjectIds(
  projects: readonly { readonly id: string; readonly path: string }[],
  pathExists: PathExists
): readonly string[] {
  return projects
    .filter((project) => !isProjectPathPresent(project.path, pathExists))
    .map((project) => project.id);
}

/**
 * Checks presence before and after the load, on success and on failure,
 * because the folder can vanish while Git runs.
 */
export async function loadUnlessVanished<T>(input: {
  readonly isPresent: () => boolean;
  readonly load: () => Promise<T>;
  readonly onVanished: () => Promise<void>;
}): Promise<T | null> {
  if (!input.isPresent()) {
    await input.onVanished();
    return null;
  }

  let value: T;
  try {
    value = await input.load();
  } catch (caughtError) {
    if (input.isPresent()) throw caughtError;
    await input.onVanished();
    return null;
  }

  if (input.isPresent()) return value;
  await input.onVanished();
  return null;
}
