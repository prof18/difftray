import type { FeedbackActor } from "@difftray/companion-protocol";
import type { ReviewTarget } from "@difftray/core";
import type { AppFlavor } from "./app-flavor.js";

export const CLI_PROTOCOL_VERSION = 1;
export const CLI_NAME = "difftray";
export const CLI_ALPHA_NAME = "difftray-alpha";
export const CLI_BUNDLE_PATH = "Contents/Resources/bin/difftray";
export const CLI_JS_PATH = "Contents/Resources/app.asar/dist/cli/index.cjs";
export const CLI_INSTALL_DIRECTORY = "~/.local/bin";
export const APP_OVERRIDE_ENV = "DIFFTRAY_APP_PATH";
export const PROFILE_OVERRIDE_ENV = "DIFFTRAY_USER_DATA_DIR";
export const GUI_BACKGROUND_ARGUMENT = "--agent-background";
export const RUNTIME_MODE_ENV = "ELECTRON_RUN_AS_NODE";
export const SOCKET_FILENAME = "control.sock";
export const ENDPOINT_FILENAME = "endpoint.json";
export const PRIVATE_DIRECTORY_MODE = 0o700;
export const PRIVATE_FILE_MODE = 0o600;
export const TOKEN_BYTES = 32;
export const STARTUP_TIMEOUT_MS = 30_000;
export const REQUEST_TIMEOUT_MS = 120_000;
export const CONNECT_RETRY_MS = 100;
export const SOCKET_IDLE_TIMEOUT_MS = 5_000;
export const MAX_CONNECTIONS = 16;
export const MAX_REQUEST_BYTES = 1_048_576;
export const MAX_RESPONSE_BYTES = 16_777_216;
export const MAX_BATCH_ITEMS = 100;
export const MAX_BODY_CHARACTERS = 10_000;
export const MAX_LABEL_CHARACTERS = 80;
export const MAX_IDENTIFIER_CHARACTERS = 128;
export const PAGE_SIZE_DEFAULT = 100;
export const PAGE_SIZE_MAX = 500;
export const CONTEXT_TTL_MS = 86_400_000;
export const MAX_LIVE_CONTEXTS = 128;
export const MAX_CONTEXT_FILES = 10_000;
export const CONTEXT_ID_PREFIX = "ctx_";
export const EXIT_OK = 0;
export const EXIT_USAGE = 2;
export const EXIT_NOT_AVAILABLE = 3;
export const EXIT_CONFLICT = 4;
export const EXIT_IO = 5;
export const EXIT_INTERNAL = 1;
export const AGENT_OPERATION_NAMES = [
  "hello",
  "open",
  "review.inspect",
  "review.files",
  "review.file",
  "review.feedback",
  "review.export",
  "feedback.submit"
] as const;
export type AgentMethod = (typeof AGENT_OPERATION_NAMES)[number];
export const AGENT_ERROR_CODES = [
  "invalid_request",
  "unsupported_version",
  "unauthorized",
  "app_unavailable",
  "profile_mismatch",
  "repository_missing",
  "invalid_target",
  "context_missing",
  "context_expired",
  "stale_review",
  "stale_diff",
  "stale_feedback",
  "note_conflict",
  "idempotency_conflict",
  "limit_exceeded",
  "busy",
  "request_timeout",
  "internal_error"
] as const;
export type AgentErrorCode = (typeof AGENT_ERROR_CODES)[number];
export const FEEDBACK_KINDS = ["line", "file", "overall"] as const;
export const LINE_SIDES = ["additions", "deletions"] as const;
export const CLI_TARGETS = ["working-tree", "branch", "commit", "selected"] as const;

export type ExplicitAgentSelector =
  | { readonly kind: "working-tree" }
  | { readonly kind: "branch"; readonly base: string }
  | { readonly kind: "commit"; readonly commit: string };
export type AgentSelector = ExplicitAgentSelector | { readonly kind: "selected" };
export type AgentContextFile = {
  readonly path: string;
  readonly previousPath?: string;
  readonly diffHash: string;
  readonly kind: "text" | "binary" | "symlink" | "submodule" | "mode_only";
  readonly visible: boolean;
};
export type AgentReviewContext = {
  readonly id: string;
  readonly projectId: string;
  readonly canonicalWorktreePath: string;
  readonly gitDir: string;
  readonly commonGitDir: string;
  readonly repositoryIdentity: string;
  readonly selector: ExplicitAgentSelector;
  readonly reviewTarget: ReviewTarget;
  readonly reviewTargetId: string;
  readonly snapshotHash: string;
  /** Attributes and diff config for commit and branch diffs; absent on older contexts. */
  readonly diffSettingsHash?: string;
  readonly showGeneratedFiles: boolean;
  readonly files: readonly AgentContextFile[];
  readonly createdAt: number;
  readonly expiresAt: number;
};
export type FeedbackItem =
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
      readonly expectedNoteVersion: string;
      readonly body: string;
    };
export type FeedbackSubmission = {
  readonly actor: { readonly name: string; readonly runId: string };
  readonly requestId: string;
  readonly items: readonly FeedbackItem[];
};
export type AgentRequest = {
  readonly version: 1;
  readonly id: string;
  readonly token: string;
} & (
  | { readonly method: "hello"; readonly params: Record<string, never> }
  | {
      readonly method: "open";
      readonly params: {
        readonly repoPath: string;
        readonly selector: ExplicitAgentSelector;
      };
    }
  | {
      readonly method: "review.inspect";
      readonly params: { readonly repoPath: string; readonly selector: AgentSelector };
    }
  | {
      readonly method: "review.files";
      readonly params: {
        readonly contextId: string;
        readonly limit?: number;
        readonly cursor?: string;
      };
    }
  | {
      readonly method: "review.file";
      readonly params: { readonly contextId: string; readonly path: string };
    }
  | {
      readonly method: "review.feedback";
      readonly params: {
        readonly contextId: string;
        readonly limit?: number;
        readonly cursor?: string;
        readonly includeInactive?: boolean;
      };
    }
  | {
      readonly method: "review.export";
      readonly params: { readonly contextId: string; readonly format: "prompt" | "json" };
    }
  | {
      readonly method: "feedback.submit";
      readonly params: {
        readonly contextId: string;
        readonly submission: FeedbackSubmission;
      };
    }
);
export type AgentError = {
  readonly code: AgentErrorCode;
  readonly message: string;
  readonly retryable: boolean;
};
export type AgentResultMap = {
  hello: {
    readonly appVersion: string;
    readonly protocolVersion: 1;
    readonly instanceId: string;
    readonly profilePath: string;
    readonly appId: string;
    readonly flavor: AppFlavor;
    readonly executablePath: string;
  };
  open: {
    readonly projectId: string;
    readonly repoPath: string;
    readonly target: ReviewTarget;
  };
  "review.inspect": {
    readonly contextId: string;
    readonly projectId: string;
    readonly repoPath: string;
    readonly target: ReviewTarget;
    readonly targetId: string;
    readonly snapshotHash: string;
    readonly fileCount: number;
    readonly visibleFileCount: number;
    readonly expiresAt: number;
    readonly noteVersion: string;
    readonly note: { readonly body: string; readonly dismissedAt: string | null } | null;
  };
  "review.files": {
    readonly files: AgentContextFile[];
    readonly total: number;
    readonly nextCursor: string | null;
  };
  "review.file": {
    readonly path: string;
    readonly previousPath?: string;
    readonly diffHash: string;
    readonly renderDiffHash?: string;
    readonly content:
      | {
          readonly kind: "text";
          readonly patch: string;
          readonly oldText?: string;
          readonly newText?: string;
        }
      | { readonly kind: "binary"; readonly digest: string; readonly byteSize: number }
      | {
          readonly kind: "symlink";
          readonly oldTarget?: string;
          readonly newTarget?: string;
        }
      | {
          readonly kind: "submodule";
          readonly oldCommit?: string;
          readonly newCommit?: string;
        }
      | { readonly kind: "mode_only" }
      | { readonly kind: "oversized"; readonly reason: "patch_too_large" };
    readonly selectableRanges: {
      readonly additions: readonly { readonly start: number; readonly end: number }[];
      readonly deletions: readonly { readonly start: number; readonly end: number }[];
    };
  };
  "review.feedback": {
    readonly items: AgentFeedbackView[];
    readonly total: number;
    readonly nextCursor: string | null;
    readonly feedbackVersion: string;
    readonly inactiveCount?: number;
    readonly noteVersion: string;
    readonly note: { readonly body: string; readonly dismissedAt: string | null } | null;
  };
  "review.export":
    | {
        readonly format: "prompt";
        readonly content: string;
        readonly metadata?: AgentExportMetadata;
      }
    | {
        readonly format: "json";
        readonly metadata?: AgentExportMetadata;
        readonly content: {
          readonly contextId: string;
          readonly target: ReviewTarget;
          readonly items: AgentFeedbackView[];
          readonly note: {
            readonly body: string;
            readonly dismissedAt: string | null;
          } | null;
          readonly noteVersion: string;
        };
      };
  "feedback.submit": {
    readonly requestId: string;
    readonly deduplicated: boolean;
    readonly itemIds: string[];
    readonly noteVersion: string;
  };
};
export type AgentExportMetadata = {
  readonly feedbackVersion: string;
  readonly inactiveCount: number;
  readonly reviewedPathCount: number;
  readonly reviewedPathLimit: number;
  readonly reviewedPathsTruncated: boolean;
};
export type AgentFeedbackView = {
  readonly createdBy?: FeedbackActor;
  readonly lastEditedBy?: FeedbackActor;
  readonly reviewTargetId?: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly id: string;
  readonly kind: "line" | "file" | "overall";
  readonly body: string;
  readonly active: boolean;
  readonly path?: string;
  readonly previousPath?: string;
  readonly diffHash?: string;
  readonly side?: "additions" | "deletions";
  readonly lineStart?: number;
  readonly lineEnd?: number;
  readonly inactiveReason?: string;
  readonly actor?: {
    readonly kind: "human" | "agent";
    readonly name: string;
    readonly runId?: string;
  };
};
export type AgentResponse<M extends AgentMethod = AgentMethod> = {
  readonly version: 1;
  readonly id: string;
} & (
  | { readonly ok: false; readonly error: AgentError }
  | { readonly ok: true; readonly result: AgentResultMap[M] }
);
export class AgentProtocolError extends Error {
  constructor(
    readonly code: AgentErrorCode,
    message: string
  ) {
    super(message);
    this.name = "AgentProtocolError";
  }
}
const fail = (message: string, code: AgentErrorCode = "invalid_request"): never => {
  throw new AgentProtocolError(code, message);
};
const object = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return fail("Expected object");
  const record = value as Record<string, unknown>;
  if (
    required.some((key) => !Object.hasOwn(record, key)) ||
    Object.keys(record).some((key) => !required.includes(key) && !optional.includes(key))
  )
    return fail("Unexpected or missing field");
  return record;
};
const str = (value: unknown, max = MAX_IDENTIFIER_CHARACTERS): string => {
  if (typeof value !== "string" || !value.trim()) return fail("Expected nonempty string");
  if (Array.from(value).length > max) return fail("String too long", "limit_exceeded");
  return value;
};
const identifier = (value: unknown): string => {
  const s = str(value);
  if (!/^[A-Za-z0-9_.-]+$/.test(s)) return fail("Invalid identifier");
  return s;
};
const cursor = (value: unknown): string => {
  const s = str(value, 4096);
  if (!/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(s)) return fail("Invalid cursor");
  return s;
};
const contextId = (value: unknown): string => {
  const s = str(value);
  if (!/^ctx_[a-fA-F0-9]{32}$/.test(s)) return fail("Invalid context ID");
  return s;
};
function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || (code >= 127 && code <= 159);
  });
}
// Any name Git can track is valid, including backslashes and control
// characters; paths only travel as escaped JSON and match the manifest exactly.
const path = (value: unknown): string => {
  const s = str(value, 4096);
  if (
    s.startsWith("/") ||
    s.split("/").some((part) => !part || part === "." || part === "..")
  )
    return fail("Invalid relative path");
  return s;
};
const nonempty = (value: unknown, max = MAX_IDENTIFIER_CHARACTERS): string => {
  const s = str(value, max);
  if (hasControlCharacter(s)) return fail("Control character");
  return s;
};
const body = (value: unknown): string => str(value, MAX_BODY_CHARACTERS);
// Human-authored records predate the submission bound. The response frame caps their size.
const responseBody = (value: unknown): string => str(value, MAX_RESPONSE_BYTES);
const gitRef = (value: unknown): string => {
  const ref = nonempty(value, 4096);
  if (ref.startsWith("-")) return fail("Git ref cannot begin with an option prefix");
  return ref;
};
const enumValue = <T extends string>(value: unknown, choices: readonly T[]): T =>
  choices.includes(value as T) ? (value as T) : fail("Invalid enum value");
const integer = (value: unknown, min: number, max: number): number =>
  Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max
    ? (value as number)
    : fail("Invalid integer");
const optional = (value: unknown, validate: (v: unknown) => unknown): void => {
  if (value !== undefined) validate(value);
};
function selector(value: unknown, allowSelected: boolean): AgentSelector {
  const r = object(value, ["kind"], ["base", "commit"]);
  switch (r.kind) {
    case "working-tree":
      object(r, ["kind"]);
      return r as { kind: "working-tree" };
    case "selected":
      if (!allowSelected) return fail("Selected target unavailable for open");
      object(r, ["kind"]);
      return r as { kind: "selected" };
    case "branch":
      object(r, ["kind", "base"]);
      gitRef(r.base);
      return r as { kind: "branch"; base: string };
    case "commit":
      object(r, ["kind", "commit"]);
      gitRef(r.commit);
      return r as { kind: "commit"; commit: string };
    default:
      return fail("Unknown selector");
  }
}
function frame(input: string | Uint8Array, max: number): unknown {
  const bytes =
    typeof input === "string" ? Buffer.byteLength(input, "utf8") : input.byteLength;
  if (bytes > max) return fail("Frame too large", "limit_exceeded");
  let text: string;
  try {
    text =
      typeof input === "string"
        ? input
        : new TextDecoder("utf-8", { fatal: true }).decode(input);
  } catch {
    return fail("Invalid UTF-8");
  }
  if (!text.endsWith("\n") || text.slice(0, -1).includes("\n"))
    return fail("Expected one LF-terminated frame");
  try {
    return JSON.parse(text.slice(0, -1)) as unknown;
  } catch {
    return fail("Invalid JSON");
  }
}
function validateSubmission(value: unknown): FeedbackSubmission {
  const r = object(value, ["actor", "requestId", "items"]);
  const actor = object(r.actor, ["name", "runId"]);
  nonempty(actor.name, MAX_LABEL_CHARACTERS);
  identifier(actor.runId);
  identifier(r.requestId);
  if (!Array.isArray(r.items) || r.items.length < 1) return fail("Empty feedback batch");
  if (r.items.length > MAX_BATCH_ITEMS)
    return fail("Feedback batch too large", "limit_exceeded");
  let overall = 0;
  for (const item of r.items) {
    const kind =
      item !== null && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>).kind
        : fail("Invalid feedback item");
    if (kind === "line") {
      const x = object(
        item,
        ["kind", "path", "diffHash", "side", "lineStart", "lineEnd", "body"],
        ["previousPath"]
      );
      path(x.path);
      optional(x.previousPath, path);
      nonempty(x.diffHash);
      enumValue(x.side, LINE_SIDES);
      integer(x.lineStart, 1, Number.MAX_SAFE_INTEGER);
      integer(x.lineEnd, x.lineStart as number, Number.MAX_SAFE_INTEGER);
      body(x.body);
    } else if (kind === "file") {
      const x = object(item, ["kind", "path", "diffHash", "body"], ["previousPath"]);
      path(x.path);
      optional(x.previousPath, path);
      nonempty(x.diffHash);
      body(x.body);
    } else if (kind === "overall") {
      const x = object(item, ["kind", "expectedNoteVersion", "body"]);
      nonempty(x.expectedNoteVersion);
      body(x.body);
      overall++;
    } else fail("Unknown feedback kind");
  }
  if (overall > 1) return fail("Only one overall note allowed");
  return r as FeedbackSubmission;
}
export function parseAgentRequest(input: string | Uint8Array): AgentRequest {
  const r = object(frame(input, MAX_REQUEST_BYTES), [
    "version",
    "id",
    "token",
    "method",
    "params"
  ]);
  if (r.version !== CLI_PROTOCOL_VERSION)
    return fail("Unsupported version", "unsupported_version");
  identifier(r.id);
  if (typeof r.token !== "string" || !/^[a-fA-F0-9]{64}$/.test(r.token))
    return fail("Invalid token", "unauthorized");
  const method = enumValue(r.method, AGENT_OPERATION_NAMES);
  const p = r.params;
  switch (method) {
    case "hello":
      object(p, []);
      break;
    case "open":
    case "review.inspect": {
      const x = object(p, ["repoPath", "selector"]);
      nonempty(x.repoPath, 4096);
      selector(x.selector, method === "review.inspect");
      break;
    }
    case "review.files":
    case "review.feedback": {
      const x = object(
        p,
        ["contextId"],
        method === "review.files"
          ? ["limit", "cursor"]
          : ["limit", "cursor", "includeInactive"]
      );
      contextId(x.contextId);
      optional(x.limit, (v) => integer(v, 1, PAGE_SIZE_MAX));
      optional(x.cursor, cursor);
      if (
        method === "review.feedback" &&
        x.includeInactive !== undefined &&
        typeof x.includeInactive !== "boolean"
      )
        fail("Invalid includeInactive");
      break;
    }
    case "review.file": {
      const x = object(p, ["contextId", "path"]);
      contextId(x.contextId);
      path(x.path);
      break;
    }
    case "review.export": {
      const x = object(p, ["contextId", "format"]);
      contextId(x.contextId);
      enumValue(x.format, ["prompt", "json"]);
      break;
    }
    case "feedback.submit": {
      const x = object(p, ["contextId", "submission"]);
      contextId(x.contextId);
      validateSubmission(x.submission);
      break;
    }
  }
  return r as AgentRequest;
}
function result(value: unknown, method: AgentMethod): void {
  switch (method) {
    case "hello": {
      const x = object(value, [
        "appVersion",
        "protocolVersion",
        "instanceId",
        "profilePath",
        "appId",
        "flavor",
        "executablePath"
      ]);
      nonempty(x.appVersion);
      if (x.protocolVersion !== CLI_PROTOCOL_VERSION)
        fail("Wrong result protocol version");
      identifier(x.instanceId);
      nonempty(x.profilePath, 4096);
      nonempty(x.appId);
      enumValue(x.flavor, ["alpha", "dev", "production"] satisfies AppFlavor[]);
      nonempty(x.executablePath, 4096);
      break;
    }
    case "open": {
      const x = object(value, ["projectId", "repoPath", "target"]);
      nonempty(x.projectId, 4096);
      nonempty(x.repoPath, 4096);
      reviewTarget(x.target);
      break;
    }
    case "review.inspect": {
      const x = object(value, [
        "contextId",
        "projectId",
        "repoPath",
        "target",
        "targetId",
        "snapshotHash",
        "fileCount",
        "visibleFileCount",
        "expiresAt",
        "noteVersion",
        "note"
      ]);
      contextId(x.contextId);
      nonempty(x.projectId, 4096);
      nonempty(x.repoPath, 4096);
      reviewTarget(x.target);
      nonempty(x.targetId);
      nonempty(x.snapshotHash);
      integer(x.fileCount, 0, MAX_CONTEXT_FILES);
      integer(x.visibleFileCount, 0, MAX_CONTEXT_FILES);
      integer(x.expiresAt, 0, Number.MAX_SAFE_INTEGER);
      nonempty(x.noteVersion);
      note(x.note);
      break;
    }
    case "review.files": {
      const x = object(value, ["files", "total", "nextCursor"]);
      if (!Array.isArray(x.files) || x.files.length > PAGE_SIZE_MAX)
        fail("Invalid file page");
      (x.files as unknown[]).forEach(fileSummary);
      integer(x.total, 0, MAX_CONTEXT_FILES);
      if (x.nextCursor !== null) cursor(x.nextCursor);
      break;
    }
    case "review.file": {
      const x = object(
        value,
        ["path", "diffHash", "content", "selectableRanges"],
        ["previousPath", "renderDiffHash"]
      );
      path(x.path);
      optional(x.previousPath, path);
      nonempty(x.diffHash);
      optional(x.renderDiffHash, nonempty);
      fileContent(x.content);
      const ranges = object(x.selectableRanges, ["additions", "deletions"]);
      for (const side of LINE_SIDES) {
        const list = ranges[side];
        if (!Array.isArray(list)) fail("Invalid line ranges");
        for (const entry of list as unknown[]) {
          const span = object(entry, ["start", "end"]);
          integer(span.start, 1, Number.MAX_SAFE_INTEGER);
          integer(span.end, span.start as number, Number.MAX_SAFE_INTEGER);
        }
      }
      break;
    }
    case "review.feedback": {
      const x = object(
        value,
        ["items", "total", "nextCursor", "feedbackVersion", "noteVersion", "note"],
        ["inactiveCount"]
      );
      optional(x.inactiveCount, (v) => integer(v, 0, Number.MAX_SAFE_INTEGER));
      if (!Array.isArray(x.items) || x.items.length > PAGE_SIZE_MAX)
        fail("Invalid feedback page");
      (x.items as unknown[]).forEach(feedbackView);
      integer(x.total, 0, Number.MAX_SAFE_INTEGER);
      if (x.nextCursor !== null) cursor(x.nextCursor);
      nonempty(x.feedbackVersion);
      nonempty(x.noteVersion);
      note(x.note);
      break;
    }
    case "review.export": {
      const x = object(value, ["format", "content"], ["metadata"]);
      optional(x.metadata, exportMetadata);
      enumValue(x.format, ["prompt", "json"]);
      if (x.format === "prompt") {
        if (typeof x.content !== "string") fail("Invalid prompt export");
      } else {
        const content = object(x.content, [
          "contextId",
          "target",
          "items",
          "note",
          "noteVersion"
        ]);
        contextId(content.contextId);
        reviewTarget(content.target);
        if (!Array.isArray(content.items)) fail("Invalid export items");
        (content.items as unknown[]).forEach(feedbackView);
        note(content.note);
        nonempty(content.noteVersion);
      }
      break;
    }
    case "feedback.submit": {
      const x = object(value, ["requestId", "deduplicated", "itemIds", "noteVersion"]);
      identifier(x.requestId);
      if (
        typeof x.deduplicated !== "boolean" ||
        !Array.isArray(x.itemIds) ||
        x.itemIds.length > MAX_BATCH_ITEMS
      )
        fail("Invalid receipt");
      // Stored IDs include versioned note-scope hashes, not only request UUIDs.
      (x.itemIds as unknown[]).forEach((id) => nonempty(id));
      nonempty(x.noteVersion);
      break;
    }
  }
}
function reviewTarget(value: unknown): void {
  const base = object(
    value,
    ["kind", "projectId"],
    [
      "headSha",
      "headRefName",
      "baseRefName",
      "baseSha",
      "mergeBaseSha",
      "commitSha",
      "commitShortSha",
      "commitSubject",
      "parentSha"
    ]
  );
  nonempty(base.projectId, 4096);
  nonempty(base.headSha);
  switch (base.kind) {
    case "working_tree":
      object(base, ["kind", "projectId", "headSha"], ["headRefName"]);
      break;
    case "branch":
      object(
        base,
        ["kind", "projectId", "headSha", "baseRefName", "baseSha", "mergeBaseSha"],
        ["headRefName"]
      );
      nonempty(base.baseRefName, 4096);
      nonempty(base.baseSha);
      nonempty(base.mergeBaseSha);
      break;
    case "commit":
      object(
        base,
        ["kind", "projectId", "headSha", "commitSha", "commitShortSha", "parentSha"],
        ["commitSubject"]
      );
      nonempty(base.commitSha);
      nonempty(base.commitShortSha);
      nonempty(base.parentSha);
      break;
    default:
      fail("Invalid target kind");
  }
  optional(base.headRefName, (v) => nonempty(v, 4096));
  optional(base.commitSubject, (v) => nonempty(v, 4096));
}
function note(value: unknown): void {
  if (value !== null) {
    const x = object(value, ["body", "dismissedAt"]);
    responseBody(x.body);
    if (
      x.dismissedAt !== null &&
      (typeof x.dismissedAt !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(x.dismissedAt) ||
        Number.isNaN(Date.parse(x.dismissedAt)))
    )
      fail("Invalid dismissal timestamp");
  }
}
function fileSummary(value: unknown): void {
  const x = object(value, ["path", "diffHash", "kind", "visible"], ["previousPath"]);
  path(x.path);
  optional(x.previousPath, path);
  nonempty(x.diffHash);
  enumValue(x.kind, ["text", "binary", "symlink", "submodule", "mode_only"]);
  if (typeof x.visible !== "boolean") fail("Invalid visible flag");
}
function fileContent(value: unknown): void {
  const x = object(
    value,
    ["kind"],
    [
      "patch",
      "oldText",
      "newText",
      "digest",
      "byteSize",
      "oldTarget",
      "newTarget",
      "oldCommit",
      "newCommit",
      "reason"
    ]
  );
  switch (x.kind) {
    case "text":
      object(x, ["kind", "patch"], ["oldText", "newText"]);
      if (typeof x.patch !== "string") fail("Invalid patch");
      if (x.oldText !== undefined && typeof x.oldText !== "string")
        fail("Invalid old text");
      if (x.newText !== undefined && typeof x.newText !== "string")
        fail("Invalid new text");
      break;
    case "binary":
      object(x, ["kind", "digest", "byteSize"]);
      nonempty(x.digest);
      integer(x.byteSize, 0, Number.MAX_SAFE_INTEGER);
      break;
    case "symlink":
      object(x, ["kind"], ["oldTarget", "newTarget"]);
      optional(x.oldTarget, nonempty);
      optional(x.newTarget, nonempty);
      break;
    case "submodule":
      object(x, ["kind"], ["oldCommit", "newCommit"]);
      optional(x.oldCommit, nonempty);
      optional(x.newCommit, nonempty);
      break;
    case "mode_only":
      object(x, ["kind"]);
      break;
    case "oversized":
      object(x, ["kind", "reason"]);
      if (x.reason !== "patch_too_large") fail("Invalid oversized reason");
      break;
    default:
      fail("Invalid file content kind");
  }
}
function exportMetadata(value: unknown): void {
  const x = object(value, [
    "feedbackVersion",
    "inactiveCount",
    "reviewedPathCount",
    "reviewedPathLimit",
    "reviewedPathsTruncated"
  ]);
  nonempty(x.feedbackVersion);
  integer(x.inactiveCount, 0, Number.MAX_SAFE_INTEGER);
  integer(x.reviewedPathCount, 0, Number.MAX_SAFE_INTEGER);
  integer(x.reviewedPathLimit, 0, Number.MAX_SAFE_INTEGER);
  if (typeof x.reviewedPathsTruncated !== "boolean") fail("Invalid truncation flag");
}
function feedbackActor(value: unknown): void {
  const actor = object(value, ["kind"], ["name", "runId"]);
  if (actor.kind === "human") {
    object(actor, ["kind"]);
    return;
  }
  if (actor.kind !== "agent") fail("Invalid feedback actor kind");
  object(actor, ["kind", "name", "runId"]);
  nonempty(actor.name, MAX_LABEL_CHARACTERS);
  identifier(actor.runId);
}
function feedbackView(value: unknown): void {
  const x = object(
    value,
    ["id", "kind", "body", "active"],
    [
      "path",
      "previousPath",
      "diffHash",
      "side",
      "lineStart",
      "lineEnd",
      "inactiveReason",
      "actor",
      "createdBy",
      "lastEditedBy",
      "reviewTargetId",
      "createdAt",
      "updatedAt"
    ]
  );
  nonempty(x.id);
  enumValue(x.kind, FEEDBACK_KINDS);
  if (x.kind === "overall")
    object(
      x,
      ["id", "kind", "body", "active"],
      [
        "inactiveReason",
        "actor",
        "createdBy",
        "lastEditedBy",
        "reviewTargetId",
        "createdAt",
        "updatedAt"
      ]
    );
  else if (x.kind === "file")
    object(
      x,
      ["id", "kind", "body", "active", "path", "diffHash"],
      [
        "previousPath",
        "inactiveReason",
        "actor",
        "createdBy",
        "lastEditedBy",
        "reviewTargetId",
        "createdAt",
        "updatedAt"
      ]
    );
  else
    object(
      x,
      [
        "id",
        "kind",
        "body",
        "active",
        "path",
        "diffHash",
        "side",
        "lineStart",
        "lineEnd"
      ],
      [
        "previousPath",
        "inactiveReason",
        "actor",
        "createdBy",
        "lastEditedBy",
        "reviewTargetId",
        "createdAt",
        "updatedAt"
      ]
    );
  responseBody(x.body);
  if (typeof x.active !== "boolean") fail("Invalid active flag");
  if (x.kind !== "overall") {
    path(x.path);
    nonempty(x.diffHash);
    optional(x.previousPath, path);
  }
  if (x.kind === "line") {
    enumValue(x.side, LINE_SIDES);
    integer(x.lineStart, 1, Number.MAX_SAFE_INTEGER);
    integer(x.lineEnd, x.lineStart as number, Number.MAX_SAFE_INTEGER);
  }
  optional(x.inactiveReason, nonempty);
  optional(x.createdBy, feedbackActor);
  optional(x.lastEditedBy, feedbackActor);
  optional(x.reviewTargetId, nonempty);
  optional(x.createdAt, nonempty);
  optional(x.updatedAt, nonempty);
  if (x.actor !== undefined) {
    const actor = object(x.actor, ["kind", "name"], ["runId"]);
    enumValue(actor.kind, ["human", "agent"]);
    nonempty(actor.name, MAX_LABEL_CHARACTERS);
    optional(actor.runId, identifier);
  }
}
export function parseAgentResponse<M extends AgentMethod>(
  input: string | Uint8Array,
  method: M,
  expectedId?: string
): AgentResponse<M> {
  const raw = frame(input, MAX_RESPONSE_BYTES);
  const base = object(raw, ["version", "id", "ok"], ["result", "error"]);
  if (base.version !== CLI_PROTOCOL_VERSION)
    return fail("Unsupported version", "unsupported_version");
  identifier(base.id);
  if (expectedId !== undefined && base.id !== expectedId) fail("Response ID mismatch");
  if (base.ok === true) {
    const x = object(base, ["version", "id", "ok", "result"]);
    result(x.result, enumValue(method, AGENT_OPERATION_NAMES));
  } else if (base.ok === false) {
    const x = object(base, ["version", "id", "ok", "error"]);
    const e = object(x.error, ["code", "message", "retryable"]);
    enumValue(e.code, AGENT_ERROR_CODES);
    nonempty(e.message, 4096);
    if (typeof e.retryable !== "boolean") fail("Invalid retryable flag");
  } else fail("Invalid response status");
  return base as AgentResponse<M>;
}
