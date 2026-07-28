import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { backup, DatabaseSync } from "node:sqlite";

import { runMigrations } from "./schema.js";

const isolatedCompanionSettingKeys = [
  "companion_enabled",
  "companion_port",
  "companion_server_pk",
  "companion_server_sk"
] as const;

/**
 * Creates a sanitized, one-time copy of an existing Difftray profile database.
 * The destination is left untouched when it already exists.
 */
export async function bootstrapStorageFromExistingProfile(
  sourceFilename: string,
  destinationFilename: string
): Promise<boolean> {
  recoverInterruptedReplacement(destinationFilename);

  if (!existsSync(sourceFilename) || existsSync(destinationFilename)) {
    return false;
  }

  await writeSanitizedProfileCopy(sourceFilename, destinationFilename);
  return true;
}

export async function replaceStorageFromExistingProfile(
  sourceFilename: string,
  destinationFilename: string
): Promise<string | undefined> {
  recoverInterruptedReplacement(destinationFilename);

  if (!existsSync(sourceFilename)) {
    throw new Error(`Source storage does not exist: ${sourceFilename}`);
  }

  const backupFilename = existsSync(destinationFilename)
    ? `${destinationFilename}.backup-${String(Date.now())}-${randomUUID()}`
    : undefined;

  await writeSanitizedProfileCopy(sourceFilename, destinationFilename, backupFilename);
  return backupFilename;
}

function replacementRecoveryFilename(destinationFilename: string): string {
  return `${destinationFilename}.replace-in-progress`;
}

function recoverInterruptedReplacement(destinationFilename: string): void {
  const recoveryFilename = replacementRecoveryFilename(destinationFilename);
  if (!existsSync(recoveryFilename)) {
    return;
  }

  const backupFilename = readFileSync(recoveryFilename, "utf8");
  if (!backupFilename.startsWith(`${destinationFilename}.backup-`)) {
    throw new Error(`Invalid storage replacement recovery file: ${recoveryFilename}`);
  }

  if (!existsSync(destinationFilename)) {
    if (!existsSync(backupFilename)) {
      throw new Error(`Storage replacement backup is missing: ${backupFilename}`);
    }
    renameSync(backupFilename, destinationFilename);
  }

  if (existsSync(destinationFilename)) {
    unlinkSync(recoveryFilename);
  }
}

async function writeSanitizedProfileCopy(
  sourceFilename: string,
  destinationFilename: string,
  backupFilename?: string
): Promise<void> {
  const temporaryFilename = `${destinationFilename}.bootstrap-${randomUUID()}`;

  try {
    const source = new DatabaseSync(sourceFilename, { readOnly: true });

    try {
      await backup(source, temporaryFilename);
    } finally {
      source.close();
    }

    const sanitized = new DatabaseSync(temporaryFilename);

    try {
      sanitized.exec("PRAGMA foreign_keys = ON");
      runMigrations(sanitized);

      sanitized.exec("BEGIN IMMEDIATE");
      try {
        sanitized.exec("DELETE FROM companion_devices");
        const deleteSetting = sanitized.prepare("DELETE FROM app_settings WHERE key = ?");
        for (const key of isolatedCompanionSettingKeys) {
          deleteSetting.run(key);
        }
        sanitized.exec("COMMIT");
      } catch (error) {
        sanitized.exec("ROLLBACK");
        throw error;
      }
    } finally {
      sanitized.close();
    }

    if (backupFilename) {
      writeFileSync(
        replacementRecoveryFilename(destinationFilename),
        backupFilename,
        "utf8"
      );
      renameSync(destinationFilename, backupFilename);
    }

    try {
      renameSync(temporaryFilename, destinationFilename);
    } catch (error) {
      if (backupFilename && existsSync(backupFilename)) {
        renameSync(backupFilename, destinationFilename);
      }
      throw error;
    }

    if (backupFilename) {
      unlinkSync(replacementRecoveryFilename(destinationFilename));
    }
  } finally {
    if (existsSync(temporaryFilename)) {
      unlinkSync(temporaryFilename);
    }
  }
}
