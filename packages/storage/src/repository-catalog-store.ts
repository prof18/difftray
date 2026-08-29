import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { currentTimestamp } from "./timestamps.js";

export const repositoryDiscoveryVersion = 2;

export type RepositorySearchRootRecord = {
  readonly discoveryVersion: number;
  readonly enabled: boolean;
  readonly id: string;
  readonly lastScanCompletedAt?: string;
  readonly lastScanError?: string;
  readonly lastScanStartedAt?: string;
  readonly path: string;
};

export type RepositoryCatalogRecord = {
  readonly available: boolean;
  readonly id: string;
  readonly lastSeenAt: string;
  readonly name: string;
  readonly path: string;
  readonly rootId: string;
};

export type RepositoryCatalogCandidate = {
  readonly name: string;
  readonly path: string;
};

export function addRepositorySearchRoot(
  db: DatabaseSync,
  rootPath: string
): RepositorySearchRootRecord {
  const normalizedPath = path.normalize(rootPath);
  const existing = db
    .prepare("select * from repository_roots where path = ?")
    .get(normalizedPath) as RepositoryRootRow | undefined;

  if (existing) {
    db.prepare("update repository_roots set enabled = 1 where id = ?").run(existing.id);
    return rootFromRow({ ...existing, enabled: 1 });
  }

  const id = randomUUID();
  db.prepare("insert into repository_roots (id, path, enabled) values (?, ?, 1)").run(
    id,
    normalizedPath
  );
  return { discoveryVersion: 0, enabled: true, id, path: normalizedPath };
}

export function listRepositorySearchRoots(
  db: DatabaseSync
): readonly RepositorySearchRootRecord[] {
  return (
    db
      .prepare("select * from repository_roots order by path")
      .all() as RepositoryRootRow[]
  ).map(rootFromRow);
}

export function removeRepositorySearchRoot(db: DatabaseSync, rootId: string): void {
  db.exec("begin immediate");
  try {
    const owned = db
      .prepare("select id from repository_catalog where root_id = ?")
      .all(rootId) as { readonly id: string }[];
    const alternate = db.prepare(
      `select root_id from repository_catalog_roots
       where repository_id = ? and root_id <> ?
       order by root_id limit 1`
    );
    const reassign = db.prepare("update repository_catalog set root_id = ? where id = ?");
    for (const repository of owned) {
      const row = alternate.get(repository.id, rootId) as
        | { readonly root_id: string }
        | undefined;
      if (row) reassign.run(row.root_id, repository.id);
    }
    db.prepare("delete from repository_roots where id = ?").run(rootId);
    db.exec("commit");
  } catch (error) {
    db.exec("rollback");
    throw error;
  }
}

export function beginRepositoryRootScan(db: DatabaseSync, rootId: string): void {
  db.prepare(
    "update repository_roots set last_scan_started_at = ?, last_scan_error = null where id = ?"
  ).run(currentTimestamp(), rootId);
}

export function failRepositoryRootScan(
  db: DatabaseSync,
  rootId: string,
  message: string
): void {
  db.prepare("update repository_roots set last_scan_error = ? where id = ?").run(
    message,
    rootId
  );
}

export function replaceRepositoryCatalogForRoot(
  db: DatabaseSync,
  rootId: string,
  candidates: readonly RepositoryCatalogCandidate[]
): void {
  const seenAt = currentTimestamp();
  db.exec("begin immediate");

  try {
    db.prepare("update repository_catalog_roots set available = 0 where root_id = ?").run(
      rootId
    );
    const upsert = db.prepare(`
      insert into repository_catalog (id, root_id, path, name, last_seen_at, available)
      values (?, ?, ?, ?, ?, 1)
      on conflict(path) do update set
        name = excluded.name,
        last_seen_at = excluded.last_seen_at,
        available = 1
    `);

    for (const candidate of candidates) {
      const normalizedPath = path.normalize(candidate.path);
      upsert.run(
        repositoryCatalogId(normalizedPath),
        rootId,
        normalizedPath,
        candidate.name,
        seenAt
      );
      db.prepare(
        `insert into repository_catalog_roots (
           repository_id, root_id, last_seen_at, available
         ) values (?, ?, ?, 1)
         on conflict(repository_id, root_id) do update set
           last_seen_at = excluded.last_seen_at,
           available = 1`
      ).run(repositoryCatalogId(normalizedPath), rootId, seenAt);
    }

    db.prepare(
      `update repository_roots
       set discovery_version = ?, last_scan_completed_at = ?, last_scan_error = null
       where id = ?`
    ).run(repositoryDiscoveryVersion, seenAt, rootId);
    db.exec("commit");
  } catch (error) {
    db.exec("rollback");
    throw error;
  }
}

export function listRepositoryCatalog(
  db: DatabaseSync
): readonly RepositoryCatalogRecord[] {
  return (
    db
      .prepare(
        `select c.id, c.path, c.name,
                max(m.last_seen_at) as last_seen_at,
                max(m.available) as available,
                coalesce(
                  min(case when m.available = 1 then m.root_id end),
                  min(m.root_id)
                ) as root_id
         from repository_catalog c
         join repository_catalog_roots m on m.repository_id = c.id
         join repository_roots r on r.id = m.root_id
         where r.enabled = 1
         group by c.id, c.path, c.name
         order by available desc, c.name collate nocase, c.path collate nocase`
      )
      .all() as RepositoryCatalogRow[]
  ).map(catalogFromRow);
}

export function countAvailableRepositoriesForRoot(
  db: DatabaseSync,
  rootId: string
): number {
  const row = db
    .prepare(
      `select count(*) as repository_count
       from repository_catalog_roots
       where root_id = ? and available = 1`
    )
    .get(rootId) as { readonly repository_count: number };

  return row.repository_count;
}

export function getRepositoryCatalogEntry(
  db: DatabaseSync,
  id: string
): RepositoryCatalogRecord | null {
  const row = db
    .prepare(
      `select c.id, c.path, c.name,
              max(m.last_seen_at) as last_seen_at,
              max(m.available) as available,
              coalesce(
                min(case when m.available = 1 then m.root_id end),
                min(m.root_id)
              ) as root_id
       from repository_catalog c
       join repository_catalog_roots m on m.repository_id = c.id
       join repository_roots r on r.id = m.root_id
       where c.id = ? and r.enabled = 1
       group by c.id, c.path, c.name`
    )
    .get(id) as RepositoryCatalogRow | undefined;

  return row ? catalogFromRow(row) : null;
}

export function repositoryCatalogId(repositoryPath: string): string {
  return createHash("sha256").update(path.normalize(repositoryPath)).digest("base64url");
}

type RepositoryRootRow = {
  readonly discovery_version: number;
  readonly enabled: number;
  readonly id: string;
  readonly last_scan_completed_at: string | null;
  readonly last_scan_error: string | null;
  readonly last_scan_started_at: string | null;
  readonly path: string;
};

type RepositoryCatalogRow = {
  readonly available: number;
  readonly id: string;
  readonly last_seen_at: string;
  readonly name: string;
  readonly path: string;
  readonly root_id: string;
};

function rootFromRow(row: RepositoryRootRow): RepositorySearchRootRecord {
  return {
    discoveryVersion: row.discovery_version,
    enabled: row.enabled === 1,
    id: row.id,
    ...(row.last_scan_completed_at
      ? { lastScanCompletedAt: row.last_scan_completed_at }
      : {}),
    ...(row.last_scan_error ? { lastScanError: row.last_scan_error } : {}),
    ...(row.last_scan_started_at ? { lastScanStartedAt: row.last_scan_started_at } : {}),
    path: row.path
  };
}

function catalogFromRow(row: RepositoryCatalogRow): RepositoryCatalogRecord {
  return {
    available: row.available === 1,
    id: row.id,
    lastSeenAt: row.last_seen_at,
    name: row.name,
    path: row.path,
    rootId: row.root_id
  };
}
