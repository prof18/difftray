import type { DatabaseSync } from "node:sqlite";

import { currentTimestamp } from "./timestamps.js";

const projectTabOrderKey = "project_tab_order_json";

export function applyProjectTabOrder<TProject extends { readonly id: string }>(
  projects: readonly TProject[],
  tabOrder: readonly string[]
): readonly TProject[] {
  if (tabOrder.length === 0) {
    return projects;
  }

  const projectsById = new Map(projects.map((project) => [project.id, project] as const));
  const orderedProjects: TProject[] = [];
  const orderedProjectIds = new Set<string>();

  for (const projectId of tabOrder) {
    if (orderedProjectIds.has(projectId)) {
      continue;
    }

    const project = projectsById.get(projectId);

    if (project) {
      orderedProjects.push(project);
      orderedProjectIds.add(projectId);
    }
  }

  for (const project of projects) {
    if (!orderedProjectIds.has(project.id)) {
      orderedProjects.push(project);
    }
  }

  return orderedProjects;
}

export function parseStoredProjectTabOrder(value: string | undefined): readonly string[] {
  if (!value) {
    return [];
  }

  let parsedValue: unknown;

  try {
    parsedValue = JSON.parse(value) as unknown;
  } catch {
    return [];
  }

  if (!Array.isArray(parsedValue)) {
    return [];
  }

  return parsedValue.filter((item): item is string => typeof item === "string");
}

export function sanitizeProjectTabOrder(
  projects: readonly { readonly id: string }[],
  requestedOrder: readonly string[]
): readonly string[] {
  const knownProjectIds = new Set(projects.map((project) => project.id));
  const sanitizedOrder: string[] = [];
  const seenProjectIds = new Set<string>();

  for (const projectId of requestedOrder) {
    if (!knownProjectIds.has(projectId) || seenProjectIds.has(projectId)) {
      continue;
    }

    seenProjectIds.add(projectId);
    sanitizedOrder.push(projectId);
  }

  return sanitizedOrder;
}

export function getProjectTabOrder(db: DatabaseSync): readonly string[] {
  const row = db
    .prepare("select value from app_settings where key = ?")
    .get(projectTabOrderKey) as { readonly value: string } | undefined;

  return parseStoredProjectTabOrder(row?.value);
}

export function upsertProjectTabOrder(
  db: DatabaseSync,
  projectIds: readonly string[]
): void {
  const dedupedProjectIds = [...new Set(projectIds)];

  db.prepare(
    `
    insert into app_settings (
      key,
      value,
      updated_at
    ) values (?, ?, ?)
    on conflict(key) do update set
      value = excluded.value,
      updated_at = excluded.updated_at
  `
  ).run(projectTabOrderKey, JSON.stringify(dedupedProjectIds), currentTimestamp());
}

export function appendProjectToTabOrder(db: DatabaseSync, projectId: string): void {
  const tabOrder = getProjectTabOrder(db);

  if (tabOrder.includes(projectId)) {
    return;
  }

  upsertProjectTabOrder(db, [...tabOrder, projectId]);
}

export function removeProjectFromTabOrder(db: DatabaseSync, projectId: string): void {
  const tabOrder = getProjectTabOrder(db);

  if (!tabOrder.includes(projectId)) {
    return;
  }

  upsertProjectTabOrder(
    db,
    tabOrder.filter((storedProjectId) => storedProjectId !== projectId)
  );
}
