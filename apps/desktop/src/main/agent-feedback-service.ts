import { createHash } from "node:crypto";
import {
  createDiffHash,
  createReviewNoteScopeId,
  createReviewTargetId,
  validateReviewCommentAnchor,
  type ReviewTarget
} from "@difftray/core";
import { AgentFeedbackConflictError, type DifftrayStorage } from "@difftray/storage";
import {
  AgentProtocolError,
  parseAgentRequest,
  type AgentContextFile,
  type AgentResultMap,
  type AgentReviewContext,
  type ExplicitAgentSelector,
  type FeedbackItem,
  type FeedbackSubmission
} from "../shared/agent-protocol.js";
import {
  createDiffsRenderModel,
  selectableReviewLineRanges
} from "../shared/review-diff-model.js";
import {
  createReviewContextService,
  loadExplicitFileDiff,
  loadExplicitFileSummary,
  loadTargetSummaries
} from "./review-context-service.js";
import {
  filesExcerptJson,
  lineExcerptJson,
  patchExcerptJson,
  type ExcerptDiff
} from "./feedback-excerpt-capture.js";
import { fileDiffFromGit } from "./view-models.js";

type SubmitParams = {
  readonly contextId: string;
  readonly submission: FeedbackSubmission;
};
type Contexts = Pick<ReturnType<typeof createReviewContextService>, "withContext">;
type Reads = {
  readonly file: (params: {
    contextId: string;
    path: string;
  }) => Promise<AgentResultMap["review.file"]>;
};
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, child]) => [key, canonical(child)])
    );
  return value;
}
function typed(error: unknown): never {
  if (error instanceof AgentFeedbackConflictError)
    throw new AgentProtocolError(error.code, error.message);
  throw error;
}
type Excerpts = {
  /** Loads a file diff bound to its listed hash for a file item's excerpt. */
  readonly fileDiff: (
    context: AgentReviewContext,
    listed: AgentContextFile
  ) => Promise<ExcerptDiff | null>;
  readonly targetSummaries: (
    repoPath: string,
    selector: ExplicitAgentSelector
  ) => Promise<{
    readonly reviewTarget: ReviewTarget;
    readonly files: readonly {
      readonly newPath: string;
      readonly additions: number;
      readonly deletions: number;
    }[];
  }>;
};
// Loads a listed file between two summary checks, so its content matches listed.diffHash.
async function loadBoundFileDiff(context: AgentReviewContext, listed: AgentContextFile) {
  const check = async () => {
    const summary = await loadExplicitFileSummary(
      context.canonicalWorktreePath,
      context.reviewTarget,
      listed.path,
      listed.previousPath
    );
    if (
      !summary ||
      createDiffHash(context.reviewTarget, fileDiffFromGit(summary)) !== listed.diffHash
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
  return loaded;
}
// Excerpts are best effort: a failed read stores null and never fails the batch.
async function itemExcerpts(
  context: AgentReviewContext,
  items: readonly FeedbackItem[],
  loaded: ReadonlyMap<string, Promise<AgentResultMap["review.file"]>>,
  excerpts: Excerpts
): Promise<(string | null)[]> {
  const manifest = new Map(context.files.map((file) => [file.path, file]));
  const fileReads = new Map<string, Promise<string | null>>();
  let overallRead: Promise<string | null> | undefined;
  const patchFor = (listed: AgentContextFile) => {
    const key = `${listed.path}\0${listed.diffHash}`;
    let read = fileReads.get(key);
    if (!read) {
      const anchored = loaded.get(listed.path);
      read = (
        anchored
          ? anchored.then((file) => patchExcerptJson(file.content))
          : excerpts
              .fileDiff(context, listed)
              .then((diff) =>
                diff && !diff.oversized ? patchExcerptJson(diff.content) : null
              )
      ).catch(() => null);
      fileReads.set(key, read);
    }
    return read;
  };
  const overall = () =>
    (overallRead ??= excerpts
      .targetSummaries(context.canonicalWorktreePath, context.selector)
      .then((summaries) =>
        createReviewTargetId(summaries.reviewTarget) ===
        createReviewTargetId(context.reviewTarget)
          ? filesExcerptJson(
              summaries.files.map((file) => ({
                path: file.newPath,
                additions: file.additions,
                deletions: file.deletions
              }))
            )
          : null
      )
      .catch(() => null));
  return Promise.all(
    items.map(async (item) => {
      if (item.kind === "overall") return overall();
      const listed = manifest.get(item.path);
      if (!listed) return null;
      if (item.kind === "file") return patchFor(listed);
      try {
        const file = await loaded.get(item.path);
        return file ? lineExcerptJson(file.content, item) : null;
      } catch {
        return null;
      }
    })
  );
}
const defaultExcerpts: Excerpts = {
  fileDiff: loadBoundFileDiff,
  targetSummaries: loadTargetSummaries
};
async function loadAnchors(
  context: AgentReviewContext,
  filePath: string
): Promise<AgentResultMap["review.file"]> {
  const listed = context.files.find((file) => file.path === filePath);
  if (!listed)
    throw new AgentProtocolError(
      "invalid_request",
      "File is not listed in the review context."
    );
  const loaded = await loadBoundFileDiff(context, listed);
  const renderDiffHash = createDiffHash(context.reviewTarget, fileDiffFromGit(loaded));
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
  return { path: listed.path, diffHash: listed.diffHash, content, selectableRanges };
}
export function createAgentFeedbackService(
  storage: DifftrayStorage,
  options: {
    readonly contexts?: Contexts;
    readonly reads?: Reads;
    readonly excerpts?: Excerpts;
    readonly onCommitted?: (projectId: string) => void;
  } = {}
) {
  const contexts = options.contexts ?? createReviewContextService(storage);
  async function submit(
    params: SubmitParams
  ): Promise<AgentResultMap["feedback.submit"]> {
    // The same strict boundary is used for direct service callers and socket requests.
    const request = parseAgentRequest(
      JSON.stringify({
        version: 1,
        id: params.submission.requestId,
        token: "0".repeat(64),
        method: "feedback.submit",
        params
      }) + "\n"
    );
    if (request.method !== "feedback.submit")
      throw new AgentProtocolError("invalid_request", "Invalid submission method.");
    const { submission, contextId } = request.params;
    const actor = { ...submission.actor, kind: "agent" as const };
    const key = {
      actor,
      requestId: submission.requestId,
      payloadHash: createHash("sha256")
        .update(JSON.stringify(canonical({ contextId, actor, items: submission.items })))
        .digest("hex")
    };
    const lookup = () => {
      try {
        return storage.findAgentFeedbackReceipt(key);
      } catch (error) {
        return typed(error);
      }
    };
    const prior = lookup();
    if (prior) return prior;
    let batch;
    try {
      batch = await contexts.withContext(contextId, { live: true }, async (context) => {
        const manifest = new Map(context.files.map((file) => [file.path, file]));
        const loaded = new Map<string, Promise<AgentResultMap["review.file"]>>();
        for (const item of submission.items) {
          if (item.kind === "overall") continue;
          const listed = manifest.get(item.path);
          if (!listed || item.previousPath !== listed.previousPath)
            throw new AgentProtocolError(
              "invalid_request",
              "Path and previousPath must exactly match the context manifest."
            );
          if (item.diffHash !== listed.diffHash)
            throw new AgentProtocolError(
              "stale_diff",
              "Finding hash does not match the context summary hash."
            );
          if (item.kind === "line") {
            let read = loaded.get(item.path);
            if (!read) {
              read = options.reads
                ? options.reads.file({ contextId, path: item.path })
                : loadAnchors(context, item.path);
              loaded.set(item.path, read);
            }
            const file = await read;
            if (file.diffHash !== listed.diffHash)
              throw new AgentProtocolError("stale_diff", "File changed; inspect again.");
            if (
              file.content.kind !== "text" ||
              !validateReviewCommentAnchor({
                selectableRanges: file.selectableRanges,
                side: item.side,
                lineStart: item.lineStart,
                lineEnd: item.lineEnd
              })
            )
              throw new AgentProtocolError(
                "invalid_request",
                "Line range is unavailable on the requested diff side."
              );
          }
        }
        const excerptJson = await itemExcerpts(
          context,
          submission.items,
          loaded,
          options.excerpts ?? defaultExcerpts
        );
        return {
          ...key,
          projectId: context.projectId,
          reviewTargetId: context.reviewTargetId,
          noteScopeId: createReviewNoteScopeId(context.reviewTarget),
          items: submission.items.map((item, index) => ({
            ...item,
            excerptJson: excerptJson[index] ?? null
          }))
        };
      });
    } catch (error) {
      const concurrent = lookup();
      if (concurrent) return concurrent;
      return typed(error);
    }
    let receipt;
    try {
      receipt = storage.applyAgentFeedbackBatch(batch);
    } catch (error) {
      return typed(error);
    }
    if (!receipt.deduplicated) options.onCommitted?.(batch.projectId);
    return receipt;
  }
  return { submit };
}
