import { createReviewNoteScopeId, maxReportedPaths } from "@difftray/core";
import {
  StaleAgentFeedbackError,
  type DifftrayStorage,
  type StoredAgentFeedbackView
} from "@difftray/storage";
import {
  AgentProtocolError,
  MAX_RESPONSE_BYTES,
  type AgentResultMap,
  type AgentReviewContext
} from "../shared/agent-protocol.js";
import { createReviewContextService } from "./review-context-service.js";
import {
  formatExplicitReviewReport,
  type ExplicitReportWorkspace
} from "./review-feedback-service.js";

function required<T>(value: T | undefined): T {
  if (value === undefined)
    throw new AgentProtocolError(
      "internal_error",
      "Stored feedback is missing its anchor."
    );
  return value;
}

export function createAgentExportService(
  storage: DifftrayStorage,
  options: {
    readonly contexts?: ReturnType<typeof createReviewContextService>;
    readonly loadFile?: NonNullable<
      Parameters<typeof formatExplicitReviewReport>[3]
    >["loadFile"];
  } = {}
) {
  const contexts = options.contexts ?? createReviewContextService(storage);
  function page(
    context: AgentReviewContext,
    offset: number,
    expectedFeedbackVersion?: string
  ) {
    try {
      return storage.listAgentFeedbackPage({
        projectId: context.projectId,
        reviewTargetId: context.reviewTargetId,
        noteScopeId: createReviewNoteScopeId(context.reviewTarget),
        files: context.files,
        includeInactive: false,
        offset,
        limit: 1000,
        ...(expectedFeedbackVersion ? { expectedFeedbackVersion } : {})
      });
    } catch (error) {
      if (error instanceof StaleAgentFeedbackError)
        throw new AgentProtocolError("stale_feedback", error.message);
      throw error;
    }
  }
  return {
    async export(params: {
      readonly contextId: string;
      readonly format: "prompt" | "json";
    }): Promise<AgentResultMap["review.export"]> {
      return contexts.withContext(params.contextId, async (context) => {
        const first = page(context, 0);
        const items: StoredAgentFeedbackView[] = [...first.items];
        let encodedBytes = Buffer.byteLength(JSON.stringify(first.items));
        while (items.length < first.total) {
          const next = page(context, items.length, first.feedbackVersion);
          if (!next.items.length)
            throw new AgentProtocolError(
              "stale_feedback",
              "Feedback changed; export again."
            );
          encodedBytes += Buffer.byteLength(JSON.stringify(next.items));
          if (encodedBytes > MAX_RESPONSE_BYTES)
            throw new AgentProtocolError(
              "limit_exceeded",
              "Report exceeds response limit; use paginated review feedback JSON."
            );
          items.push(...next.items);
        }
        const reviewedPathCount = context.files.filter((file) => file.visible).length;
        const metadata = {
          feedbackVersion: first.feedbackVersion,
          inactiveCount: first.inactiveCount,
          reviewedPathCount,
          reviewedPathLimit: maxReportedPaths,
          reviewedPathsTruncated: reviewedPathCount > maxReportedPaths
        };
        let result: AgentResultMap["review.export"];
        if (params.format === "json") {
          result = {
            format: "json",
            content: {
              contextId: context.id,
              target: context.reviewTarget,
              items,
              note: first.note,
              noteVersion: first.noteVersion
            },
            metadata
          };
        } else {
          const target = context.reviewTarget;
          const note = items.find((item) => item.kind === "overall");
          const workspace: ExplicitReportWorkspace = {
            project: {
              name:
                storage.getProject(context.projectId)?.name ??
                context.canonicalWorktreePath
            },
            reviewTarget: { id: context.reviewTargetId, ...target },
            files: context.files,
            comments: items
              .filter((item) => item.kind === "line")
              .map((item) => ({
                id: item.id,
                body: item.body,
                path: required(item.path),
                diffHash: required(item.diffHash),
                side: required(item.side),
                lineStart: required(item.lineStart),
                lineEnd: required(item.lineEnd),
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,
                ...(item.previousPath ? { previousPath: item.previousPath } : {})
              })),
            fileComments: items
              .filter((item) => item.kind === "file")
              .map((item) => ({
                id: item.id,
                body: item.body,
                path: required(item.path),
                diffHash: required(item.diffHash),
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,
                ...(item.previousPath ? { previousPath: item.previousPath } : {})
              })),
            reviewNote: note
              ? { body: note.body, createdAt: note.createdAt, updatedAt: note.updatedAt }
              : null
          };
          const content = await formatExplicitReviewReport(
            context.canonicalWorktreePath,
            target,
            workspace,
            options.loadFile ? { loadFile: options.loadFile } : {}
          );
          page(context, 0, first.feedbackVersion);
          result = { format: "prompt", content, metadata };
        }
        // Reserve room for the transport envelope, including the maximum request ID.
        if (Buffer.byteLength(JSON.stringify(result)) + 512 > MAX_RESPONSE_BYTES)
          throw new AgentProtocolError(
            "limit_exceeded",
            "Report exceeds response limit; use paginated review feedback JSON."
          );
        return result;
      });
    }
  };
}
