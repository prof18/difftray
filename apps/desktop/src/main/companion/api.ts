import { posix as posixPath } from "node:path";

import {
  COMPANION_PROTOCOL_VERSION,
  type CompanionServerEvent,
  type CreateCommentBody,
  type DiffTargetBody,
  type FileDiffContentKind,
  type MarkReviewedBody,
  type RecentProjectView,
  type ReviewCommentView,
  type ReviewFileDiffContentView,
  type ReviewWorkspaceView,
  type UpdateCommentBody,
  type WorkspaceSummary,
  parseCreateCommentBody,
  parseDiffTargetBody,
  parseMarkReviewedBody,
  parsePairRequestBody,
  parseUpdateCommentBody
} from "@difftray/companion-protocol";
import type { DifftrayStorage } from "@difftray/storage";

import type { CompanionAuthManager, CompanionDeviceContext } from "./auth.js";
import type { RouteDefinition } from "./router.js";

export type MarkResult =
  | {
      readonly marked: true;
      readonly workspaceSummary: WorkspaceSummary;
    }
  | {
      readonly stale: true;
      readonly workspace: ReviewWorkspaceView;
    };

export type UnmarkResult =
  | {
      readonly unmarked: true;
      readonly workspaceSummary: WorkspaceSummary;
    }
  | {
      readonly stale: true;
      readonly workspace: ReviewWorkspaceView;
    };

export type CommitInfo = {
  readonly sha: string;
  readonly shortSha: string;
  readonly subject: string;
};

export type CompanionDeps = {
  readonly companionAuth: CompanionAuthManager;
  readonly storage: DifftrayStorage;
  readonly loadWorkspaceView: (projectId: string) => Promise<ReviewWorkspaceView>;
  readonly loadFileDiff: (
    projectId: string,
    path: string
  ) => Promise<{
    readonly content: ReviewFileDiffContentView;
    readonly contentKind: FileDiffContentKind;
    readonly diffHash: string;
  }>;
  readonly markReviewed: (
    input: MarkReviewedBody & { readonly projectId: string }
  ) => Promise<MarkResult>;
  readonly unmarkReviewed: (
    input: MarkReviewedBody & { readonly projectId: string }
  ) => Promise<UnmarkResult>;
  readonly createComment: (
    input: CreateCommentBody & { readonly projectId: string }
  ) => Promise<ReviewCommentView>;
  readonly updateComment: (
    input: UpdateCommentBody & { readonly commentId: string }
  ) => Promise<ReviewCommentView | null>;
  readonly deleteComment: (id: string) => Promise<boolean>;
  readonly commentsReport: (projectId: string) => Promise<string>;
  readonly listBranchRefs: (projectId: string) => Promise<readonly string[]>;
  readonly listRecentCommits: (projectId: string) => Promise<readonly CommitInfo[]>;
  readonly updateDiffTarget: (
    projectId: string,
    target: DiffTargetBody
  ) => Promise<ReviewWorkspaceView>;
  readonly listRecentProjects: () => readonly RecentProjectView[];
  readonly notifyDesktopRenderer: (projectId: string) => void;
  readonly serverIdentity: () => {
    readonly appVersion: string;
    readonly serverId: string;
    readonly serverName: string;
    readonly serverPublicKey: string;
  };
};

export type CompanionResponse = {
  readonly body: unknown;
  readonly status: number;
};

export type CompanionHandlerInput = {
  readonly body: unknown;
  readonly device: CompanionDeviceContext | null;
  readonly params: ReadonlyMap<string, string>;
  readonly query: URLSearchParams;
};

export type CompanionHandler = (
  input: CompanionHandlerInput
) => Promise<CompanionResponse> | CompanionResponse;

export function createCompanionApi(deps: CompanionDeps): readonly RouteDefinition[] {
  const workspaceLoads = new Map<string, Promise<ReviewWorkspaceView>>();

  async function loadWorkspaceSingleFlight(
    projectId: string
  ): Promise<ReviewWorkspaceView> {
    const existing = workspaceLoads.get(projectId);
    if (existing) {
      return existing;
    }

    const promise = deps.loadWorkspaceView(projectId);
    workspaceLoads.set(projectId, promise);

    try {
      return await promise;
    } finally {
      workspaceLoads.delete(projectId);
    }
  }

  return [
    {
      handler: () => {
        const identity = deps.serverIdentity();

        return {
          body: {
            appVersion: identity.appVersion,
            pairingOpen: false,
            protocolVersion: COMPANION_PROTOCOL_VERSION,
            serverId: identity.serverId,
            serverName: identity.serverName,
            serverPublicKey: identity.serverPublicKey
          },
          status: 200
        };
      },
      method: "GET",
      path: "/companion/v1/handshake"
    },
    {
      handler: ({ body }) => {
        const parsed = parsePairRequestBody(body);

        if (!parsed.ok) {
          return badRequest(parsed.error);
        }

        if (parsed.value.protocolVersion !== COMPANION_PROTOCOL_VERSION) {
          return {
            body: companionError("protocol_mismatch", "Unsupported protocol version"),
            status: 400
          };
        }

        const result = deps.companionAuth.pairDevice(parsed.value);

        if (result.status === "approved") {
          const identity = deps.serverIdentity();

          return {
            body: {
              serverId: identity.serverId,
              serverName: identity.serverName,
              status: "approved"
            },
            status: 200
          };
        }

        if (result.status === "pending") {
          return {
            body: {
              pairRequestId: result.pairRequestId,
              status: "pending"
            },
            status: 202
          };
        }

        return {
          body: companionError(
            result.reason === "pairing_expired" ? "pairing_expired" : "unauthorized",
            pairingFailureMessage(result.reason)
          ),
          status: 401
        };
      },
      method: "POST",
      path: "/companion/v1/pair"
    },
    {
      handler: async ({ params, query }) => {
        const projectId = params.get("projectId");
        const requestedPath = query.get("path");

        if (!projectId || !requestedPath || !isSafeRelativePath(requestedPath)) {
          return {
            body: companionError("not_found", "File diff not found"),
            status: 404
          };
        }

        const workspace = await loadWorkspaceSingleFlight(projectId);
        const file = workspace.files.find(
          (candidate) => candidate.path === requestedPath
        );

        if (!file) {
          return {
            body: companionError("not_found", "File diff not found"),
            status: 404
          };
        }

        return {
          body: await deps.loadFileDiff(projectId, requestedPath),
          status: 200
        };
      },
      method: "GET",
      path: "/companion/v1/projects/:projectId/files/diff"
    },
    {
      handler: () => ({
        body: { projects: deps.listRecentProjects() },
        status: 200
      }),
      method: "GET",
      path: "/companion/v1/projects"
    },
    {
      handler: async ({ params }) => {
        const projectId = params.get("projectId");

        if (!projectId) {
          return {
            body: companionError("not_found", "Workspace not found"),
            status: 404
          };
        }

        return {
          body: { workspace: await loadWorkspaceSingleFlight(projectId) },
          status: 200
        };
      },
      method: "GET",
      path: "/companion/v1/projects/:projectId/workspace"
    },
    {
      handler: async ({ body, params }) => {
        const projectId = params.get("projectId");
        const parsed = parseMarkReviewedBody(body);

        if (!projectId || !parsed.ok) {
          return badRequest(parsed.ok ? "Missing projectId" : parsed.error);
        }

        const result = await deps.markReviewed({ ...parsed.value, projectId });

        return "stale" in result
          ? { body: companionError("stale_diff", "Displayed diff is stale"), status: 409 }
          : { body: result, status: 200 };
      },
      method: "POST",
      path: "/companion/v1/projects/:projectId/reviews/mark"
    },
    {
      handler: async ({ body, params }) => {
        const projectId = params.get("projectId");
        const parsed = parseMarkReviewedBody(body);

        if (!projectId || !parsed.ok) {
          return badRequest(parsed.ok ? "Missing projectId" : parsed.error);
        }

        const result = await deps.unmarkReviewed({ ...parsed.value, projectId });

        return "stale" in result
          ? { body: companionError("stale_diff", "Displayed diff is stale"), status: 409 }
          : { body: result, status: 200 };
      },
      method: "POST",
      path: "/companion/v1/projects/:projectId/reviews/unmark"
    },
    {
      handler: async ({ params }) => {
        const projectId = params.get("projectId");

        if (!projectId) {
          return {
            body: companionError("not_found", "Comments not found"),
            status: 404
          };
        }

        return {
          body: { comments: (await loadWorkspaceSingleFlight(projectId)).comments },
          status: 200
        };
      },
      method: "GET",
      path: "/companion/v1/projects/:projectId/comments"
    },
    {
      handler: async ({ body, params }) => {
        const projectId = params.get("projectId");
        const parsed = parseCreateCommentBody(body);

        if (!projectId || !parsed.ok) {
          return badRequest(parsed.ok ? "Missing projectId" : parsed.error);
        }
        if (parsed.value.body.length > 20_000) {
          return badRequest("Comment body is too long");
        }

        return {
          body: { comment: await deps.createComment({ ...parsed.value, projectId }) },
          status: 200
        };
      },
      method: "POST",
      path: "/companion/v1/projects/:projectId/comments"
    },
    {
      handler: async ({ body, params }) => {
        const commentId = params.get("commentId");
        const parsed = parseUpdateCommentBody(body);

        if (!commentId || !parsed.ok) {
          return badRequest(parsed.ok ? "Missing commentId" : parsed.error);
        }
        if (parsed.value.body.length > 20_000) {
          return badRequest("Comment body is too long");
        }

        const comment = await deps.updateComment({ ...parsed.value, commentId });

        return comment
          ? { body: { comment }, status: 200 }
          : { body: companionError("not_found", "Comment not found"), status: 404 };
      },
      method: "PATCH",
      path: "/companion/v1/comments/:commentId"
    },
    {
      handler: async ({ params }) => {
        const commentId = params.get("commentId");

        if (!commentId) {
          return {
            body: companionError("not_found", "Comment not found"),
            status: 404
          };
        }

        return (await deps.deleteComment(commentId))
          ? {
              body: { deleted: true },
              status: 200
            }
          : {
              body: companionError("not_found", "Comment not found"),
              status: 404
            };
      },
      method: "DELETE",
      path: "/companion/v1/comments/:commentId"
    },
    {
      handler: async ({ params }) => {
        const projectId = params.get("projectId");

        if (!projectId) {
          return {
            body: companionError("not_found", "Comment report not found"),
            status: 404
          };
        }

        return {
          body: { report: await deps.commentsReport(projectId) },
          status: 200
        };
      },
      method: "GET",
      path: "/companion/v1/projects/:projectId/comments/report"
    },
    {
      handler: async ({ params }) => {
        const projectId = params.get("projectId");

        if (!projectId) {
          return {
            body: companionError("not_found", "Branches not found"),
            status: 404
          };
        }

        return {
          body: { refs: await deps.listBranchRefs(projectId) },
          status: 200
        };
      },
      method: "GET",
      path: "/companion/v1/projects/:projectId/branches"
    },
    {
      handler: async ({ params }) => {
        const projectId = params.get("projectId");

        if (!projectId) {
          return {
            body: companionError("not_found", "Commits not found"),
            status: 404
          };
        }

        return {
          body: { commits: await deps.listRecentCommits(projectId) },
          status: 200
        };
      },
      method: "GET",
      path: "/companion/v1/projects/:projectId/commits"
    },
    {
      handler: async ({ body, params }) => {
        const projectId = params.get("projectId");
        const parsed = parseDiffTargetBody(body);

        if (!projectId || !parsed.ok) {
          return badRequest(parsed.ok ? "Missing projectId" : parsed.error);
        }

        return {
          body: { workspace: await deps.updateDiffTarget(projectId, parsed.value) },
          status: 200
        };
      },
      method: "POST",
      path: "/companion/v1/projects/:projectId/diff-target"
    }
  ];
}

function badRequest(message: string): CompanionResponse {
  return {
    body: companionError("bad_request", message),
    status: 400
  };
}

function pairingFailureMessage(
  reason: "locked" | "not_found" | "pairing_expired" | "wrong_code"
): string {
  switch (reason) {
    case "locked":
      return "Pairing is locked after too many incorrect codes";
    case "not_found":
    case "pairing_expired":
      return "Pairing has expired";
    case "wrong_code":
      return "Pairing code is incorrect";
  }
}

export function companionError(
  code:
    | "bad_request"
    | "forbidden"
    | "internal"
    | "not_found"
    | "pairing_expired"
    | "protocol_mismatch"
    | "stale_diff"
    | "unauthorized",
  message: string
): {
  readonly error: {
    readonly code: typeof code;
    readonly message: string;
    readonly protocolVersion: number;
  };
} {
  return {
    error: {
      code,
      message,
      protocolVersion: COMPANION_PROTOCOL_VERSION
    }
  };
}

export function isSafeRelativePath(input: string): boolean {
  if (input.length === 0 || posixPath.isAbsolute(input) || input.includes("\\")) {
    return false;
  }

  return !input.split("/").some((part) => part === "" || part === "." || part === "..");
}

export type ConnectedDevice = {
  readonly devicePk: string;
  readonly send: (event: CompanionServerEvent) => void;
};
