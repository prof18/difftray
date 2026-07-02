import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import {
  openStorage,
  type ProjectRecord,
  type ReviewTargetRecord
} from "../src/index.js";

const project = {
  id: "project-1",
  name: "Difftray",
  path: "/tmp/difftray"
} satisfies ProjectRecord;

const reviewTarget = {
  headKind: "working_tree",
  headRefName: "main",
  headRefSha: "1111111111111111111111111111111111111111",
  id: "target-1",
  mode: "working_tree",
  projectId: project.id
} satisfies ReviewTargetRecord;

describe("storage", () => {
  it("creates and retrieves projects", () => {
    const storage = openStorage(":memory:");

    storage.upsertProject(project);

    expect(storage.getProject(project.id)).toEqual(
      expect.objectContaining({
        id: project.id,
        name: project.name,
        path: project.path
      })
    );
    expect(storage.getProjectByPath(project.path)).toEqual(
      expect.objectContaining({ id: project.id })
    );
    storage.close();
  });

  it("persists a project default base ref", () => {
    const storage = openStorage(":memory:");

    storage.upsertProject({
      ...project,
      defaultBaseRef: "main",
      defaultDiffTargetMode: "branch"
    });

    expect(storage.getProject(project.id)).toEqual(
      expect.objectContaining({
        defaultBaseRef: "main",
        defaultDiffTargetMode: "branch",
        id: project.id
      })
    );
    storage.close();
  });

  it("infers branch target mode from a project default base ref", () => {
    const storage = openStorage(":memory:");

    storage.upsertProject({
      ...project,
      defaultBaseRef: "main"
    });

    expect(storage.getProject(project.id)).toEqual(
      expect.objectContaining({
        defaultBaseRef: "main",
        defaultDiffTargetMode: "branch",
        id: project.id
      })
    );
    storage.close();
  });

  it("infers commit target mode from a project default commit ref", () => {
    const storage = openStorage(":memory:");

    storage.upsertProject({
      ...project,
      defaultCommitRef: "abc123"
    });

    expect(storage.getProject(project.id)).toEqual(
      expect.objectContaining({
        defaultCommitRef: "abc123",
        defaultDiffTargetMode: "commit",
        id: project.id
      })
    );
    storage.close();
  });

  it("preserves the default base ref when reopening a project", () => {
    const storage = openStorage(":memory:");

    storage.upsertProject({
      ...project,
      defaultBaseRef: "main",
      defaultDiffTargetMode: "branch"
    });
    storage.upsertProject({
      ...project,
      lastOpenedAt: "2026-01-01T00:00:00.000Z"
    });

    expect(storage.getProject(project.id)).toEqual(
      expect.objectContaining({
        defaultBaseRef: "main",
        defaultDiffTargetMode: "branch",
        lastOpenedAt: "2026-01-01T00:00:00.000Z"
      })
    );
    storage.close();
  });

  it("updates and clears a project default branch target", () => {
    const storage = openStorage(":memory:");
    storage.upsertProject(project);

    storage.updateProjectDefaultDiffTarget(project.id, {
      mode: "branch",
      ref: "origin/main"
    });

    expect(storage.getProject(project.id)).toEqual(
      expect.objectContaining({
        defaultBaseRef: "origin/main",
        defaultDiffTargetMode: "branch"
      })
    );

    storage.updateProjectDefaultDiffTarget(project.id, { mode: "working_tree" });

    expect(storage.getProject(project.id)).toEqual(
      expect.objectContaining({
        defaultDiffTargetMode: "working_tree"
      })
    );
    expect(storage.getProject(project.id)).toEqual(
      expect.not.objectContaining({ defaultBaseRef: expect.any(String) })
    );
    storage.close();
  });

  it("updates a project default commit target", () => {
    const storage = openStorage(":memory:");
    storage.upsertProject(project);

    storage.updateProjectDefaultDiffTarget(project.id, {
      mode: "commit",
      ref: "abc123"
    });

    expect(storage.getProject(project.id)).toEqual(
      expect.objectContaining({
        defaultCommitRef: "abc123",
        defaultDiffTargetMode: "commit"
      })
    );
    storage.close();
  });

  it("lists recent projects by last open time", () => {
    const storage = openStorage(":memory:");

    storage.upsertProject({
      id: "older-project",
      lastOpenedAt: "2026-01-01T00:00:00.000Z",
      name: "Older",
      path: "/tmp/older"
    });
    storage.upsertProject({
      id: "newer-project",
      lastOpenedAt: "2026-01-02T00:00:00.000Z",
      name: "Newer",
      path: "/tmp/newer"
    });

    expect(storage.listRecentProjects()).toEqual([
      expect.objectContaining({ id: "newer-project" }),
      expect.objectContaining({ id: "older-project" })
    ]);
    storage.close();
  });

  it("deletes projects and cascades project-owned records", () => {
    const storage = openStorage(":memory:");
    storage.upsertProject(project);
    storage.upsertReviewTarget(reviewTarget);
    storage.upsertProjectSettings({
      fileListCollapsed: false,
      fileListWidth: 340,
      projectId: project.id
    });
    storage.markReviewed({
      path: "src/app.ts",
      projectId: project.id,
      reviewedDiffHash: "hash-a",
      reviewTargetId: reviewTarget.id
    });
    storage.createReviewComment({
      body: "Needs a regression test.",
      diffHash: "hash-a",
      lineEnd: 12,
      lineStart: 12,
      path: "src/app.ts",
      projectId: project.id,
      reviewTargetId: reviewTarget.id,
      side: "additions"
    });

    storage.deleteProject(project.id);

    expect(storage.getProject(project.id)).toBeNull();
    expect(storage.listRecentProjects()).toEqual([]);
    expect(storage.getReviewTarget(reviewTarget.id)).toBeNull();
    expect(storage.listReviewMarks(reviewTarget.id)).toEqual([]);
    expect(storage.listReviewComments(reviewTarget.id)).toEqual([]);
    expect(storage.getProjectSettings(project.id)).toEqual(
      expect.objectContaining({
        fileListCollapsed: false,
        fileListWidth: 340,
        projectId: project.id
      })
    );
    storage.close();
  });

  it("creates and lists review comments for a review target", () => {
    const storage = openStorage(":memory:");
    storage.upsertProject(project);
    storage.upsertReviewTarget(reviewTarget);

    const comment = storage.createReviewComment({
      body: "Validate this before saving.",
      diffHash: "hash-a",
      lineEnd: 18,
      lineStart: 18,
      path: "src/app.ts",
      previousPath: "src/old-app.ts",
      projectId: project.id,
      reviewTargetId: reviewTarget.id,
      side: "additions"
    });

    expect(comment).toEqual(
      expect.objectContaining({
        body: "Validate this before saving.",
        diffHash: "hash-a",
        lineEnd: 18,
        lineStart: 18,
        path: "src/app.ts",
        previousPath: "src/old-app.ts",
        projectId: project.id,
        reviewTargetId: reviewTarget.id,
        side: "additions"
      })
    );
    expect(comment.id).toEqual(expect.any(String));
    expect(comment.createdAt).toEqual(expect.any(String));
    expect(comment.updatedAt).toEqual(expect.any(String));
    expect(storage.listReviewComments(reviewTarget.id)).toEqual([comment]);
    storage.close();
  });

  it("updates and deletes review comments", () => {
    const storage = openStorage(":memory:");
    storage.upsertProject(project);
    storage.upsertReviewTarget(reviewTarget);
    const comment = storage.createReviewComment({
      body: "Original comment.",
      diffHash: "hash-a",
      lineEnd: 7,
      lineStart: 7,
      path: "src/app.ts",
      projectId: project.id,
      reviewTargetId: reviewTarget.id,
      side: "deletions"
    });

    const updatedComment = storage.updateReviewComment(comment.id, "Updated comment.");

    expect(updatedComment).toEqual({
      ...comment,
      body: "Updated comment.",
      updatedAt: expect.any(String)
    });
    expect(storage.updateReviewComment("missing-comment", "No-op")).toBeNull();

    storage.deleteReviewComment(comment.id);

    expect(storage.listReviewComments(reviewTarget.id)).toEqual([]);
    expect(storage.deleteReviewComment("missing-comment")).toBe(false);
    storage.close();
  });

  it("upserts review targets", () => {
    const storage = openStorage(":memory:");
    storage.upsertProject(project);

    storage.upsertReviewTarget(reviewTarget);
    storage.upsertReviewTarget({
      ...reviewTarget,
      headRefSha: "2222222222222222222222222222222222222222"
    });

    expect(storage.getReviewTarget(reviewTarget.id)).toEqual(
      expect.objectContaining({
        headRefSha: "2222222222222222222222222222222222222222",
        id: reviewTarget.id
      })
    );
    storage.close();
  });

  it("upserts commit review targets", () => {
    const storage = openStorage(":memory:");
    storage.upsertProject(project);

    storage.upsertReviewTarget({
      commitSha: "2222222222222222222222222222222222222222",
      commitShortSha: "2222222",
      commitSubject: "Change focused file",
      headKind: "ref",
      headRefSha: "2222222222222222222222222222222222222222",
      id: "target-commit",
      mode: "commit",
      parentSha: "1111111111111111111111111111111111111111",
      projectId: project.id
    });

    expect(storage.getReviewTarget("target-commit")).toEqual(
      expect.objectContaining({
        commitSha: "2222222222222222222222222222222222222222",
        commitShortSha: "2222222",
        commitSubject: "Change focused file",
        mode: "commit",
        parentSha: "1111111111111111111111111111111111111111"
      })
    );
    storage.close();
  });

  it("marks and resolves reviewed diff hashes", () => {
    const storage = openStorage(":memory:");
    storage.upsertProject(project);
    storage.upsertReviewTarget(reviewTarget);

    storage.markReviewed({
      path: "src/app.ts",
      projectId: project.id,
      reviewedDiffHash: "hash-a",
      reviewTargetId: reviewTarget.id
    });

    expect(storage.isReviewed(reviewTarget.id, "src/app.ts", "hash-a")).toBe(true);
    expect(storage.isReviewed(reviewTarget.id, "src/app.ts", "hash-b")).toBe(false);
    expect(storage.listReviewMarks(reviewTarget.id)).toEqual([
      {
        path: "src/app.ts",
        reviewedDiffHash: "hash-a",
        reviewTargetId: reviewTarget.id
      }
    ]);
    storage.close();
  });

  it("allows an old reviewed hash to become reviewed again", () => {
    const storage = openStorage(":memory:");
    storage.upsertProject(project);
    storage.upsertReviewTarget(reviewTarget);

    storage.markReviewed({
      path: "src/app.ts",
      projectId: project.id,
      reviewedDiffHash: "hash-a",
      reviewTargetId: reviewTarget.id
    });
    storage.markReviewed({
      path: "src/app.ts",
      projectId: project.id,
      reviewedDiffHash: "hash-b",
      reviewTargetId: reviewTarget.id
    });

    expect(storage.isReviewed(reviewTarget.id, "src/app.ts", "hash-a")).toBe(true);
    expect(storage.isReviewed(reviewTarget.id, "src/app.ts", "hash-b")).toBe(true);
    storage.close();
  });

  it("unmarks a reviewed diff hash", () => {
    const storage = openStorage(":memory:");
    storage.upsertProject(project);
    storage.upsertReviewTarget(reviewTarget);

    storage.markReviewed({
      path: "src/app.ts",
      projectId: project.id,
      reviewedDiffHash: "hash-a",
      reviewTargetId: reviewTarget.id
    });
    storage.unmarkReviewed(reviewTarget.id, "src/app.ts", "hash-a");

    expect(storage.isReviewed(reviewTarget.id, "src/app.ts", "hash-a")).toBe(false);
    expect(storage.listReviewMarks(reviewTarget.id)).toEqual([]);
    storage.close();
  });

  it("rejects stale displayed hashes when unmarking reviewed", () => {
    const storage = openStorage(":memory:");
    storage.upsertProject(project);
    storage.upsertReviewTarget(reviewTarget);
    storage.markReviewed({
      path: "src/app.ts",
      projectId: project.id,
      reviewedDiffHash: "new-hash",
      reviewTargetId: reviewTarget.id
    });

    const result = storage.verifyAndUnmarkReviewed({
      currentDiffHash: "new-hash",
      displayedDiffHash: "old-hash",
      path: "src/app.ts",
      reviewTargetId: reviewTarget.id
    });

    expect(result).toEqual({ unmarked: false, reason: "stale_diff" });
    expect(storage.isReviewed(reviewTarget.id, "src/app.ts", "new-hash")).toBe(true);
    storage.close();
  });

  it("unmarks reviewed when displayed and current hashes match", () => {
    const storage = openStorage(":memory:");
    storage.upsertProject(project);
    storage.upsertReviewTarget(reviewTarget);
    storage.markReviewed({
      path: "src/app.ts",
      projectId: project.id,
      reviewedDiffHash: "hash-a",
      reviewTargetId: reviewTarget.id
    });

    const result = storage.verifyAndUnmarkReviewed({
      currentDiffHash: "hash-a",
      displayedDiffHash: "hash-a",
      path: "src/app.ts",
      reviewTargetId: reviewTarget.id
    });

    expect(result).toEqual({ unmarked: true });
    expect(storage.isReviewed(reviewTarget.id, "src/app.ts", "hash-a")).toBe(false);
    storage.close();
  });

  it("rejects stale displayed hashes when marking reviewed", () => {
    const storage = openStorage(":memory:");
    storage.upsertProject(project);
    storage.upsertReviewTarget(reviewTarget);

    const result = storage.verifyAndMarkReviewed({
      currentDiffHash: "new-hash",
      displayedDiffHash: "old-hash",
      path: "src/app.ts",
      projectId: project.id,
      reviewTargetId: reviewTarget.id
    });

    expect(result).toEqual({ marked: false, reason: "stale_diff" });
    expect(storage.isReviewed(reviewTarget.id, "src/app.ts", "old-hash")).toBe(false);
    expect(storage.isReviewed(reviewTarget.id, "src/app.ts", "new-hash")).toBe(false);
    storage.close();
  });

  it("stores the current hash when displayed and current hashes match", () => {
    const storage = openStorage(":memory:");
    storage.upsertProject(project);
    storage.upsertReviewTarget(reviewTarget);

    const result = storage.verifyAndMarkReviewed({
      currentDiffHash: "hash-a",
      displayedDiffHash: "hash-a",
      path: "src/app.ts",
      projectId: project.id,
      reviewTargetId: reviewTarget.id
    });

    expect(result).toEqual({ marked: true });
    expect(storage.isReviewed(reviewTarget.id, "src/app.ts", "hash-a")).toBe(true);
    storage.close();
  });

  it("returns default project settings when no settings are stored", () => {
    const storage = openStorage(":memory:");
    storage.upsertProject(project);

    expect(storage.getProjectSettings(project.id)).toEqual({
      fileListCollapsed: false,
      fileListWidth: 340,
      projectId: project.id
    });
    storage.close();
  });

  it("persists project layout settings", () => {
    const storage = openStorage(":memory:");
    storage.upsertProject(project);

    storage.upsertProjectSettings({
      fileListCollapsed: true,
      fileListWidth: 420,
      projectId: project.id
    });

    expect(storage.getProjectSettings(project.id)).toEqual({
      fileListCollapsed: true,
      fileListWidth: 420,
      projectId: project.id
    });
    storage.close();
  });

  it("returns default app settings when no app settings are stored", () => {
    const storage = openStorage(":memory:");

    expect(storage.getAppSettings()).toEqual({
      autoCollapseHunksOver: 120,
      defaultDiffMode: "split",
      hideWhitespaceOnlyChanges: false,
      notifyOnDrift: true,
      reviewResetTrigger: "diff_content",
      showGeneratedFiles: false,
      themeMode: "system",
      wrapDiffLines: true
    });
    storage.close();
  });

  it("persists app settings", () => {
    const storage = openStorage(":memory:");

    storage.upsertAppSettings({
      autoCollapseHunksOver: 200,
      defaultDiffMode: "unified",
      editorLaunchConfig: {
        args: ["--goto", "{path}:{line}"],
        command: "code"
      },
      hideWhitespaceOnlyChanges: true,
      notifyOnDrift: false,
      reviewResetTrigger: "line_count",
      showGeneratedFiles: true,
      themeMode: "light",
      wrapDiffLines: false
    });

    expect(storage.getAppSettings()).toEqual({
      autoCollapseHunksOver: 200,
      defaultDiffMode: "unified",
      editorLaunchConfig: {
        args: ["--goto", "{path}:{line}"],
        command: "code"
      },
      hideWhitespaceOnlyChanges: true,
      notifyOnDrift: false,
      reviewResetTrigger: "line_count",
      showGeneratedFiles: true,
      themeMode: "light",
      wrapDiffLines: false
    });
    storage.close();
  });

  it("ignores malformed stored editor launch configs", () => {
    const storageDir = mkdtempSync(path.join(tmpdir(), "difftray-storage-"));
    const storagePath = path.join(storageDir, "difftray.sqlite");

    try {
      const storage = openStorage(storagePath);
      storage.upsertAppSettings({
        autoCollapseHunksOver: 120,
        defaultDiffMode: "split",
        editorLaunchConfig: {
          args: ["{path}"],
          command: "open"
        },
        hideWhitespaceOnlyChanges: false,
        notifyOnDrift: true,
        reviewResetTrigger: "diff_content",
        showGeneratedFiles: false,
        themeMode: "system",
        wrapDiffLines: true
      });
      storage.close();

      const db = new DatabaseSync(storagePath);
      db.prepare("update app_settings set value = ? where key = ?").run(
        "{not-json",
        "editor_launch_config_json"
      );
      db.close();

      const reopenedStorage = openStorage(storagePath);

      expect(reopenedStorage.getAppSettings()).toEqual({
        autoCollapseHunksOver: 120,
        defaultDiffMode: "split",
        hideWhitespaceOnlyChanges: false,
        notifyOnDrift: true,
        reviewResetTrigger: "diff_content",
        showGeneratedFiles: false,
        themeMode: "system",
        wrapDiffLines: true
      });
      reopenedStorage.close();
    } finally {
      rmSync(storageDir, { force: true, recursive: true });
    }
  });

  it("uses the latest customized legacy project review settings as app defaults", () => {
    const storageDir = mkdtempSync(path.join(tmpdir(), "difftray-storage-"));
    const storagePath = path.join(storageDir, "difftray.sqlite");
    const secondProject = {
      id: "project-2",
      name: "Second",
      path: "/tmp/second"
    } satisfies ProjectRecord;
    const thirdProject = {
      id: "project-3",
      name: "Third",
      path: "/tmp/third"
    } satisfies ProjectRecord;

    try {
      const storage = openStorage(storagePath);
      storage.upsertProject(project);
      storage.upsertProject(secondProject);
      storage.upsertProject(thirdProject);
      storage.close();

      const db = new DatabaseSync(storagePath);
      const insertSettings = db.prepare(`
        insert into project_settings (
          project_id,
          show_generated_files,
          editor_launch_config_json,
          file_list_width,
          file_list_collapsed,
          default_diff_mode,
          hide_whitespace_only_changes,
          auto_collapse_hunks_over,
          notify_on_drift,
          review_reset_trigger,
          updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      insertSettings.run(
        project.id,
        0,
        null,
        340,
        0,
        "split",
        0,
        120,
        1,
        "diff_content",
        "2026-01-01T00:00:00.000Z"
      );
      insertSettings.run(
        secondProject.id,
        1,
        JSON.stringify({ args: ["--goto", "{path}:{line}"], command: "code" }),
        420,
        1,
        "unified",
        1,
        300,
        0,
        "commit_sha",
        "2026-01-02T00:00:00.000Z"
      );
      insertSettings.run(
        thirdProject.id,
        0,
        null,
        460,
        0,
        "split",
        0,
        120,
        1,
        "diff_content",
        "2026-01-03T00:00:00.000Z"
      );
      db.close();

      const reopenedStorage = openStorage(storagePath);

      expect(reopenedStorage.getAppSettings()).toEqual({
        autoCollapseHunksOver: 300,
        defaultDiffMode: "unified",
        editorLaunchConfig: {
          args: ["--goto", "{path}:{line}"],
          command: "code"
        },
        hideWhitespaceOnlyChanges: true,
        notifyOnDrift: false,
        reviewResetTrigger: "commit_sha",
        showGeneratedFiles: true,
        themeMode: "system",
        wrapDiffLines: true
      });
      reopenedStorage.close();
    } finally {
      rmSync(storageDir, { force: true, recursive: true });
    }
  });

  it("persists companion devices and looks them up by public key", () => {
    const storageDir = mkdtempSync(path.join(tmpdir(), "difftray-storage-"));
    const storagePath = path.join(storageDir, "difftray.sqlite");

    try {
      const storage = openStorage(storagePath);
      storage.upsertCompanionDevice({
        id: "device-1",
        name: "Marco's iPhone",
        platform: "ios",
        publicKey: "device-public-key-1"
      });
      storage.close();

      const reopenedStorage = openStorage(storagePath);

      expect(reopenedStorage.listCompanionDevices()).toEqual([
        expect.objectContaining({
          id: "device-1",
          name: "Marco's iPhone",
          platform: "ios",
          publicKey: "device-public-key-1"
        })
      ]);
      expect(
        reopenedStorage.findCompanionDeviceByPublicKey("device-public-key-1")
      ).toEqual(
        expect.objectContaining({
          id: "device-1",
          name: "Marco's iPhone"
        })
      );
      expect(reopenedStorage.findCompanionDeviceByPublicKey("missing")).toBeNull();
      reopenedStorage.close();
    } finally {
      rmSync(storageDir, { force: true, recursive: true });
    }
  });

  it("updates companion device metadata, last-seen timestamps, and revocation", () => {
    const storage = openStorage(":memory:");

    storage.upsertCompanionDevice({
      id: "device-1",
      name: "Marco's iPhone",
      platform: "ios",
      publicKey: "device-public-key-1"
    });
    storage.upsertCompanionDevice({
      id: "device-1",
      name: "Marco's iPhone 17",
      platform: "ios",
      publicKey: "device-public-key-1"
    });
    storage.touchCompanionDeviceLastSeen("device-1");
    storage.revokeCompanionDevice("device-1");

    const device = storage.findCompanionDeviceByPublicKey("device-public-key-1");

    expect(device).toEqual(
      expect.objectContaining({
        id: "device-1",
        lastSeenAt: expect.any(String) as string,
        name: "Marco's iPhone 17",
        platform: "ios",
        publicKey: "device-public-key-1",
        revokedAt: expect.any(String) as string
      })
    );
    expect(storage.listCompanionDevices()).toEqual([device]);
    storage.close();
  });

  it("persists the companion server keypair in app settings", () => {
    const storageDir = mkdtempSync(path.join(tmpdir(), "difftray-storage-"));
    const storagePath = path.join(storageDir, "difftray.sqlite");

    try {
      const storage = openStorage(storagePath);
      expect(storage.getCompanionServerKeyPair()).toBeNull();

      storage.upsertCompanionServerKeyPair({
        publicKey: "server-public-key",
        secretKey: "server-secret-key"
      });
      storage.close();

      const reopenedStorage = openStorage(storagePath);

      expect(reopenedStorage.getCompanionServerKeyPair()).toEqual({
        publicKey: "server-public-key",
        secretKey: "server-secret-key"
      });
      reopenedStorage.close();
    } finally {
      rmSync(storageDir, { force: true, recursive: true });
    }
  });
});
