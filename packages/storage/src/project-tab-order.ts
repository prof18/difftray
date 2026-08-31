import type { DatabaseSync } from "node:sqlite";

import { currentTimestamp } from "./timestamps.js";

const projectTabOrderKey = "project_tab_order_json";
const projectTabsExplicitKey = "project_tabs_explicit_v1";

export function applyProjectTabOrder<TProject extends { readonly id: string }>(
  projects: readonly TProject[],
  tabOrder: readonly string[]
): readonly TProject[] {
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

  return orderedProjects;
}

export function initializeProjectTabs(
  db: DatabaseSync,
  projects: readonly { readonly id: string }[]
): void {
  if (hasProjectTabsExplicitMarker(db)) {
    return;
  }

  const storedOrder = getProjectTabOrder(db);
  const seededOrder = legacyProjectTabOrder(projects, storedOrder);

  db.exec("begin immediate");

  try {
    upsertProjectTabOrder(db, seededOrder);
    db.prepare(
      `
        insert into app_settings (key, value, updated_at)
        values (?, ?, ?)
        on conflict(key) do update set
          value = excluded.value,
          updated_at = excluded.updated_at
      `
    ).run(projectTabsExplicitKey, "1", currentTimestamp());
    db.exec("commit");
  } catch (error) {
    db.exec("rollback");
    throw error;
  }
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

export function reconcileProjectTabOrder(
  openProjects: readonly { readonly id: string }[],
  requestedOrder: readonly string[]
): readonly string[] {
  const reconciledOrder = [...sanitizeProjectTabOrder(openProjects, requestedOrder)];
  const seenProjectIds = new Set(reconciledOrder);

  for (const { id } of openProjects) {
    if (seenProjectIds.has(id)) {
      continue;
    }

    seenProjectIds.add(id);
    reconciledOrder.push(id);
  }

  return reconciledOrder;
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

function hasProjectTabsExplicitMarker(db: DatabaseSync): boolean {
  return Boolean(
    db.prepare("select 1 from app_settings where key = ?").get(projectTabsExplicitKey)
  );
}

function legacyProjectTabOrder(
  projects: readonly { readonly id: string }[],
  storedOrder: readonly string[]
): readonly string[] {
  const knownIds = new Set(projects.map(({ id }) => id));
  const seededOrder = storedOrder.filter((id) => knownIds.has(id));
  const seededIds = new Set(seededOrder);

  for (const { id } of projects) {
    if (!seededIds.has(id)) {
      seededOrder.push(id);
      seededIds.add(id);
    }
  }

  return seededOrder;
}
