import { DatabaseSync } from "node:sqlite";

import {
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
  type CreateReviewCommentInput,
  type ReviewCommentRecord,
  type ReviewMarkInput,
  type ReviewMarkRecord
} from "./records.js";
import {
  createReviewComment,
  deleteReviewComment,
  isReviewed,
  listReviewComments,
  listReviewMarks,
  markReviewed,
  unmarkReviewed,
  updateReviewComment
} from "./review-store.js";
import { runMigrations } from "./schema.js";
import { type AppSettingsRecord, type ProjectSettingsRecord } from "./settings.js";
import {
  appendProjectToTabOrder,
  getProjectTabOrder,
  removeProjectFromTabOrder,
  upsertProjectTabOrder
} from "./project-tab-order.js";
import {
  getAppSettings,
  getProjectSettings,
  upsertAppSettings,
  upsertProjectSettings
} from "./settings-store.js";

export {
  applyProjectTabOrder,
  parseStoredProjectTabOrder,
  sanitizeProjectTabOrder
} from "./project-tab-order.js";

export {
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
  readonly close: () => void;
  readonly createReviewComment: (input: CreateReviewCommentInput) => ReviewCommentRecord;
  readonly deleteProject: (id: string) => void;
  readonly deleteReviewComment: (id: string) => boolean;
  readonly getAppSettings: () => AppSettingsRecord;
  readonly getProject: (id: string) => StoredProjectRecord | null;
  readonly getProjectByPath: (path: string) => StoredProjectRecord | null;
  readonly getProjectSettings: (projectId: string) => ProjectSettingsRecord;
  readonly getProjectTabOrder: () => readonly string[];
  readonly getReviewTarget: (id: string) => StoredReviewTargetRecord | null;
  readonly isReviewed: (
    reviewTargetId: string,
    path: string,
    currentDiffHash: string
  ) => boolean;
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
  readonly upsertProject: (project: ProjectRecord) => void;
  readonly upsertAppSettings: (settings: AppSettingsRecord) => void;
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

  return {
    close: () => {
      db.close();
    },
    createReviewComment: (input) => createReviewComment(db, input),
    deleteProject: (id) => {
      deleteProject(db, id);
    },
    deleteReviewComment: (id) => deleteReviewComment(db, id),
    getAppSettings: () => getAppSettings(db),
    getProject: (id) => getProject(db, "id", id),
    getProjectByPath: (projectPath) => getProject(db, "path", projectPath),
    getProjectSettings: (projectId) => getProjectSettings(db, projectId),
    getProjectTabOrder: () => getProjectTabOrder(db),
    getReviewTarget: (id) => getReviewTarget(db, id),
    isReviewed: (reviewTargetId, filePath, currentDiffHash) =>
      isReviewed(db, reviewTargetId, filePath, currentDiffHash),
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
    upsertProject: (project) => {
      upsertProject(db, project);
    },
    upsertAppSettings: (settings) => {
      upsertAppSettings(db, settings);
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
