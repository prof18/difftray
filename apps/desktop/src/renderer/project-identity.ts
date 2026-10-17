type ProjectIdentity = Pick<
  RecentProjectView,
  "customLabel" | "name" | "repositoryName" | "worktreeName"
>;

export function projectIdentityLabel(project: ProjectIdentity): string {
  if (project.customLabel) {
    return `${project.repositoryName ?? project.name} / ${project.customLabel}`;
  }

  return project.repositoryName && project.worktreeName
    ? `${project.repositoryName} / ${project.worktreeName}`
    : project.name;
}
