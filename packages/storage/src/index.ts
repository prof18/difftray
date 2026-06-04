import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

import {
  deleteProject,
  getProject,
  getReviewTarget,
  listRecentProjects,
  updateProjectDefaultBaseRef,
  upsertProject,
  upsertReviewTarget
} from "./project-store.js";
import {
  type ProjectRecord,
  type ReviewTargetRecord,
  type StoredProjectRecord,
  type StoredReviewTargetRecord
} from "./records.js";
import {
  reviewCommentFromRow,
  reviewMarkFromRow,
  type ReviewCommentRow,
  type ReviewMarkRow
} from "./rows.js";
import { runMigrations } from "./schema.js";
import { type AppSettingsRecord, type ProjectSettingsRecord } from "./settings.js";
import {
  getAppSettings,
  getProjectSettings,
  upsertAppSettings,
  upsertProjectSettings
} from "./settings-store.js";
import { currentTimestamp } from "./timestamps.js";

export {
  type ProjectRecord,
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

export type ReviewMarkInput = {
  readonly path: string;
  readonly previousPath?: string;
  readonly projectId: string;
  readonly reviewedDiffHash: string;
  readonly reviewTargetId: string;
};

export type ReviewMarkRecord = {
  readonly path: string;
  readonly previousPath?: string;
  readonly reviewedDiffHash: string;
  readonly reviewTargetId: string;
};

export type ReviewCommentSide = "additions" | "deletions";

export type CreateReviewCommentInput = {
  readonly body: string;
  readonly diffHash: string;
  readonly lineEnd: number;
  readonly lineStart: number;
  readonly path: string;
  readonly previousPath?: string;
  readonly projectId: string;
  readonly reviewTargetId: string;
  readonly side: ReviewCommentSide;
};

export type ReviewCommentRecord = CreateReviewCommentInput & {
  readonly createdAt: string;
  readonly id: string;
  readonly updatedAt: string;
};

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
  readonly updateProjectDefaultBaseRef: (
    projectId: string,
    defaultBaseRef: string | undefined
  ) => void;
  readonly updateReviewComment: (id: string, body: string) => ReviewCommentRecord | null;
  readonly upsertProject: (project: ProjectRecord) => void;
  readonly upsertAppSettings: (settings: AppSettingsRecord) => void;
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
    updateProjectDefaultBaseRef: (projectId, defaultBaseRef) => {
      updateProjectDefaultBaseRef(db, projectId, defaultBaseRef);
    },
    updateReviewComment: (id, body) => updateReviewComment(db, id, body),
    upsertProject: (project) => {
      upsertProject(db, project);
    },
    upsertAppSettings: (settings) => {
      upsertAppSettings(db, settings);
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

function markReviewed(db: DatabaseSync, input: ReviewMarkInput): void {
  const now = currentTimestamp();
  const id = reviewMarkId(input);
  db.prepare(
    `
    insert into review_marks (
      id,
      project_id,
      review_target_id,
      path,
      previous_path,
      reviewed_diff_hash,
      reviewed_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(review_target_id, path, reviewed_diff_hash) do update set
      previous_path = excluded.previous_path,
      updated_at = excluded.updated_at
  `
  ).run(
    id,
    input.projectId,
    input.reviewTargetId,
    input.path,
    input.previousPath ?? null,
    input.reviewedDiffHash,
    now,
    now
  );
}

function unmarkReviewed(
  db: DatabaseSync,
  reviewTargetId: string,
  filePath: string,
  reviewedDiffHash: string
): void {
  db.prepare(
    `
      delete from review_marks
      where review_target_id = ?
        and path = ?
        and reviewed_diff_hash = ?
    `
  ).run(reviewTargetId, filePath, reviewedDiffHash);
}

function isReviewed(
  db: DatabaseSync,
  reviewTargetId: string,
  filePath: string,
  currentDiffHash: string
): boolean {
  const row = db
    .prepare(
      `
        select 1 as found
        from review_marks
        where review_target_id = ?
          and path = ?
          and reviewed_diff_hash = ?
        limit 1
      `
    )
    .get(reviewTargetId, filePath, currentDiffHash);

  return row !== undefined;
}

function listReviewMarks(
  db: DatabaseSync,
  reviewTargetId: string
): readonly ReviewMarkRecord[] {
  const rows = db
    .prepare(
      `
        select path, previous_path, reviewed_diff_hash, review_target_id
        from review_marks
        where review_target_id = ?
        order by path asc, reviewed_at desc
      `
    )
    .all(reviewTargetId);

  return rows.map((row) => reviewMarkFromRow(row as ReviewMarkRow));
}

function createReviewComment(
  db: DatabaseSync,
  input: CreateReviewCommentInput
): ReviewCommentRecord {
  const now = currentTimestamp();
  const id = randomUUID();
  const lineStart = normalizeLineNumber(input.lineStart);
  const lineEnd = Math.max(lineStart, normalizeLineNumber(input.lineEnd));

  db.prepare(
    `
    insert into review_comments (
      id,
      project_id,
      review_target_id,
      path,
      previous_path,
      diff_hash,
      side,
      line_start,
      line_end,
      body,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    id,
    input.projectId,
    input.reviewTargetId,
    input.path,
    input.previousPath ?? null,
    input.diffHash,
    input.side,
    lineStart,
    lineEnd,
    input.body,
    now,
    now
  );

  const comment = getReviewComment(db, id);

  if (!comment) {
    throw new Error("Review comment was not stored.");
  }

  return comment;
}

function updateReviewComment(
  db: DatabaseSync,
  id: string,
  body: string
): ReviewCommentRecord | null {
  const result = db
    .prepare(
      `
      update review_comments
      set body = ?,
          updated_at = ?
      where id = ?
    `
    )
    .run(body, currentTimestamp(), id);

  return result.changes > 0 ? getReviewComment(db, id) : null;
}

function deleteReviewComment(db: DatabaseSync, id: string): boolean {
  const result = db.prepare("delete from review_comments where id = ?").run(id);

  return result.changes > 0;
}

function listReviewComments(
  db: DatabaseSync,
  reviewTargetId: string
): readonly ReviewCommentRecord[] {
  const rows = db
    .prepare(
      `
        select *
        from review_comments
        where review_target_id = ?
        order by path asc, line_start asc, line_end asc, created_at asc
      `
    )
    .all(reviewTargetId);

  return rows.map((row) => reviewCommentFromRow(row as ReviewCommentRow));
}

function getReviewComment(db: DatabaseSync, id: string): ReviewCommentRecord | null {
  const row = db.prepare("select * from review_comments where id = ?").get(id);

  return row ? reviewCommentFromRow(row as ReviewCommentRow) : null;
}

function reviewMarkId(input: ReviewMarkInput): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        input.projectId,
        input.reviewTargetId,
        input.path,
        input.reviewedDiffHash
      ]),
      "utf8"
    )
    .digest("hex");
}

function normalizeLineNumber(value: number): number {
  return Math.max(1, Math.round(value));
}
