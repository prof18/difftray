import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.useRealTimers());

import { getReviewNoteSnapshot } from "../src/review-note-revisions.js";
import {
  deleteReviewNote,
  saveReviewNote,
  setReviewNoteDismissed
} from "../src/review-store.js";
import { runMigrations } from "../src/schema.js";

function database(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  runMigrations(db);
  db.prepare(
    "insert into projects (id, name, path, created_at, updated_at) values ('project', 'Project', '/project', 'now', 'now')"
  ).run();
  return db;
}

function token(
  scopeId: string,
  revision: number,
  exists: boolean,
  body: string | null,
  dismissedAt: string | null
): string {
  return createHash("sha256")
    .update(JSON.stringify([scopeId, revision, exists, body, dismissedAt]), "utf8")
    .digest("hex");
}

describe("review note revisions", () => {
  it("migrates existing notes to revision one without resetting later revisions", () => {
    const db = database();
    db.exec("drop table review_note_revisions");
    db.prepare(
      `
      insert into review_notes (scope_id, project_id, body, dismissed_at, created_at, updated_at)
      values ('legacy', 'project', 'old note', null, 'now', 'now')
    `
    ).run();
    runMigrations(db);
    expect(getReviewNoteSnapshot(db, "legacy").revision).toBe(1);
    saveReviewNote(db, { scopeId: "legacy", projectId: "project", body: "edited" });
    runMigrations(db);
    expect(getReviewNoteSnapshot(db, "legacy").revision).toBe(2);
    db.close();
  });

  it("starts at zero and increments across save, dismiss, restore, delete, and recreate", () => {
    const db = database();
    expect(getReviewNoteSnapshot(db, "scope")).toEqual({
      note: null,
      revision: 0,
      token: token("scope", 0, false, null, null)
    });

    saveReviewNote(db, { scopeId: "scope", projectId: "project", body: "first" });
    const first = getReviewNoteSnapshot(db, "scope");
    expect(first).toEqual({
      note: expect.objectContaining({ body: "first" }),
      revision: 1,
      token: token("scope", 1, true, "first", null)
    });

    setReviewNoteDismissed(db, "scope", true);
    const dismissed = getReviewNoteSnapshot(db, "scope");
    expect(dismissed.revision).toBe(2);
    expect(dismissed.token).toBe(
      token("scope", 2, true, "first", dismissed.note?.dismissedAt ?? null)
    );
    setReviewNoteDismissed(db, "scope", false);
    expect(getReviewNoteSnapshot(db, "scope").revision).toBe(3);
    expect(deleteReviewNote(db, "scope")).toBe(true);
    expect(getReviewNoteSnapshot(db, "scope")).toEqual({
      note: null,
      revision: 4,
      token: token("scope", 4, false, null, null)
    });
    saveReviewNote(db, { scopeId: "scope", projectId: "project", body: "new" });
    expect(getReviewNoteSnapshot(db, "scope").revision).toBe(5);
    db.close();
  });

  it("increments for same-timestamp edits and leaves absent no-ops unchanged", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-13T12:00:00Z"));
    const db = database();
    expect(setReviewNoteDismissed(db, "missing", true)).toBeNull();
    expect(deleteReviewNote(db, "missing")).toBe(false);
    expect(getReviewNoteSnapshot(db, "missing").revision).toBe(0);
    saveReviewNote(db, { scopeId: "scope", projectId: "project", body: "one" });
    const first = getReviewNoteSnapshot(db, "scope");
    saveReviewNote(db, { scopeId: "scope", projectId: "project", body: "two" });
    const second = getReviewNoteSnapshot(db, "scope");
    expect(second.note?.updatedAt).toBe(first.note?.updatedAt);
    expect(second.revision).toBe(2);
    expect(second.token).not.toBe(first.token);
    db.close();
  });

  it("supports writes inside a caller transaction", () => {
    const db = database();
    db.exec("begin");
    saveReviewNote(db, { scopeId: "scope", projectId: "project", body: "one" });
    expect(getReviewNoteSnapshot(db, "scope").revision).toBe(1);
    db.exec("rollback");
    expect(getReviewNoteSnapshot(db, "scope").revision).toBe(0);
    db.close();
  });

  it("rolls back the note when revision persistence fails", () => {
    const db = database();
    db.exec("drop table review_note_revisions");
    expect(() =>
      saveReviewNote(db, { scopeId: "scope", projectId: "project", body: "one" })
    ).toThrow();
    expect(
      db.prepare("select * from review_notes where scope_id = 'scope'").get()
    ).toBeUndefined();
    db.close();
  });
});
