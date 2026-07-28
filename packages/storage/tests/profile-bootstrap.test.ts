import { existsSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  bootstrapStorageFromExistingProfile,
  openStorage,
  replaceStorageFromExistingProfile
} from "../src/index.js";

describe("profile storage bootstrap", () => {
  it("copies review data and preferences without companion identity or devices", async () => {
    const storageDir = mkdtempSync(path.join(tmpdir(), "difftray-bootstrap-"));
    const sourcePath = path.join(storageDir, "production.sqlite");
    const destinationPath = path.join(storageDir, "dev.sqlite");

    try {
      const source = openStorage(sourcePath);
      source.upsertProject({
        id: "project-1",
        name: "Difftray",
        path: "/tmp/difftray"
      });
      source.upsertProjectTabOrder(["project-1"]);
      source.upsertReviewTarget({
        headKind: "working_tree",
        headRefName: "main",
        headRefSha: "1111111111111111111111111111111111111111",
        id: "target-1",
        mode: "working_tree",
        projectId: "project-1"
      });
      source.markReviewed({
        path: "src/app.ts",
        projectId: "project-1",
        reviewedDiffHash: "diff-hash",
        reviewTargetId: "target-1"
      });
      source.createReviewComment({
        body: "Keep this review note.",
        diffHash: "diff-hash",
        lineEnd: 12,
        lineStart: 12,
        path: "src/app.ts",
        projectId: "project-1",
        reviewTargetId: "target-1",
        side: "additions"
      });
      source.upsertAppSettings({
        autoCollapseHunksOver: 240,
        companionEnabled: true,
        companionPort: 48627,
        defaultDiffMode: "unified",
        hideWhitespaceOnlyChanges: true,
        notifyOnDrift: false,
        reviewResetTrigger: "line_count",
        showGeneratedFiles: true,
        themeMode: "dark",
        wrapDiffLines: false
      });
      source.upsertCompanionServerKeyPair({
        publicKey: "production-public-key",
        secretKey: "production-secret-key"
      });
      source.upsertCompanionDevice({
        id: "device-1",
        name: "Production phone",
        platform: "ios",
        publicKey: "phone-public-key"
      });
      source.close();

      await expect(
        bootstrapStorageFromExistingProfile(sourcePath, destinationPath)
      ).resolves.toBe(true);

      const destination = openStorage(destinationPath);
      expect(destination.listRecentProjects()).toEqual([
        expect.objectContaining({ id: "project-1", path: "/tmp/difftray" })
      ]);
      expect(destination.getProjectTabOrder()).toEqual(["project-1"]);
      expect(destination.listReviewMarks("target-1")).toHaveLength(1);
      expect(destination.listReviewComments("target-1")).toEqual([
        expect.objectContaining({ body: "Keep this review note." })
      ]);
      expect(destination.getAppSettings()).toEqual(
        expect.objectContaining({
          companionEnabled: false,
          companionPort: 48620,
          defaultDiffMode: "unified",
          themeMode: "dark"
        })
      );
      expect(destination.getCompanionServerKeyPair()).toBeNull();
      expect(destination.listCompanionDevices()).toEqual([]);
      destination.close();

      const unchangedSource = openStorage(sourcePath);
      expect(unchangedSource.getCompanionServerKeyPair()).toEqual({
        publicKey: "production-public-key",
        secretKey: "production-secret-key"
      });
      expect(unchangedSource.listCompanionDevices()).toHaveLength(1);
      unchangedSource.close();
    } finally {
      rmSync(storageDir, { force: true, recursive: true });
    }
  });

  it("does not overwrite an existing destination or create one without a source", async () => {
    const storageDir = mkdtempSync(path.join(tmpdir(), "difftray-bootstrap-"));
    const missingSourcePath = path.join(storageDir, "missing.sqlite");
    const destinationPath = path.join(storageDir, "dev.sqlite");

    try {
      await expect(
        bootstrapStorageFromExistingProfile(missingSourcePath, destinationPath)
      ).resolves.toBe(false);
      expect(existsSync(destinationPath)).toBe(false);

      const destination = openStorage(destinationPath);
      destination.upsertProject({
        id: "dev-project",
        name: "Dev project",
        path: "/tmp/dev-project"
      });
      destination.close();

      const source = openStorage(missingSourcePath);
      source.upsertProject({
        id: "production-project",
        name: "Production project",
        path: "/tmp/production-project"
      });
      source.close();

      await expect(
        bootstrapStorageFromExistingProfile(missingSourcePath, destinationPath)
      ).resolves.toBe(false);

      const unchangedDestination = openStorage(destinationPath);
      expect(unchangedDestination.getProject("dev-project")).not.toBeNull();
      expect(unchangedDestination.getProject("production-project")).toBeNull();
      unchangedDestination.close();
    } finally {
      rmSync(storageDir, { force: true, recursive: true });
    }
  });

  it("replaces an existing destination while preserving it as a backup", async () => {
    const storageDir = mkdtempSync(path.join(tmpdir(), "difftray-bootstrap-"));
    const sourcePath = path.join(storageDir, "production.sqlite");
    const destinationPath = path.join(storageDir, "dev.sqlite");

    try {
      const source = openStorage(sourcePath);
      source.upsertProject({
        id: "production-project",
        name: "Production project",
        path: "/tmp/production-project"
      });
      source.close();

      const destination = openStorage(destinationPath);
      destination.upsertProject({
        id: "dev-project",
        name: "Dev project",
        path: "/tmp/dev-project"
      });
      destination.close();

      const backupFilename = await replaceStorageFromExistingProfile(
        sourcePath,
        destinationPath
      );

      expect(backupFilename).toEqual(expect.any(String));
      expect(existsSync(backupFilename as string)).toBe(true);

      const replacedDestination = openStorage(destinationPath);
      expect(replacedDestination.getProject("production-project")).not.toBeNull();
      expect(replacedDestination.getProject("dev-project")).toBeNull();
      replacedDestination.close();

      const backup = openStorage(backupFilename as string);
      expect(backup.getProject("dev-project")).not.toBeNull();
      expect(backup.getProject("production-project")).toBeNull();
      backup.close();
    } finally {
      rmSync(storageDir, { force: true, recursive: true });
    }
  });

  it("recovers Dev storage after an interrupted replacement before bootstrapping", async () => {
    const storageDir = mkdtempSync(path.join(tmpdir(), "difftray-bootstrap-"));
    const sourcePath = path.join(storageDir, "production.sqlite");
    const destinationPath = path.join(storageDir, "dev.sqlite");
    const backupPath = `${destinationPath}.backup-interrupted`;
    const recoveryPath = `${destinationPath}.replace-in-progress`;

    try {
      const source = openStorage(sourcePath);
      source.upsertProject({
        id: "production-project",
        name: "Production project",
        path: "/tmp/production-project"
      });
      source.close();

      const destination = openStorage(destinationPath);
      destination.upsertProject({
        id: "dev-project",
        name: "Dev project",
        path: "/tmp/dev-project"
      });
      destination.close();

      // Simulate a process crash immediately after the old Dev database moved aside.
      writeFileSync(recoveryPath, backupPath, "utf8");
      renameSync(destinationPath, backupPath);

      await expect(
        bootstrapStorageFromExistingProfile(sourcePath, destinationPath)
      ).resolves.toBe(false);

      expect(existsSync(recoveryPath)).toBe(false);
      const recoveredDestination = openStorage(destinationPath);
      expect(recoveredDestination.getProject("dev-project")).not.toBeNull();
      expect(recoveredDestination.getProject("production-project")).toBeNull();
      recoveredDestination.close();
    } finally {
      rmSync(storageDir, { force: true, recursive: true });
    }
  });
});
