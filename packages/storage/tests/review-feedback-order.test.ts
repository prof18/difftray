import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { listAgentFeedbackPage } from "../src/agent-feedback-read-store.js";
import { listReviewComments, listReviewFileComments } from "../src/review-store.js";
import { runMigrations } from "../src/schema.js";

it("uses the same stable ordering for UI and agent feedback with tied timestamps", () => {
  const db = new DatabaseSync(":memory:");
  try {
    runMigrations(db);
    db.exec(`
      insert into projects (id, name, path, created_at, updated_at)
        values ('p', 'P', '/p', 'now', 'now');
      insert into review_targets (id, project_id, mode, head_kind, created_at, last_used_at)
        values ('t', 'p', 'working_tree', 'working_tree', 'now', 'now');
    `);
    for (const id of ["z", "a"]) {
      db.prepare(
        `insert into review_comments
        (id, project_id, review_target_id, path, diff_hash, side, line_start, line_end, body, created_at, updated_at)
        values (?, 'p', 't', 'file', 'hash', 'additions', 1, 2, ?, 'same-time', 'same-time')
      `
      ).run(`line-${id}`, id);
      db.prepare(
        `insert into review_file_comments
        (id, project_id, review_target_id, path, diff_hash, body, created_at, updated_at)
        values (?, 'p', 't', 'file', 'hash', ?, 'same-time', 'same-time')
      `
      ).run(`file-${id}`, id);
    }
    const page = listAgentFeedbackPage(db, {
      projectId: "p",
      reviewTargetId: "t",
      noteScopeId: "scope",
      files: [{ path: "file", diffHash: "hash", visible: true }],
      includeInactive: false,
      limit: 10,
      offset: 0
    });
    const ids = (kind: "line" | "file") =>
      page.items.filter((item) => item.kind === kind).map((item) => item.id);
    expect(ids("line")).toEqual(["line-a", "line-z"]);
    expect(ids("file")).toEqual(["file-a", "file-z"]);
    expect(listReviewComments(db, "t").map((item) => item.id)).toEqual(ids("line"));
    expect(listReviewFileComments(db, "t").map((item) => item.id)).toEqual(ids("file"));
  } finally {
    db.close();
  }
});
