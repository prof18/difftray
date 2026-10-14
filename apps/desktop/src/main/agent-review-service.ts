import { createHash } from "node:crypto";
import { createDiffHash, createReviewNoteScopeId } from "@difftray/core";
import { StaleAgentFeedbackError, type DifftrayStorage } from "@difftray/storage";
import {
  AgentProtocolError,
  MAX_RESPONSE_BYTES,
  PAGE_SIZE_DEFAULT,
  PAGE_SIZE_MAX,
  type AgentRequest,
  type AgentResultMap,
  type AgentReviewContext
} from "../shared/agent-protocol.js";
import {
  createDiffsRenderModel,
  selectableReviewLineRanges
} from "../shared/review-diff-model.js";
import {
  createReviewContextService,
  loadExplicitFileDiff,
  loadExplicitFileSummary
} from "./review-context-service.js";
import { fileDiffFromGit } from "./view-models.js";

type Params<M extends AgentRequest["method"]> = Extract<
  AgentRequest,
  { method: M }
>["params"];
type Cursor = {
  contextId: string;
  kind: "files" | "feedback";
  offset: number;
  filter: boolean;
  sort: string;
  version?: string;
  snapshotHash: string;
};
const sort = "scope,path,lineStart,lineEnd,createdAt,id";
function encode(cursor: Cursor): string {
  const json = JSON.stringify(cursor);
  return Buffer.from(
    JSON.stringify([json, createHash("sha256").update(json).digest("hex")])
  ).toString("base64url");
}
function decode(
  value: string | undefined,
  context: AgentReviewContext,
  kind: Cursor["kind"],
  filter = false
): Cursor {
  const first: Cursor = {
    contextId: context.id,
    kind,
    offset: 0,
    filter,
    sort,
    snapshotHash: context.snapshotHash
  };
  if (!value) return first;
  try {
    const [json, checksum] = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8")
    ) as [string, string];
    if (checksum !== createHash("sha256").update(json).digest("hex")) throw new Error();
    const cursor = JSON.parse(json) as Cursor;
    if (
      cursor.contextId !== context.id ||
      cursor.kind !== kind ||
      cursor.filter !== filter ||
      cursor.sort !== sort ||
      cursor.snapshotHash !== context.snapshotHash ||
      !Number.isSafeInteger(cursor.offset) ||
      cursor.offset < 1 ||
      (kind === "feedback" && typeof cursor.version !== "string")
    )
      throw new Error();
    return cursor;
  } catch {
    throw new AgentProtocolError(
      "invalid_request",
      "Invalid page cursor for this context and filter."
    );
  }
}
function bounded<T>(result: T): T {
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > MAX_RESPONSE_BYTES - 1024)
    throw new AgentProtocolError(
      "limit_exceeded",
      "Response is too large; use paginated JSON with a smaller limit."
    );
  return result;
}
function pageLimit(limit = PAGE_SIZE_DEFAULT): number {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > PAGE_SIZE_MAX)
    throw new AgentProtocolError("invalid_request", "Invalid page limit.");
  return limit;
}
export function createAgentReviewService(
  storage: DifftrayStorage,
  contexts = createReviewContextService(storage)
) {
  async function inspect(
    params: Params<"review.inspect">
  ): Promise<AgentResultMap["review.inspect"]> {
    const context = await contexts.inspect(params.repoPath, params.selector);
    const snapshot = storage.getReviewNoteSnapshot(
      createReviewNoteScopeId(context.reviewTarget)
    );
    return bounded({
      contextId: context.id,
      projectId: context.projectId,
      repoPath: context.canonicalWorktreePath,
      target: context.reviewTarget,
      targetId: context.reviewTargetId,
      snapshotHash: context.snapshotHash,
      fileCount: context.files.length,
      visibleFileCount: context.files.filter((f) => f.visible).length,
      expiresAt: context.expiresAt,
      noteVersion: snapshot.token,
      note: snapshot.note
        ? { body: snapshot.note.body, dismissedAt: snapshot.note.dismissedAt ?? null }
        : null
    });
  }
  async function files(
    params: Params<"review.files">
  ): Promise<AgentResultMap["review.files"]> {
    return contexts.withContext(params.contextId, { live: false }, (context) => {
      const cursor = decode(params.cursor, context, "files");
      const items = context.files.slice(
        cursor.offset,
        cursor.offset + pageLimit(params.limit)
      );
      const offset = cursor.offset + items.length;
      if (cursor.offset > context.files.length)
        throw new AgentProtocolError(
          "invalid_request",
          "Cursor is outside the file manifest."
        );
      return Promise.resolve(
        bounded({
          files: items,
          total: context.files.length,
          nextCursor: offset < context.files.length ? encode({ ...cursor, offset }) : null
        })
      );
    });
  }
  async function file(
    params: Params<"review.file">
  ): Promise<AgentResultMap["review.file"]> {
    return contexts.withContext(params.contextId, { live: true }, async (context) => {
      const listed = context.files.find((entry) => entry.path === params.path);
      if (
        !listed ||
        params.path.startsWith("/") ||
        params.path.split(/[\\/]/).some((part) => part === ".." || part === "." || !part)
      )
        throw new AgentProtocolError(
          "invalid_request",
          "Path must exactly match a context-listed file."
        );
      const check = async () => {
        const summary = await loadExplicitFileSummary(
          context.canonicalWorktreePath,
          context.reviewTarget,
          listed.path,
          listed.previousPath
        );
        if (
          !summary ||
          createDiffHash(context.reviewTarget, fileDiffFromGit(summary)) !==
            listed.diffHash
        )
          throw new AgentProtocolError("stale_diff", "File changed; inspect again.");
      };
      await check();
      const loaded = await loadExplicitFileDiff(
        context.canonicalWorktreePath,
        context.reviewTarget,
        listed.path,
        listed.previousPath
      );
      await check();
      if (!loaded)
        throw new AgentProtocolError(
          "stale_diff",
          "File is no longer available; inspect again."
        );
      const renderDiffHash = createDiffHash(
        context.reviewTarget,
        fileDiffFromGit(loaded)
      );
      const content = loaded.oversized
        ? { kind: "oversized" as const, reason: "patch_too_large" as const }
        : loaded.content;
      const selectableRanges =
        content.kind === "text"
          ? selectableReviewLineRanges(
              createDiffsRenderModel({
                ...content,
                diffHash: renderDiffHash,
                filePath: listed.path,
                status: loaded.status,
                ...(listed.previousPath ? { previousPath: listed.previousPath } : {})
              })
            )
          : { additions: [], deletions: [] };
      return bounded({
        path: listed.path,
        ...(listed.previousPath ? { previousPath: listed.previousPath } : {}),
        diffHash: listed.diffHash,
        renderDiffHash,
        content,
        selectableRanges
      });
    });
  }
  async function feedback(
    params: Params<"review.feedback">
  ): Promise<AgentResultMap["review.feedback"] & { inactiveCount: number }> {
    return contexts.withContext(params.contextId, { live: false }, (context) => {
      const cursor = decode(
        params.cursor,
        context,
        "feedback",
        params.includeInactive ?? false
      );
      try {
        const page = storage.listAgentFeedbackPage({
          projectId: context.projectId,
          reviewTargetId: context.reviewTargetId,
          noteScopeId: createReviewNoteScopeId(context.reviewTarget),
          files: context.files,
          includeInactive: cursor.filter,
          limit: pageLimit(params.limit),
          offset: cursor.offset,
          ...(cursor.version ? { expectedFeedbackVersion: cursor.version } : {})
        });
        const offset = cursor.offset + page.items.length;
        if (cursor.offset > page.total)
          throw new AgentProtocolError(
            "invalid_request",
            "Cursor is outside the feedback list."
          );
        return Promise.resolve(
          bounded({
            ...page,
            nextCursor:
              offset < page.total
                ? encode({ ...cursor, offset, version: page.feedbackVersion })
                : null
          })
        );
      } catch (error) {
        if (error instanceof StaleAgentFeedbackError)
          throw new AgentProtocolError("stale_feedback", error.message);
        throw error;
      }
    });
  }
  return { contexts, inspect, files, file, feedback };
}
