import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it, vi } from "vitest";

import { openStorage, type DifftrayStorage } from "../src/index.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  vi.useRealTimers();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function temporaryDatabasePath(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "difftray-learn-excerpt-"));
  temporaryDirectories.push(directory);
  return path.join(directory, "difftray.sqlite");
}

function seed(storage: DifftrayStorage): void {
  storage.upsertProject({ id: "p", name: "P", path: "/p" });
  storage.upsertReviewTarget({
    headKind: "working_tree",
    id: "t",
    mode: "working_tree",
    projectId: "p"
  });
}

function columnNames(filename: string, table: string): readonly string[] {
  const db = new DatabaseSync(filename);
  try {
    return (
      db.prepare(`pragma table_info(${table})`).all() as unknown as readonly {
        readonly name: string;
      }[]
    ).map((column) => column.name);
  } finally {
    db.close();
  }
}

function noteColumns(
  filename: string,
  scopeId: string
): { readonly body_saved_at: null | string; readonly excerpt_json: null | string } {
  const db = new DatabaseSync(filename);
  try {
    return db
      .prepare("select body_saved_at, excerpt_json from review_notes where scope_id = ?")
      .get(scopeId) as unknown as {
      readonly body_saved_at: null | string;
      readonly excerpt_json: null | string;
    };
  } finally {
    db.close();
  }
}

const lineInput = {
  body: "Check the bounds",
  diffHash: "h",
  lineEnd: 2,
  lineStart: 1,
  path: "src/a.ts",
  projectId: "p",
  reviewTargetId: "t",
  side: "additions" as const
};

const fileInput = {
  body: "Split this file",
  diffHash: "h",
  path: "src/a.ts",
  projectId: "p",
  reviewTargetId: "t"
};

describe("feedback excerpt columns", () => {
  it("adds excerpt_json to the feedback tables of an existing database", () => {
    const filename = temporaryDatabasePath();
    const original = openStorage(filename);
    seed(original);
    original.createReviewComment(lineInput);
    original.close();

    const legacy = new DatabaseSync(filename);
    legacy.exec("alter table review_comments drop column excerpt_json");
    legacy.exec("alter table review_file_comments drop column excerpt_json");
    legacy.exec("alter table review_notes drop column excerpt_json");
    legacy.exec("alter table review_notes drop column body_saved_at");
    legacy.close();
    expect(columnNames(filename, "review_comments")).not.toContain("excerpt_json");

    const migrated = openStorage(filename);
    expect(migrated.listReviewComments("t")).toEqual([
      expect.objectContaining({ body: lineInput.body, excerptJson: null })
    ]);
    migrated.close();

    expect(columnNames(filename, "review_comments")).toContain("excerpt_json");
    expect(columnNames(filename, "review_file_comments")).toContain("excerpt_json");
    expect(columnNames(filename, "review_notes")).toEqual(
      expect.arrayContaining(["excerpt_json", "body_saved_at"])
    );
  });

  it("stores and returns the excerpt of line and file comments", () => {
    const storage = openStorage(":memory:");
    seed(storage);

    const comment = storage.createReviewComment({
      ...lineInput,
      excerptJson: '{"v":1,"line":true}'
    });
    const fileComment = storage.createReviewFileComment({
      ...fileInput,
      excerptJson: '{"v":1,"file":true}'
    });

    expect(comment.excerptJson).toBe('{"v":1,"line":true}');
    expect(fileComment.excerptJson).toBe('{"v":1,"file":true}');
    expect(storage.getReviewComment(comment.id)?.excerptJson).toBe('{"v":1,"line":true}');
    expect(storage.listReviewFileComments("t")[0]?.excerptJson).toBe(
      '{"v":1,"file":true}'
    );
    storage.close();
  });

  it("stores null when the excerpt is omitted", () => {
    const storage = openStorage(":memory:");
    seed(storage);

    expect(storage.createReviewComment(lineInput).excerptJson).toBeNull();
    expect(storage.createReviewFileComment(fileInput).excerptJson).toBeNull();
    expect(
      storage.createReviewComment({ ...lineInput, excerptJson: null }).excerptJson
    ).toBeNull();
    storage.close();
  });

  it("keeps the stored excerpt when a comment body is edited", () => {
    const storage = openStorage(":memory:");
    seed(storage);
    const comment = storage.createReviewComment({ ...lineInput, excerptJson: "{}" });
    const fileComment = storage.createReviewFileComment({
      ...fileInput,
      excerptJson: "[]"
    });

    expect(storage.updateReviewComment(comment.id, "Edited")?.excerptJson).toBe("{}");
    expect(storage.updateReviewFileComment(fileComment.id, "Edited")?.excerptJson).toBe(
      "[]"
    );
    storage.close();
  });

  it("overwrites the note excerpt and body_saved_at on every body save only", () => {
    vi.useFakeTimers();
    const filename = temporaryDatabasePath();
    const storage = openStorage(filename);
    seed(storage);

    vi.setSystemTime(new Date("2026-11-01T10:00:00.000Z"));
    const saved = storage.saveReviewNote({
      body: "First",
      excerptJson: '{"paths":["a"]}',
      projectId: "p",
      scopeId: "scope"
    });
    expect(saved.excerptJson).toBe('{"paths":["a"]}');
    expect(noteColumns(filename, "scope")).toEqual({
      body_saved_at: "2026-11-01T10:00:00.000Z",
      excerpt_json: '{"paths":["a"]}'
    });

    vi.setSystemTime(new Date("2026-11-02T10:00:00.000Z"));
    expect(storage.setReviewNoteDismissed("scope", true)?.excerptJson).toBe(
      '{"paths":["a"]}'
    );
    vi.setSystemTime(new Date("2026-11-03T10:00:00.000Z"));
    storage.setReviewNoteDismissed("scope", false);
    expect(noteColumns(filename, "scope")).toEqual({
      body_saved_at: "2026-11-01T10:00:00.000Z",
      excerpt_json: '{"paths":["a"]}'
    });

    vi.setSystemTime(new Date("2026-11-04T10:00:00.000Z"));
    const resaved = storage.saveReviewNote({
      body: "Second",
      excerptJson: '{"paths":["b"]}',
      projectId: "p",
      scopeId: "scope"
    });
    expect(resaved.excerptJson).toBe('{"paths":["b"]}');
    expect(noteColumns(filename, "scope")).toEqual({
      body_saved_at: "2026-11-04T10:00:00.000Z",
      excerpt_json: '{"paths":["b"]}'
    });

    vi.setSystemTime(new Date("2026-11-05T10:00:00.000Z"));
    expect(
      storage.saveReviewNote({ body: "Third", projectId: "p", scopeId: "scope" })
        .excerptJson
    ).toBeNull();
    expect(noteColumns(filename, "scope")).toEqual({
      body_saved_at: "2026-11-05T10:00:00.000Z",
      excerpt_json: null
    });
    storage.close();
  });

  it("stores the excerpt of every agent batch item", () => {
    const storage = openStorage(":memory:");
    seed(storage);
    const actor = { kind: "agent" as const, name: "Reviewer", runId: "run-1" };

    storage.applyAgentFeedbackBatch({
      actor,
      items: [
        {
          body: "Line",
          diffHash: "h",
          excerptJson: '"line"',
          kind: "line",
          lineEnd: 1,
          lineStart: 1,
          path: "src/a.ts",
          side: "additions"
        },
        {
          body: "File",
          diffHash: "h",
          excerptJson: '"file"',
          kind: "file",
          path: "src/a.ts"
        },
        {
          body: "Line without excerpt",
          diffHash: "h",
          kind: "line",
          lineEnd: 3,
          lineStart: 3,
          path: "src/a.ts",
          side: "deletions"
        },
        {
          body: "Overall",
          excerptJson: '"note"',
          expectedNoteVersion: storage.getReviewNoteSnapshot("scope").token,
          kind: "overall"
        }
      ],
      noteScopeId: "scope",
      payloadHash: "hash",
      projectId: "p",
      requestId: "batch-1",
      reviewTargetId: "t"
    });

    const comments = storage.listReviewComments("t");
    expect(comments.find((comment) => comment.body === "Line")?.excerptJson).toBe(
      '"line"'
    );
    expect(
      comments.find((comment) => comment.body === "Line without excerpt")?.excerptJson
    ).toBeNull();
    expect(storage.listReviewFileComments("t")[0]?.excerptJson).toBe('"file"');
    expect(storage.getReviewNote("scope")?.excerptJson).toBe('"note"');
    storage.close();
  });
});
