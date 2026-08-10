export type ProjectDirectoryRecord = {
  readonly path: string;
};

export type OpenStoredProjectDirectoryDependencies = {
  readonly findProject: (projectId: string) => ProjectDirectoryRecord | null | undefined;
  readonly openPath: (projectPath: string) => Promise<string>;
};

export async function openStoredProjectDirectory(
  projectId: string,
  dependencies: OpenStoredProjectDirectoryDependencies
): Promise<void> {
  const project = dependencies.findProject(projectId);

  if (!project) {
    throw new Error(`Project is not stored: ${projectId}`);
  }

  const openError = await dependencies.openPath(project.path);

  if (openError.length > 0) {
    throw new Error(`Unable to open project in Finder: ${openError}`);
  }
}
