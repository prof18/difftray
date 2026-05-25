export type ProjectTabRecord = {
  readonly id: string;
};

export type ProjectTabDropPosition = "after" | "before";

export function mergeProjectTabs<TProject extends ProjectTabRecord>(
  currentProjects: readonly TProject[],
  nextProjects: readonly TProject[]
): readonly TProject[] {
  if (currentProjects.length === 0) {
    return nextProjects;
  }

  const nextProjectsById = new Map(
    nextProjects.map((project) => [project.id, project] as const)
  );
  const orderedProjects: TProject[] = [];

  for (const project of currentProjects) {
    const nextProject = nextProjectsById.get(project.id);

    if (nextProject) {
      orderedProjects.push({ ...project, ...nextProject });
    }
  }

  const orderedProjectIds = new Set(orderedProjects.map((project) => project.id));

  for (const project of nextProjects) {
    if (!orderedProjectIds.has(project.id)) {
      orderedProjects.push(project);
    }
  }

  return orderedProjects;
}

export function reorderProjectTabs<TProject extends ProjectTabRecord>(
  projects: readonly TProject[],
  draggedProjectId: string,
  targetProjectId: string,
  position: ProjectTabDropPosition
): readonly TProject[] {
  if (draggedProjectId === targetProjectId) {
    return projects;
  }

  const draggedProject = projects.find((project) => project.id === draggedProjectId);

  if (!draggedProject) {
    return projects;
  }

  const remainingProjects = projects.filter((project) => project.id !== draggedProjectId);
  const targetIndex = remainingProjects.findIndex(
    (project) => project.id === targetProjectId
  );

  if (targetIndex < 0) {
    return projects;
  }

  const insertIndex = position === "after" ? targetIndex + 1 : targetIndex;

  return [
    ...remainingProjects.slice(0, insertIndex),
    draggedProject,
    ...remainingProjects.slice(insertIndex)
  ];
}
