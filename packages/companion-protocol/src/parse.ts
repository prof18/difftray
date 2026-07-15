import type {
  CompanionServerEvent,
  CreateCommentBody,
  DiffTargetBody,
  FileImageBody,
  MarkReviewedBody,
  PairRequestBody,
  UpdateCommentBody
} from "./index.js";

export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly error: string; readonly ok: false };

const platforms = ["android", "ios"] as const;
const commentSides = ["additions", "deletions"] as const;
const fileImageSides = ["new", "old"] as const;
const workspaceChangedReasons = [
  "comments",
  "diff_target",
  "filesystem",
  "review_state"
] as const;

export function parsePairRequestBody(input: unknown): ParseResult<PairRequestBody> {
  const deviceId = readString(input, "deviceId");
  if (!deviceId.ok) return deviceId;
  const deviceName = readString(input, "deviceName");
  if (!deviceName.ok) return deviceName;
  const devicePublicKey = readString(input, "devicePublicKey");
  if (!devicePublicKey.ok) return devicePublicKey;
  const platform = readEnum(input, "platform", platforms);
  if (!platform.ok) return platform;
  const protocolVersion = readNumber(input, "protocolVersion");
  if (!protocolVersion.ok) return protocolVersion;
  const secret = readOptionalString(input, "secret");
  if (!secret.ok) return secret;
  const code = readOptionalString(input, "code");
  if (!code.ok) return code;

  if ((secret.value === undefined) === (code.value === undefined)) {
    return { error: "provide exactly one of secret or code", ok: false };
  }

  if (code.value !== undefined && !/^\d{6}$/.test(code.value)) {
    return { error: "code must be 6 digits", ok: false };
  }

  return {
    ok: true,
    value: {
      ...(code.value !== undefined ? { code: code.value } : {}),
      deviceId: deviceId.value,
      deviceName: deviceName.value,
      devicePublicKey: devicePublicKey.value,
      platform: platform.value,
      protocolVersion: protocolVersion.value,
      ...(secret.value !== undefined ? { secret: secret.value } : {})
    }
  };
}

export function parseMarkReviewedBody(input: unknown): ParseResult<MarkReviewedBody> {
  const displayedDiffHash = readString(input, "displayedDiffHash");
  if (!displayedDiffHash.ok) return displayedDiffHash;
  const path = readString(input, "path");
  if (!path.ok) return path;
  const previousPath = readOptionalString(input, "previousPath");
  if (!previousPath.ok) return previousPath;
  const reviewTargetId = readString(input, "reviewTargetId");
  if (!reviewTargetId.ok) return reviewTargetId;

  return {
    ok: true,
    value: {
      displayedDiffHash: displayedDiffHash.value,
      path: path.value,
      ...(previousPath.value !== undefined ? { previousPath: previousPath.value } : {}),
      reviewTargetId: reviewTargetId.value
    }
  };
}

export function parseFileImageBody(input: unknown): ParseResult<FileImageBody> {
  const path = readString(input, "path");
  if (!path.ok) return path;
  const side = readEnum(input, "side", fileImageSides);
  if (!side.ok) return side;

  return { ok: true, value: { path: path.value, side: side.value } };
}

export function parseCreateCommentBody(input: unknown): ParseResult<CreateCommentBody> {
  const body = readString(input, "body");
  if (!body.ok) return body;
  const diffHash = readString(input, "diffHash");
  if (!diffHash.ok) return diffHash;
  const lineEnd = readNumber(input, "lineEnd");
  if (!lineEnd.ok) return lineEnd;
  const lineStart = readNumber(input, "lineStart");
  if (!lineStart.ok) return lineStart;
  const path = readString(input, "path");
  if (!path.ok) return path;
  const previousPath = readOptionalString(input, "previousPath");
  if (!previousPath.ok) return previousPath;
  const reviewTargetId = readString(input, "reviewTargetId");
  if (!reviewTargetId.ok) return reviewTargetId;
  const side = readEnum(input, "side", commentSides);
  if (!side.ok) return side;

  return {
    ok: true,
    value: {
      body: body.value,
      diffHash: diffHash.value,
      lineEnd: lineEnd.value,
      lineStart: lineStart.value,
      path: path.value,
      ...(previousPath.value !== undefined ? { previousPath: previousPath.value } : {}),
      reviewTargetId: reviewTargetId.value,
      side: side.value
    }
  };
}

export function parseUpdateCommentBody(input: unknown): ParseResult<UpdateCommentBody> {
  const body = readString(input, "body");
  if (!body.ok) return body;

  return { ok: true, value: { body: body.value } };
}

export function parseDiffTargetBody(input: unknown): ParseResult<DiffTargetBody> {
  const mode = readEnum(input, "mode", ["branch", "commit", "working_tree"] as const);
  if (!mode.ok) return mode;

  switch (mode.value) {
    case "working_tree":
      return { ok: true, value: { mode: "working_tree" } };
    case "branch":
    case "commit": {
      const ref = readString(input, "ref");
      if (!ref.ok) return ref;

      return { ok: true, value: { mode: mode.value, ref: ref.value } };
    }
  }
}

export function parseCompanionServerEvent(
  input: unknown
): ParseResult<CompanionServerEvent> {
  const kind = readString(input, "kind");
  if (!kind.ok) return kind;

  switch (kind.value) {
    case "hello": {
      const protocolVersion = readNumber(input, "protocolVersion");
      if (!protocolVersion.ok) return protocolVersion;
      if (!Number.isInteger(protocolVersion.value)) {
        return { error: "missing protocolVersion", ok: false };
      }
      const serverName = readString(input, "serverName");
      if (!serverName.ok) return serverName;

      return {
        ok: true,
        value: {
          kind: "hello",
          protocolVersion: protocolVersion.value,
          serverName: serverName.value
        }
      };
    }
    case "workspace_changed": {
      const projectId = readString(input, "projectId");
      if (!projectId.ok) return projectId;
      const reason = readEnum(input, "reason", workspaceChangedReasons);
      if (!reason.ok) return reason;

      return {
        ok: true,
        value: {
          kind: "workspace_changed",
          projectId: projectId.value,
          reason: reason.value
        }
      };
    }
    case "device_revoked":
      return { ok: true, value: { kind: "device_revoked" } };
    case "server_stopping":
      return { ok: true, value: { kind: "server_stopping" } };
    default:
      return { error: "unsupported kind", ok: false };
  }
}

function readString(input: unknown, property: string): ParseResult<string> {
  const value = readUnknown(input, property);

  if (typeof value !== "string") {
    return { error: `missing ${property}`, ok: false };
  }

  return { ok: true, value };
}

function readOptionalString(
  input: unknown,
  property: string
): ParseResult<string | undefined> {
  const value = readUnknown(input, property);

  if (value === undefined || value === null) {
    return { ok: true, value: undefined };
  }

  if (typeof value !== "string") {
    return { error: `${property} must be a string`, ok: false };
  }

  return { ok: true, value };
}

function readNumber(input: unknown, property: string): ParseResult<number> {
  const value = readUnknown(input, property);

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { error: `missing ${property}`, ok: false };
  }

  return { ok: true, value };
}

function readEnum<const T extends string>(
  input: unknown,
  property: string,
  values: readonly T[]
): ParseResult<T> {
  const value = readString(input, property);

  if (!value.ok) {
    return value;
  }

  if (!values.includes(value.value as T)) {
    return { error: `unsupported ${property}`, ok: false };
  }

  return { ok: true, value: value.value as T };
}

function readUnknown(input: unknown, property: string): unknown {
  if (
    typeof input !== "object" ||
    input === null ||
    !Object.prototype.hasOwnProperty.call(input, property)
  ) {
    return undefined;
  }

  return (input as Record<string, unknown>)[property];
}
