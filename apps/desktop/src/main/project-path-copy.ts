export type ProjectPathRecord = {
  readonly path: string;
};

export type CopyStoredProjectPathDependencies = {
  readonly findProject: (projectId: string) => ProjectPathRecord | null | undefined;
  readonly writeText: (projectPath: string) => void;
};

export function copyStoredProjectPath(
  projectId: string,
  dependencies: CopyStoredProjectPathDependencies
): void {
  const project = dependencies.findProject(projectId);

  if (!project) {
    throw new Error(`Project is not stored: ${projectId}`);
  }

  dependencies.writeText(project.path);
}
