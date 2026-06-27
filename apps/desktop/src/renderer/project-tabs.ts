export type ProjectTabRecord = {
  readonly id: string;
};

export type ProjectTabDropPosition = "after" | "before";

export type ProjectTabLayout = {
  readonly left: number;
  readonly projectId: string;
  readonly width: number;
};

export type ProjectTabDropTarget = {
  readonly position: ProjectTabDropPosition;
  readonly projectId: string;
};

export function resolveProjectTabInsertIndex(
  tabs: readonly ProjectTabLayout[],
  pointerX: number,
  draggedProjectId: string
): number | undefined {
  const remainingTabs = tabs.filter((tab) => tab.projectId !== draggedProjectId);

  if (remainingTabs.length === 0) {
    return undefined;
  }

  for (let index = 0; index < remainingTabs.length; index += 1) {
    const tab = remainingTabs[index];

    if (!tab) {
      continue;
    }

    const tabCenter = tab.left + tab.width / 2;

    if (pointerX < tabCenter) {
      return index;
    }
  }

  return remainingTabs.length;
}

export function projectTabDropTargetFromInsertIndex(
  remainingTabs: readonly ProjectTabLayout[],
  insertIndex: number
): ProjectTabDropTarget | undefined {
  if (remainingTabs.length === 0) {
    return undefined;
  }

  if (insertIndex <= 0) {
    const firstTab = remainingTabs[0];

    if (!firstTab) {
      return undefined;
    }

    return {
      projectId: firstTab.projectId,
      position: "before"
    };
  }

  if (insertIndex >= remainingTabs.length) {
    const lastTab = remainingTabs[remainingTabs.length - 1];

    if (!lastTab) {
      return undefined;
    }

    return {
      projectId: lastTab.projectId,
      position: "after"
    };
  }

  const targetTab = remainingTabs[insertIndex];

  if (!targetTab) {
    return undefined;
  }

  return {
    projectId: targetTab.projectId,
    position: "before"
  };
}

export function projectTabOrderIndexAfterInsert(
  projects: readonly ProjectTabRecord[],
  draggedProjectId: string,
  insertIndex: number,
  remainingTabs: readonly ProjectTabLayout[]
): number | undefined {
  const dropTarget = projectTabDropTargetFromInsertIndex(remainingTabs, insertIndex);

  if (!dropTarget) {
    return undefined;
  }

  return reorderProjectTabs(
    projects,
    draggedProjectId,
    dropTarget.projectId,
    dropTarget.position
  ).findIndex((project) => project.id === draggedProjectId);
}

export function resolveProjectTabDropTarget(
  tabs: readonly ProjectTabLayout[],
  pointerX: number,
  draggedProjectId: string
): ProjectTabDropTarget | undefined {
  const remainingTabs = tabs.filter((tab) => tab.projectId !== draggedProjectId);
  const insertIndex = resolveProjectTabInsertIndex(tabs, pointerX, draggedProjectId);

  if (insertIndex === undefined) {
    return undefined;
  }

  return projectTabDropTargetFromInsertIndex(remainingTabs, insertIndex);
}

export function projectTabOrdersMatch(
  left: readonly ProjectTabRecord[],
  right: readonly ProjectTabRecord[]
): boolean {
  return (
    left.length === right.length &&
    left.every((project, index) => project.id === right[index]?.id)
  );
}

export function shouldCancelActiveTabDrag(input: {
  readonly nextCancelKey: number;
  readonly previousCancelKey: number;
}): boolean {
  return input.previousCancelKey !== input.nextCancelKey && input.nextCancelKey !== 0;
}

export type ProjectTabReorderUpdate<TProject extends ProjectTabRecord> = {
  readonly nextProjects: readonly TProject[];
  readonly rollbackProjects: readonly TProject[];
};

export function prepareProjectTabReorderUpdate<TProject extends ProjectTabRecord>(
  currentProjects: readonly TProject[],
  nextProjects: readonly TProject[]
): ProjectTabReorderUpdate<TProject> | undefined {
  if (projectTabOrdersMatch(currentProjects, nextProjects)) {
    return undefined;
  }

  return {
    nextProjects,
    rollbackProjects: currentProjects
  };
}

export type LiveProjectTabReorderInput<
  TProject extends ProjectTabRecord = ProjectTabRecord
> = {
  readonly dragProjects: readonly TProject[];
  readonly draggedProjectId: string;
  readonly lastAppliedOrderIndex: number | undefined;
  readonly layouts: readonly ProjectTabLayout[];
  readonly pointerX: number;
};

export type LiveProjectTabReorderResult<
  TProject extends ProjectTabRecord = ProjectTabRecord
> = {
  readonly dropTarget: ProjectTabDropTarget | undefined;
  readonly nextAppliedOrderIndex: number | undefined;
  readonly nextDragProjects: readonly TProject[];
  readonly shouldReorder: boolean;
};

export function resolveLiveProjectTabReorder<TProject extends ProjectTabRecord>(
  input: LiveProjectTabReorderInput<TProject>
): LiveProjectTabReorderResult<TProject> {
  const remainingTabs = input.layouts.filter(
    (tab) => tab.projectId !== input.draggedProjectId
  );
  const insertIndex = resolveProjectTabInsertIndex(
    input.layouts,
    input.pointerX,
    input.draggedProjectId
  );

  if (insertIndex === undefined) {
    return {
      dropTarget: undefined,
      nextAppliedOrderIndex: input.lastAppliedOrderIndex,
      nextDragProjects: input.dragProjects,
      shouldReorder: false
    };
  }

  const dropTarget = projectTabDropTargetFromInsertIndex(remainingTabs, insertIndex);

  if (!dropTarget) {
    return {
      dropTarget: undefined,
      nextAppliedOrderIndex: input.lastAppliedOrderIndex,
      nextDragProjects: input.dragProjects,
      shouldReorder: false
    };
  }

  const currentIndex = input.dragProjects.findIndex(
    (project) => project.id === input.draggedProjectId
  );
  const nextIndex = projectTabOrderIndexAfterInsert(
    input.dragProjects,
    input.draggedProjectId,
    insertIndex,
    remainingTabs
  );

  if (nextIndex === undefined || nextIndex === currentIndex) {
    return {
      dropTarget: undefined,
      nextAppliedOrderIndex: input.lastAppliedOrderIndex,
      nextDragProjects: input.dragProjects,
      shouldReorder: false
    };
  }

  if (nextIndex === input.lastAppliedOrderIndex) {
    return {
      dropTarget,
      nextAppliedOrderIndex: input.lastAppliedOrderIndex,
      nextDragProjects: input.dragProjects,
      shouldReorder: false
    };
  }

  const nextDragProjects = reorderProjectTabs(
    input.dragProjects,
    input.draggedProjectId,
    dropTarget.projectId,
    dropTarget.position
  );

  return {
    dropTarget,
    nextAppliedOrderIndex: nextIndex,
    nextDragProjects,
    shouldReorder: true
  };
}

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

export type ProjectTabOrderSaveQueue = {
  enqueue(input: {
    readonly onFailure: (error: unknown) => void;
    readonly projectIds: readonly string[];
    readonly save: (projectIds: readonly string[]) => Promise<void>;
  }): void;
  whenIdle(): Promise<void>;
};

export function createProjectTabOrderSaveQueue(): ProjectTabOrderSaveQueue {
  let queue: Promise<void> = Promise.resolve();
  let latestVersion = 0;

  return {
    enqueue({ onFailure, projectIds, save }) {
      const saveVersion = ++latestVersion;

      queue = queue
        .then(async () => {
          await save(projectIds);
        })
        .catch((caughtError: unknown) => {
          if (latestVersion === saveVersion) {
            onFailure(caughtError);
          }
        });
    },
    whenIdle() {
      return queue;
    }
  };
}
