import { DatabaseSync } from "node:sqlite";

import {
  clearProjectWorktreeIdentity,
  deleteProject,
  getProject,
  getReviewTarget,
  listRecentProjects,
  updateProjectDefaultDiffTarget,
  upsertProject,
  upsertReviewTarget
} from "./project-store.js";
import {
  type ProjectRecord,
  type ReviewTargetRecord,
  type StoredProjectRecord,
  type StoredReviewTargetRecord,
  type CompanionDeviceInput,
  type CompanionDeviceRecord,
  type CreateReviewCommentInput,
  type ReviewCommentRecord,
  type ReviewMarkInput,
  type ReviewMarkRecord
} from "./records.js";
import {
  findCompanionDeviceByPublicKey,
  listCompanionDevices,
  revokeCompanionDevice,
  touchCompanionDeviceLastSeen,
  upsertCompanionDevice
} from "./companion-device-store.js";
import {
  createReviewComment,
  deleteReviewComment,
  getReviewComment,
  isReviewed,
  listReviewComments,
  listReviewMarks,
  markReviewed,
  unmarkReviewed,
  updateReviewComment
} from "./review-store.js";
import { runMigrations } from "./schema.js";
import {
  addRepositorySearchRoot,
  beginRepositoryRootScan,
  countAvailableRepositoriesForRoot,
  failRepositoryRootScan,
  getRepositoryCatalogEntry,
  listRepositoryCatalog,
  listRepositorySearchRoots,
  removeRepositorySearchRoot,
  replaceRepositoryCatalogForRoot,
  type RepositoryCatalogCandidate,
  type RepositoryCatalogRecord,
  type RepositorySearchRootRecord
} from "./repository-catalog-store.js";
import { type AppSettingsRecord, type ProjectSettingsRecord } from "./settings.js";
import {
  applyProjectTabOrder,
  appendProjectToTabOrder,
  getProjectTabOrder,
  initializeProjectTabs,
  removeProjectFromTabOrder,
  upsertProjectTabOrder
} from "./project-tab-order.js";
import {
  getAppSettings,
  getCompanionServerKeyPair,
  getProjectSettings,
  type CompanionServerKeyPairRecord,
  upsertAppSettings,
  upsertCompanionServerKeyPair,
  upsertProjectSettings
} from "./settings-store.js";

export {
  bootstrapStorageFromExistingProfile,
  replaceStorageFromExistingProfile
} from "./profile-bootstrap.js";

export {
  applyProjectTabOrder,
  parseStoredProjectTabOrder,
  sanitizeProjectTabOrder
} from "./project-tab-order.js";

export {
  type CompanionDeviceInput,
  type CompanionDeviceRecord,
  type CreateReviewCommentInput,
  type ProjectRecord,
  type ReviewCommentRecord,
  type ReviewCommentSide,
  type ReviewMarkInput,
  type ReviewMarkRecord,
  type ReviewTargetRecord,
  type StoredProjectRecord,
  type StoredReviewTargetRecord
} from "./records.js";

export {
  type AppSettingsRecord,
  type DiffMode,
  type EditorLaunchConfig,
  type ProjectSettingsRecord,
  type ReviewResetTrigger,
  type ThemeMode
} from "./settings.js";
export { type CompanionServerKeyPairRecord } from "./settings-store.js";
export type {
  RepositoryCatalogCandidate,
  RepositoryCatalogRecord,
  RepositorySearchRootRecord
} from "./repository-catalog-store.js";
export { repositoryDiscoveryVersion } from "./repository-catalog-store.js";

export type VerifyAndMarkReviewedInput = {
  readonly currentDiffHash: string;
  readonly displayedDiffHash: string;
  readonly path: string;
  readonly previousPath?: string;
  readonly projectId: string;
  readonly reviewTargetId: string;
};

export type VerifyAndMarkReviewedResult =
  | {
      readonly marked: false;
      readonly reason: "stale_diff";
    }
  | {
      readonly marked: true;
    };

export type VerifyAndUnmarkReviewedInput = {
  readonly currentDiffHash: string;
  readonly displayedDiffHash: string;
  readonly path: string;
  readonly reviewTargetId: string;
};

export type VerifyAndUnmarkReviewedResult =
  | {
      readonly reason: "stale_diff";
      readonly unmarked: false;
    }
  | {
      readonly unmarked: true;
    };

export type DifftrayStorage = {
  readonly addRepositorySearchRoot: (path: string) => RepositorySearchRootRecord;
  readonly beginRepositoryRootScan: (rootId: string) => void;
  readonly close: () => void;
  readonly closeProjectTab: (id: string) => void;
  readonly clearProjectWorktreeIdentity: (projectId: string) => void;
  readonly countAvailableRepositoriesForRoot: (rootId: string) => number;
  readonly createReviewComment: (input: CreateReviewCommentInput) => ReviewCommentRecord;
  readonly deleteReviewComment: (id: string) => boolean;
  readonly findCompanionDeviceByPublicKey: (
    publicKey: string
  ) => CompanionDeviceRecord | null;
  readonly getAppSettings: () => AppSettingsRecord;
  readonly getCompanionServerKeyPair: () => CompanionServerKeyPairRecord | null;
  readonly getProject: (id: string) => StoredProjectRecord | null;
  readonly getProjectByPath: (path: string) => StoredProjectRecord | null;
  readonly getProjectSettings: (projectId: string) => ProjectSettingsRecord;
  readonly getProjectTabOrder: () => readonly string[];
  readonly getReviewComment: (id: string) => ReviewCommentRecord | null;
  readonly getReviewTarget: (id: string) => StoredReviewTargetRecord | null;
  readonly forgetProject: (id: string) => void;
  readonly failRepositoryRootScan: (rootId: string, message: string) => void;
  readonly getRepositoryCatalogEntry: (id: string) => RepositoryCatalogRecord | null;
  readonly isReviewed: (
    reviewTargetId: string,
    path: string,
    currentDiffHash: string
  ) => boolean;
  readonly listCompanionDevices: () => readonly CompanionDeviceRecord[];
  readonly listKnownProjects: () => readonly StoredProjectRecord[];
  readonly listOpenProjects: () => readonly StoredProjectRecord[];
  readonly listRepositoryCatalog: () => readonly RepositoryCatalogRecord[];
  readonly listRepositorySearchRoots: () => readonly RepositorySearchRootRecord[];
  readonly listReviewComments: (reviewTargetId: string) => readonly ReviewCommentRecord[];
  readonly listRecentProjects: () => readonly StoredProjectRecord[];
  readonly listReviewMarks: (reviewTargetId: string) => readonly ReviewMarkRecord[];
  readonly markReviewed: (input: ReviewMarkInput) => void;
  readonly unmarkReviewed: (
    reviewTargetId: string,
    path: string,
    reviewedDiffHash: string
  ) => void;
  readonly updateProjectDefaultDiffTarget: (
    projectId: string,
    target:
      | {
          readonly mode: "branch";
          readonly ref: string;
        }
      | {
          readonly mode: "commit";
          readonly ref: string;
        }
      | {
          readonly mode: "working_tree";
        }
  ) => void;
  readonly updateReviewComment: (id: string, body: string) => ReviewCommentRecord | null;
  readonly appendProjectToTabOrder: (projectId: string) => void;
  readonly removeProjectFromTabOrder: (projectId: string) => void;
  readonly removeRepositorySearchRoot: (rootId: string) => void;
  readonly replaceRepositoryCatalogForRoot: (
    rootId: string,
    candidates: readonly RepositoryCatalogCandidate[]
  ) => void;
  readonly revokeCompanionDevice: (id: string) => void;
  readonly touchCompanionDeviceLastSeen: (id: string) => void;
  readonly upsertProject: (project: ProjectRecord) => void;
  readonly upsertAppSettings: (settings: AppSettingsRecord) => void;
  readonly upsertCompanionDevice: (device: CompanionDeviceInput) => void;
  readonly upsertCompanionServerKeyPair: (keyPair: CompanionServerKeyPairRecord) => void;
  readonly upsertProjectTabOrder: (projectIds: readonly string[]) => void;
  readonly upsertProjectSettings: (settings: ProjectSettingsRecord) => void;
  readonly upsertReviewTarget: (target: ReviewTargetRecord) => void;
  readonly verifyAndMarkReviewed: (
    input: VerifyAndMarkReviewedInput
  ) => VerifyAndMarkReviewedResult;
  readonly verifyAndUnmarkReviewed: (
    input: VerifyAndUnmarkReviewedInput
  ) => VerifyAndUnmarkReviewedResult;
};

export function openStorage(filename: string): DifftrayStorage {
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA foreign_keys = ON");
  runMigrations(db);
  initializeProjectTabs(db, listRecentProjects(db));

  return {
    addRepositorySearchRoot: (rootPath) => addRepositorySearchRoot(db, rootPath),
    beginRepositoryRootScan: (rootId) => beginRepositoryRootScan(db, rootId),
    close: () => {
      db.close();
    },
    closeProjectTab: (id) => {
      removeProjectFromTabOrder(db, id);
    },
    clearProjectWorktreeIdentity: (projectId) => {
      clearProjectWorktreeIdentity(db, projectId);
    },
    countAvailableRepositoriesForRoot: (rootId) =>
      countAvailableRepositoriesForRoot(db, rootId),
    createReviewComment: (input) => createReviewComment(db, input),
    deleteReviewComment: (id) => deleteReviewComment(db, id),
    findCompanionDeviceByPublicKey: (publicKey) =>
      findCompanionDeviceByPublicKey(db, publicKey),
    getAppSettings: () => getAppSettings(db),
    getCompanionServerKeyPair: () => getCompanionServerKeyPair(db),
    getProject: (id) => getProject(db, "id", id),
    getProjectByPath: (projectPath) => getProject(db, "path", projectPath),
    getProjectSettings: (projectId) => getProjectSettings(db, projectId),
    getProjectTabOrder: () => getProjectTabOrder(db),
    getReviewComment: (id) => getReviewComment(db, id),
    getReviewTarget: (id) => getReviewTarget(db, id),
    forgetProject: (id) => {
      db.exec("begin immediate");

      try {
        removeProjectFromTabOrder(db, id);
        deleteProject(db, id);
        db.exec("commit");
      } catch (error) {
        db.exec("rollback");
        throw error;
      }
    },
    failRepositoryRootScan: (rootId, message) =>
      failRepositoryRootScan(db, rootId, message),
    getRepositoryCatalogEntry: (id) => getRepositoryCatalogEntry(db, id),
    isReviewed: (reviewTargetId, filePath, currentDiffHash) =>
      isReviewed(db, reviewTargetId, filePath, currentDiffHash),
    listCompanionDevices: () => listCompanionDevices(db),
    listKnownProjects: () => listRecentProjects(db),
    listOpenProjects: () =>
      applyProjectTabOrder(listRecentProjects(db), getProjectTabOrder(db)),
    listRepositoryCatalog: () => listRepositoryCatalog(db),
    listRepositorySearchRoots: () => listRepositorySearchRoots(db),
    listReviewComments: (reviewTargetId) => listReviewComments(db, reviewTargetId),
    listRecentProjects: () => listRecentProjects(db),
    listReviewMarks: (reviewTargetId) => listReviewMarks(db, reviewTargetId),
    markReviewed: (input) => {
      markReviewed(db, input);
    },
    unmarkReviewed: (reviewTargetId, filePath, reviewedDiffHash) => {
      unmarkReviewed(db, reviewTargetId, filePath, reviewedDiffHash);
    },
    updateProjectDefaultDiffTarget: (projectId, target) => {
      updateProjectDefaultDiffTarget(db, projectId, target);
    },
    updateReviewComment: (id, body) => updateReviewComment(db, id, body),
    appendProjectToTabOrder: (projectId) => {
      appendProjectToTabOrder(db, projectId);
    },
    removeProjectFromTabOrder: (projectId) => {
      removeProjectFromTabOrder(db, projectId);
    },
    removeRepositorySearchRoot: (rootId) => removeRepositorySearchRoot(db, rootId),
    replaceRepositoryCatalogForRoot: (rootId, candidates) =>
      replaceRepositoryCatalogForRoot(db, rootId, candidates),
    revokeCompanionDevice: (id) => {
      revokeCompanionDevice(db, id);
    },
    touchCompanionDeviceLastSeen: (id) => {
      touchCompanionDeviceLastSeen(db, id);
    },
    upsertProject: (project) => {
      upsertProject(db, project);
    },
    upsertAppSettings: (settings) => {
      upsertAppSettings(db, settings);
    },
    upsertCompanionDevice: (device) => {
      upsertCompanionDevice(db, device);
    },
    upsertCompanionServerKeyPair: (keyPair) => {
      upsertCompanionServerKeyPair(db, keyPair);
    },
    upsertProjectTabOrder: (projectIds) => {
      upsertProjectTabOrder(db, projectIds);
    },
    upsertProjectSettings: (settings) => {
      upsertProjectSettings(db, settings);
    },
    upsertReviewTarget: (target) => {
      upsertReviewTarget(db, target);
    },
    verifyAndMarkReviewed: (input) => {
      if (input.currentDiffHash !== input.displayedDiffHash) {
        return {
          marked: false,
          reason: "stale_diff"
        };
      }

      markReviewed(db, {
        path: input.path,
        ...(input.previousPath ? { previousPath: input.previousPath } : {}),
        projectId: input.projectId,
        reviewedDiffHash: input.currentDiffHash,
        reviewTargetId: input.reviewTargetId
      });

      return { marked: true };
    },
    verifyAndUnmarkReviewed: (input) => {
      if (input.currentDiffHash !== input.displayedDiffHash) {
        return {
          reason: "stale_diff",
          unmarked: false
        };
      }

      unmarkReviewed(db, input.reviewTargetId, input.path, input.currentDiffHash);

      return { unmarked: true };
    }
  };
}
