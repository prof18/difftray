import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import {
  AgentContextCapacityError,
  createAgentReviewContext,
  getAgentReviewContext,
  pruneAgentReviewContexts
} from "../src/agent-context-store.js";
import { runMigrations } from "../src/schema.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { force: true, recursive: true });
});

function openTestDatabase(filename = ":memory:"): DatabaseSync {
  const db = new DatabaseSync(filename);
  db.exec("pragma foreign_keys = on");
  runMigrations(db);
  db.prepare(
    `insert or ignore into projects (id, name, path, created_at, updated_at)
     values ('project-1', 'Project', '/tmp/project', 'now', 'now')`
  ).run();
  return db;
}

function context(id: string, contextJson = '{"review":"context"}') {
  return { id, projectId: "project-1", contextJson, expiresAt: 200 };
}

describe("agent review context store", () => {
  it("persists contexts across database reopen and returns expired records for the caller to inspect", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "agent-context-"));
    tempDirs.push(dir);
    const filename = path.join(dir, "storage.sqlite");
    const first = openTestDatabase(filename);
    createAgentReviewContext(first, context("ctx-1"), { now: 100, maxContexts: 2 });
    first.close();

    const reopened = openTestDatabase(filename);
    expect(getAgentReviewContext(reopened, "ctx-1")).toEqual(context("ctx-1"));
    expect(getAgentReviewContext(reopened, "missing")).toBeNull();
    reopened.close();
  });

  it("prunes expired contexts before enforcing capacity without evicting live contexts", () => {
    const db = openTestDatabase();
    createAgentReviewContext(
      db,
      { ...context("expired"), expiresAt: 99 },
      { now: 100, maxContexts: 2 }
    );
    createAgentReviewContext(db, context("live-1"), { now: 100, maxContexts: 2 });
    createAgentReviewContext(db, context("live-2"), { now: 100, maxContexts: 2 });

    expect(() =>
      createAgentReviewContext(db, context("live-3"), { now: 100, maxContexts: 2 })
    ).toThrow(AgentContextCapacityError);
    expect(getAgentReviewContext(db, "expired")).toBeNull();
    expect(getAgentReviewContext(db, "live-1")).not.toBeNull();
    expect(getAgentReviewContext(db, "live-2")).not.toBeNull();
    db.close();
  });

  it("prunes records whose expiry is at or before now and reports the removed count", () => {
    const db = openTestDatabase();
    createAgentReviewContext(
      db,
      { ...context("old"), expiresAt: 100 },
      { now: 0, maxContexts: 3 }
    );
    createAgentReviewContext(
      db,
      { ...context("fresh"), expiresAt: 101 },
      { now: 0, maxContexts: 3 }
    );

    expect(pruneAgentReviewContexts(db, 100)).toBe(1);
    expect(getAgentReviewContext(db, "old")).toBeNull();
    expect(getAgentReviewContext(db, "fresh")).not.toBeNull();
    db.close();
  });

  it("rejects duplicate ids and rolls back pruning when creation fails", () => {
    const db = openTestDatabase();
    createAgentReviewContext(
      db,
      { ...context("expired"), expiresAt: 99 },
      { now: 100, maxContexts: 3 }
    );
    createAgentReviewContext(db, context("duplicate"), { now: 0, maxContexts: 3 });

    expect(() =>
      createAgentReviewContext(db, context("duplicate"), { now: 100, maxContexts: 3 })
    ).toThrow();
    expect(getAgentReviewContext(db, "expired")).not.toBeNull();
    db.close();
  });

  it("removes contexts when their project is deleted", () => {
    const db = openTestDatabase();
    createAgentReviewContext(db, context("ctx-1"), { now: 100, maxContexts: 2 });

    db.prepare("delete from projects where id = ?").run("project-1");

    expect(getAgentReviewContext(db, "ctx-1")).toBeNull();
    db.close();
  });
});
