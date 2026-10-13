import type { DatabaseSync } from "node:sqlite";

export type AgentReviewContextRecord = {
  readonly id: string;
  readonly projectId: string;
  readonly contextJson: string;
  readonly expiresAt: number;
};

export type CreateAgentReviewContextOptions = {
  readonly now: number;
  readonly maxContexts: number;
};

type AgentReviewContextRow = {
  readonly id: string;
  readonly project_id: string;
  readonly context_json: string;
  readonly expires_at: number;
};

export class AgentContextCapacityError extends Error {
  constructor() {
    super("Agent review context capacity has been reached.");
    this.name = "AgentContextCapacityError";
  }
}

export function createAgentReviewContext(
  db: DatabaseSync,
  record: AgentReviewContextRecord,
  options: CreateAgentReviewContextOptions
): void {
  if (
    !Number.isFinite(options.now) ||
    !Number.isInteger(options.maxContexts) ||
    options.maxContexts < 0
  ) {
    throw new RangeError("Agent review context limits must be finite and non-negative.");
  }

  db.exec("savepoint create_agent_review_context");
  try {
    pruneAgentReviewContexts(db, options.now);
    const row = db
      .prepare("select count(*) as count from agent_review_contexts")
      .get() as {
      readonly count: number;
    };
    if (row.count >= options.maxContexts) {
      throw new AgentContextCapacityError();
    }

    db.prepare(
      `insert into agent_review_contexts (id, project_id, context_json, expires_at)
       values (?, ?, ?, ?)`
    ).run(record.id, record.projectId, record.contextJson, record.expiresAt);
    db.exec("release savepoint create_agent_review_context");
  } catch (error) {
    db.exec("rollback to savepoint create_agent_review_context");
    db.exec("release savepoint create_agent_review_context");
    throw error;
  }
}

export function getAgentReviewContext(
  db: DatabaseSync,
  id: string
): AgentReviewContextRecord | null {
  const row = db
    .prepare(
      `select id, project_id, context_json, expires_at
       from agent_review_contexts
       where id = ?`
    )
    .get(id) as AgentReviewContextRow | undefined;

  return row
    ? {
        id: row.id,
        projectId: row.project_id,
        contextJson: row.context_json,
        expiresAt: row.expires_at
      }
    : null;
}

export function pruneAgentReviewContexts(db: DatabaseSync, now: number): number {
  const result = db
    .prepare("delete from agent_review_contexts where expires_at <= ?")
    .run(now);
  return Number(result.changes);
}
