import type { DatabaseSync } from "node:sqlite";
import type { FeedbackActor } from "./records.js";
import {
  createReviewComment,
  createReviewFileComment,
  saveReviewNote
} from "./review-store.js";
import { getReviewNoteSnapshot } from "./review-note-revisions.js";
import { currentTimestamp } from "./timestamps.js";

const AGENT_RECEIPT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type AgentReceiptKey = {
  readonly actor: Extract<FeedbackActor, { kind: "agent" }>;
  readonly requestId: string;
  readonly payloadHash: string;
};
export type AgentFeedbackReceipt = {
  readonly requestId: string;
  readonly deduplicated: boolean;
  readonly itemIds: string[];
  readonly noteVersion: string;
};
export type AgentBatchItem =
  | {
      readonly kind: "line";
      readonly path: string;
      readonly previousPath?: string;
      readonly diffHash: string;
      readonly side: "additions" | "deletions";
      readonly lineStart: number;
      readonly lineEnd: number;
      readonly body: string;
    }
  | {
      readonly kind: "file";
      readonly path: string;
      readonly previousPath?: string;
      readonly diffHash: string;
      readonly body: string;
    }
  | {
      readonly kind: "overall";
      readonly body: string;
      readonly expectedNoteVersion: string;
    };
export type AgentFeedbackBatch = AgentReceiptKey & {
  readonly projectId: string;
  readonly reviewTargetId: string;
  readonly noteScopeId: string;
  readonly items: readonly AgentBatchItem[];
};
export class AgentFeedbackConflictError extends Error {
  constructor(
    readonly code: "note_conflict" | "idempotency_conflict",
    message: string
  ) {
    super(message);
    this.name = "AgentFeedbackConflictError";
  }
}
export function findAgentFeedbackReceipt(
  db: DatabaseSync,
  key: AgentReceiptKey
): AgentFeedbackReceipt | null {
  const row = db
    .prepare(
      "select payload_hash, response_json from agent_feedback_receipts where actor_name = ? and run_id = ? and request_id = ?"
    )
    .get(key.actor.name, key.actor.runId, key.requestId) as
    { payload_hash: string; response_json: string } | undefined;
  if (!row) return null;
  if (row.payload_hash !== key.payloadHash)
    throw new AgentFeedbackConflictError(
      "idempotency_conflict",
      "Submission key was already committed with a different payload."
    );
  return {
    ...(JSON.parse(row.response_json) as AgentFeedbackReceipt),
    deduplicated: true
  };
}
export function applyAgentFeedbackBatch(
  db: DatabaseSync,
  input: AgentFeedbackBatch
): AgentFeedbackReceipt {
  db.exec("begin immediate");
  try {
    const previous = findAgentFeedbackReceipt(db, input);
    if (previous) {
      db.exec("commit");
      return previous;
    }
    if (
      input.items.length < 1 ||
      input.items.length > 100 ||
      input.items.filter((item) => item.kind === "overall").length > 1
    )
      throw new Error("Invalid feedback batch size or duplicate overall item.");
    const target = db
      .prepare("select project_id from review_targets where id = ?")
      .get(input.reviewTargetId);
    if (target?.project_id !== input.projectId)
      throw new Error("Review target does not belong to this project.");
    const scope = db
      .prepare("select project_id from review_note_revisions where scope_id = ?")
      .get(input.noteScopeId);
    if (scope && scope.project_id !== input.projectId)
      throw new Error("Note scope does not belong to this project.");
    const revision = db
      .prepare("select revision from project_feedback_revisions where project_id = ?")
      .get(input.projectId)?.revision;
    if (typeof revision !== "number")
      throw new Error("Project feedback revision is missing.");
    const overall = input.items.find((item) => item.kind === "overall");
    if (
      overall &&
      getReviewNoteSnapshot(db, input.noteScopeId).token !== overall.expectedNoteVersion
    )
      throw new AgentFeedbackConflictError(
        "note_conflict",
        "Overall note changed; read it again before submitting."
      );
    const itemIds: string[] = [];
    for (const item of input.items) {
      if (!item.body.trim()) throw new Error("Feedback body is empty.");
      if (item.kind === "overall") {
        saveReviewNote(db, {
          projectId: input.projectId,
          scopeId: input.noteScopeId,
          body: item.body,
          actor: input.actor
        });
        itemIds.push(input.noteScopeId);
      } else {
        const common = {
          projectId: input.projectId,
          reviewTargetId: input.reviewTargetId,
          actor: input.actor,
          ...item
        };
        if (item.kind === "line") {
          if (
            !Number.isSafeInteger(item.lineStart) ||
            !Number.isSafeInteger(item.lineEnd) ||
            item.lineStart < 1 ||
            item.lineEnd < item.lineStart
          )
            throw new Error("Invalid line range.");
          itemIds.push(
            createReviewComment(db, {
              ...common,
              side: item.side,
              lineStart: item.lineStart,
              lineEnd: item.lineEnd
            }).id
          );
        } else itemIds.push(createReviewFileComment(db, common).id);
      }
    }
    // Per-row triggers are invisible outside this immediate transaction. Collapse
    // their increments to one committed logical batch, preserving independent note CAS.
    db.prepare(
      "update project_feedback_revisions set revision = ? where project_id = ?"
    ).run(revision + 1, input.projectId);
    const response: AgentFeedbackReceipt = {
      requestId: input.requestId,
      deduplicated: false,
      itemIds,
      noteVersion: getReviewNoteSnapshot(db, input.noteScopeId).token
    };
    // Retries resume within a host session, long after the 24h context TTL but
    // never months later; without pruning the table only grows.
    db.prepare("delete from agent_feedback_receipts where created_at < ?").run(
      new Date(Date.now() - AGENT_RECEIPT_RETENTION_MS).toISOString()
    );
    db.prepare(
      "insert into agent_feedback_receipts (actor_name,run_id,request_id,payload_hash,response_json,created_at) values (?,?,?,?,?,?)"
    ).run(
      input.actor.name,
      input.actor.runId,
      input.requestId,
      input.payloadHash,
      JSON.stringify(response),
      currentTimestamp()
    );
    db.exec("commit");
    return response;
  } catch (error) {
    db.exec("rollback");
    throw error;
  }
}
