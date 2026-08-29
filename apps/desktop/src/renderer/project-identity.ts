type ProjectIdentity = Pick<
  RecentProjectView,
  "name" | "repositoryName" | "worktreeName"
>;

export function projectIdentityLabel(project: ProjectIdentity): string {
  return project.repositoryName && project.worktreeName
    ? `${project.repositoryName} / ${project.worktreeName}`
    : project.name;
}
