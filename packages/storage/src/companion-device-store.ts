import type { DatabaseSync } from "node:sqlite";

import type { CompanionDeviceInput, CompanionDeviceRecord } from "./records.js";
import { currentTimestamp } from "./timestamps.js";

type CompanionDeviceRow = {
  readonly created_at: string;
  readonly id: string;
  readonly last_seen_at: string | null;
  readonly name: string;
  readonly platform: string;
  readonly public_key: string;
  readonly revoked_at: string | null;
};

export function listCompanionDevices(db: DatabaseSync): readonly CompanionDeviceRecord[] {
  return (
    db
      .prepare(
        `
          select *
          from companion_devices
          order by created_at asc
        `
      )
      .all() as CompanionDeviceRow[]
  ).map(companionDeviceFromRow);
}

export function findCompanionDeviceByPublicKey(
  db: DatabaseSync,
  publicKey: string
): CompanionDeviceRecord | null {
  const row = db
    .prepare("select * from companion_devices where public_key = ?")
    .get(publicKey);

  return row ? companionDeviceFromRow(row as CompanionDeviceRow) : null;
}

export function revokeCompanionDevice(db: DatabaseSync, id: string): void {
  db.prepare(
    `
      update companion_devices
      set revoked_at = ?
      where id = ?
    `
  ).run(currentTimestamp(), id);
}

export function touchCompanionDeviceLastSeen(db: DatabaseSync, id: string): void {
  db.prepare(
    `
      update companion_devices
      set last_seen_at = ?
      where id = ?
    `
  ).run(currentTimestamp(), id);
}

export function upsertCompanionDevice(
  db: DatabaseSync,
  device: CompanionDeviceInput
): void {
  const now = currentTimestamp();

  db.prepare(
    `
      insert into companion_devices (
        id,
        name,
        platform,
        public_key,
        created_at,
        last_seen_at,
        revoked_at
      ) values (?, ?, ?, ?, ?, null, null)
      on conflict(id) do update set
        name = excluded.name,
        platform = excluded.platform,
        public_key = excluded.public_key,
        revoked_at = null
    `
  ).run(device.id, device.name, device.platform, device.publicKey, now);
}

function companionDeviceFromRow(row: CompanionDeviceRow): CompanionDeviceRecord {
  return {
    createdAt: row.created_at,
    id: row.id,
    ...(row.last_seen_at ? { lastSeenAt: row.last_seen_at } : {}),
    name: row.name,
    platform: row.platform,
    publicKey: row.public_key,
    ...(row.revoked_at ? { revokedAt: row.revoked_at } : {})
  };
}
