export { COMPANION_PROTOCOL_VERSION } from "./version.js";
export {
  decodeBase64Url,
  encodeBase64Url,
  fingerprintPublicKey,
  openEnvelope,
  sealEnvelope,
  shortFingerprint,
  type EncryptedEnvelope,
  type EnvelopeRequestPlain,
  type EnvelopeResponsePlain,
  type OpenEnvelopeInput,
  type OpenEnvelopeResult,
  type SealEnvelopeInput
} from "./envelope.js";
export {
  parseCompanionServerEvent,
  parseCreateCommentBody,
  parseDiffTargetBody,
  parseFileImageBody,
  parseMarkReviewedBody,
  parsePairRequestBody,
  parseUpdateCommentBody,
  type ParseResult
} from "./parse.js";

export type CompanionErrorCode =
  | "bad_request"
  | "forbidden"
  | "internal"
  | "not_found"
  | "pairing_expired"
  | "protocol_mismatch"
  | "stale_diff"
  | "unauthorized";

export type CompanionErrorBody = {
  readonly error: {
    readonly code: CompanionErrorCode;
    readonly message: string;
    readonly protocolVersion: number;
  };
};

export type FileDiffStatus =
  | "added"
  | "deleted"
  | "modified"
  | "mode_changed"
  | "renamed";

export type FileDiffContentKind =
  | "binary"
  | "mode_only"
  | "submodule"
  | "symlink"
  | "text";

export type ReviewCommentSide = "additions" | "deletions";
export type FileImageSide = "new" | "old";
export type RasterImageMimeType = "image/jpeg" | "image/png" | "image/webp";

export type RecentProjectView = {
  readonly defaultBaseRef?: string;
  readonly defaultCommitRef?: string;
  readonly defaultDiffTargetMode?: "branch" | "commit" | "working_tree";
  readonly id: string;
  readonly lastOpenedAt?: string;
  readonly name: string;
  readonly path: string;
  readonly reviewSummary?: ProjectReviewSummaryView;
};

export type ProjectReviewSummaryView = {
  readonly attentionCount: number;
  readonly progress: ReviewProgressView;
};

export type ReviewProgressView = {
  readonly reviewedVisibleFiles: number;
  readonly totalVisibleReviewableFiles: number;
};

export type ReviewFileView = {
  readonly additions: number;
  readonly deletions: number;
  readonly diffHash: string;
  readonly diffLoaded: boolean;
  readonly generated: boolean;
  readonly invalidated: boolean;
  readonly newText?: string;
  readonly oldText?: string;
  readonly path: string;
  readonly patch?: string;
  readonly previousPath?: string;
  readonly reviewable: boolean;
  readonly reviewed: boolean;
  readonly status: FileDiffStatus;
  readonly visible: boolean;
};

export type ReviewFileDiffContentView = {
  readonly additions: number;
  readonly deletions: number;
  readonly newText?: string;
  readonly oldText?: string;
  readonly patch: string;
  readonly path: string;
  readonly status: FileDiffStatus;
};

export type ReviewCommentView = {
  readonly body: string;
  readonly createdAt: string;
  readonly diffHash: string;
  readonly id: string;
  readonly lineEnd: number;
  readonly lineStart: number;
  readonly path: string;
  readonly previousPath?: string;
  readonly side: ReviewCommentSide;
  readonly updatedAt: string;
};

export type ReviewWorkspaceView = {
  readonly comments: readonly ReviewCommentView[];
  readonly files: readonly ReviewFileView[];
  readonly project: RecentProjectView;
  readonly progress: ReviewProgressView;
  readonly reviewTarget: {
    readonly baseRefName?: string;
    readonly commitSha?: string;
    readonly commitShortSha?: string;
    readonly commitSubject?: string;
    readonly headRefName?: string;
    readonly headSha: string;
    readonly id: string;
    readonly kind: "branch" | "commit" | "working_tree";
  };
};

export type PairingQrPayload = {
  readonly addresses: readonly string[];
  readonly expiresAt: string;
  readonly kind: "difftray-pairing";
  readonly protocolVersion: number;
  readonly secret: string;
  readonly serverId: string;
  readonly serverName: string;
  readonly serverPublicKey: string;
};

export type HandshakeResponse = {
  readonly appVersion: string;
  readonly pairingOpen: boolean;
  readonly protocolVersion: number;
  readonly serverId: string;
  readonly serverName: string;
  readonly serverPublicKey: string;
};

export type PairRequestBody = {
  readonly code?: string;
  readonly deviceId: string;
  readonly deviceName: string;
  readonly devicePublicKey: string;
  readonly platform: "android" | "ios";
  readonly protocolVersion: number;
  readonly secret?: string;
};

export type PairApprovedResponse = {
  readonly serverId: string;
  readonly serverName: string;
  readonly status: "approved";
};

export type PairPendingResponse = {
  readonly pairRequestId?: string;
  readonly status: "pending";
};

export type MarkReviewedBody = {
  readonly displayedDiffHash: string;
  readonly path: string;
  readonly previousPath?: string;
  readonly reviewTargetId: string;
};

export type CreateCommentBody = {
  readonly body: string;
  readonly diffHash: string;
  readonly lineEnd: number;
  readonly lineStart: number;
  readonly path: string;
  readonly previousPath?: string;
  readonly reviewTargetId: string;
  readonly side: ReviewCommentSide;
};

export type UpdateCommentBody = {
  readonly body: string;
};

export type FileImageBody = {
  readonly path: string;
  readonly side: FileImageSide;
};

export type DiffTargetBody =
  | { readonly mode: "working_tree" }
  | { readonly mode: "branch"; readonly ref: string }
  | { readonly mode: "commit"; readonly ref: string };

export type WorkspaceSummary = {
  readonly files: readonly {
    readonly invalidated: boolean;
    readonly path: string;
    readonly reviewed: boolean;
  }[];
  readonly progress: ReviewProgressView;
};

export type ProjectsResponse = {
  readonly projects: readonly RecentProjectView[];
};

export type WorkspaceResponse = {
  readonly workspace: ReviewWorkspaceView;
};

export type FileDiffResponse = {
  readonly content: ReviewFileDiffContentView;
  readonly contentKind: FileDiffContentKind;
  readonly diffHash: string;
};

export type FileImageResponse = {
  readonly diffHash: string;
  readonly image: {
    readonly dataBase64: string;
    readonly height: number;
    readonly mimeType: RasterImageMimeType;
    readonly width: number;
  };
  readonly side: FileImageSide;
};

export type MarkReviewedResponse =
  | {
      readonly marked: true;
      readonly workspaceSummary: WorkspaceSummary;
    }
  | {
      readonly unmarked: true;
      readonly workspaceSummary: WorkspaceSummary;
    };

export type CommentsResponse = {
  readonly comments: readonly ReviewCommentView[];
};

export type CommentResponse = {
  readonly comment: ReviewCommentView;
};

export type DeleteCommentResponse = {
  readonly deleted: boolean;
};

export type CommentReportResponse = {
  readonly report: string;
};

export type BranchRefsResponse = {
  readonly refs: readonly string[];
};

export type RecentCommitsResponse = {
  readonly commits: readonly {
    readonly authoredAt?: string;
    readonly sha: string;
    readonly shortSha: string;
    readonly subject: string;
  }[];
};

export type CompanionServerEvent =
  | {
      readonly kind: "hello";
      readonly protocolVersion: number;
      readonly serverName: string;
    }
  | {
      readonly kind: "workspace_changed";
      readonly projectId: string;
      readonly reason: "comments" | "diff_target" | "filesystem" | "review_state";
    }
  | { readonly kind: "device_revoked" }
  | { readonly kind: "server_stopping" };

export type CompanionClientEvent = {
  readonly kind: "ping";
};
