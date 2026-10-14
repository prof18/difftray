import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { runMigrations } from "../src/schema.js";
import {
  reviewCommentFromRow,
  reviewFileCommentFromRow,
  reviewNoteFromRow,
  type ReviewCommentRow,
  type ReviewFileCommentRow,
  type ReviewNoteRow
} from "../src/rows.js";

function legacyDatabase(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    create table projects (id text primary key, name text, path text unique, default_base_ref text, created_at text, updated_at text, last_opened_at text);
    insert into projects values ('project', 'Project', '/project', null, 'now', 'now', null);
    create table review_comments (id text primary key, project_id text, review_target_id text, path text, previous_path text, diff_hash text, side text, line_start integer, line_end integer, body text, created_at text, updated_at text);
    create table review_file_comments (id text primary key, project_id text, review_target_id text, path text, previous_path text, diff_hash text, body text, created_at text, updated_at text);
    create table review_notes (scope_id text primary key, project_id text, body text, dismissed_at text, created_at text, updated_at text);
    insert into review_comments values ('line', 'project', 'target', 'a.ts', null, 'hash', 'additions', 1, 2, 'line body', 'now', 'now');
    insert into review_file_comments values ('file', 'project', 'target', 'a.ts', null, 'hash', 'file body', 'now', 'now');
    insert into review_notes values ('scope', 'project', 'note body', null, 'now', 'now');
  `);
  runMigrations(db);
  return db;
}

function feedback(db: DatabaseSync) {
  return {
    line: reviewCommentFromRow(
      db.prepare("select * from review_comments").get() as ReviewCommentRow
    ),
    file: reviewFileCommentFromRow(
      db.prepare("select * from review_file_comments").get() as ReviewFileCommentRow
    ),
    note: reviewNoteFromRow(
      db.prepare("select * from review_notes").get() as ReviewNoteRow
    )
  };
}

const actor = { kind: "agent", name: "Codex", runId: "run" };

describe("agent provenance migration", () => {
  it("retains legacy feedback and maps nullable provenance to human", () => {
    const db = legacyDatabase();
    expect(feedback(db)).toMatchObject({
      line: {
        id: "line",
        body: "line body",
        createdBy: { kind: "human" },
        lastEditedBy: { kind: "human" }
      },
      file: {
        id: "file",
        body: "file body",
        createdBy: { kind: "human" },
        lastEditedBy: { kind: "human" }
      },
      note: { scopeId: "scope", body: "note body", lastEditedBy: { kind: "human" } }
    });
    db.close();
  });

  it("maps agent metadata, counts attribution-only edits, and preserves data across repeated migrations", () => {
    const db = legacyDatabase();
    const json = JSON.stringify(actor);
    db.prepare(
      "update review_comments set created_by_json = ?, last_edited_by_json = ?"
    ).run(json, json);
    db.prepare(
      "update review_file_comments set created_by_json = ?, last_edited_by_json = ?"
    ).run(json, json);
    db.prepare("update review_notes set last_edited_by_json = ?").run(json);
    db.exec(
      "insert into agent_feedback_receipts values ('Codex', 'run', 'request', 'hash', '{\"ok\":true}', 'now')"
    );
    expect(feedback(db)).toMatchObject({
      line: { createdBy: actor, lastEditedBy: actor },
      file: { createdBy: actor, lastEditedBy: actor },
      note: { lastEditedBy: actor }
    });
    const revision = db.prepare("select revision from project_feedback_revisions").get();
    expect(revision).toEqual({ revision: 3 });
    runMigrations(db);
    runMigrations(db);
    expect(db.prepare("select revision from project_feedback_revisions").get()).toEqual(
      revision
    );
    expect(feedback(db).line.createdBy).toEqual(actor);
    expect(db.prepare("select response_json from agent_feedback_receipts").get()).toEqual(
      { response_json: '{"ok":true}' }
    );
    expect(db.prepare("select revision from review_note_revisions").get()).toEqual({
      revision: 1
    });
    db.close();
  });
});

describe("agent feedback query indexes", () => {
  it.each(["review_comments", "review_file_comments"])(
    "filters %s by project without a table scan",
    (table) => {
      const db = legacyDatabase();
      const plan = db
        .prepare(`explain query plan select id from ${table} where project_id = ?`)
        .all("project") as { detail: string }[];
      expect(plan.map((row) => row.detail).join("\n")).toMatch(/USING (COVERING )?INDEX/);
      db.close();
    }
  );
});
