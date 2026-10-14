import { createHash, randomUUID } from "node:crypto";
import { constants, type Stats } from "node:fs";
import { link, lstat, mkdir, open, realpath, unlink } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import {
  AgentProtocolError,
  CLI_PROTOCOL_VERSION,
  ENDPOINT_FILENAME,
  SOCKET_FILENAME,
  PRIVATE_DIRECTORY_MODE,
  PRIVATE_FILE_MODE,
  parseAgentResponse,
  type AgentResultMap
} from "./agent-protocol.js";

export type AgentEndpoint = AgentResultMap["hello"] & {
  readonly token: string;
  readonly socketPath: string;
};
export function agentSocketPaths(canonicalProfilePath: string, uid = process.getuid?.()) {
  if (uid === undefined)
    throw new AgentProtocolError(
      "app_unavailable",
      "Local agent sockets require a Unix user identity."
    );
  const digest = createHash("sha256")
    .update(canonicalProfilePath)
    .digest("hex")
    .slice(0, 24);
  const directory = `/tmp/difftray-${String(uid)}-${digest}`;
  return {
    directory,
    socketPath: path.join(directory, SOCKET_FILENAME),
    endpointPath: path.join(directory, ENDPOINT_FILENAME)
  };
}
function missing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}
function unsafe(): never {
  throw new AgentProtocolError(
    "unauthorized",
    "Unsafe local agent endpoint ownership, type or permissions."
  );
}
/**
 * Owned private endpoint metadata that this build cannot use: another protocol
 * version or unreadable content, typically left by an unclean exit before an
 * upgrade. It is stale once nothing listens on the profile socket.
 */
export class UnusableAgentEndpointError extends AgentProtocolError {}
function unusable(error?: unknown): never {
  if (error instanceof AgentProtocolError)
    throw new UnusableAgentEndpointError(error.code, error.message);
  throw new UnusableAgentEndpointError(
    "unauthorized",
    "Unreadable local agent endpoint metadata."
  );
}
export function assertPrivateAgentPath(
  value: Stats,
  kind: "directory" | "file" | "socket",
  uid = process.getuid?.()
): void {
  const expectedMode = kind === "directory" ? PRIVATE_DIRECTORY_MODE : PRIVATE_FILE_MODE;
  if (
    uid === undefined ||
    value.uid !== uid ||
    value.isSymbolicLink() ||
    (value.mode & 0o7777) !== expectedMode ||
    !(kind === "directory"
      ? value.isDirectory()
      : kind === "socket"
        ? value.isSocket()
        : value.isFile())
  )
    unsafe();
}
function sameFile(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}
async function canonicalProfile(profilePath: string): Promise<string> {
  const canonical = await realpath(profilePath);
  if (canonical !== profilePath)
    throw new AgentProtocolError(
      "profile_mismatch",
      "Agent profile path must be canonical."
    );
  return canonical;
}
export async function ensureAgentDirectory(profilePath: string) {
  const paths = agentSocketPaths(await canonicalProfile(profilePath));
  try {
    await mkdir(paths.directory, { mode: PRIVATE_DIRECTORY_MODE });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  assertPrivateAgentPath(await lstat(paths.directory), "directory");
  return paths;
}
export async function validateAgentSocket(
  endpoint: Pick<AgentEndpoint, "profilePath" | "socketPath">
): Promise<Stats> {
  const paths = agentSocketPaths(await canonicalProfile(endpoint.profilePath));
  if (endpoint.socketPath !== paths.socketPath)
    throw new AgentProtocolError(
      "profile_mismatch",
      "Socket does not belong to the selected profile."
    );
  assertPrivateAgentPath(await lstat(paths.directory), "directory");
  const socket = await lstat(paths.socketPath);
  assertPrivateAgentPath(socket, "socket");
  return socket;
}
function parseEndpoint(text: string, profilePath: string): AgentEndpoint {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    return unsafe();
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return unsafe();
  const record = value as Record<string, unknown>;
  const { token, socketPath, ...hello } = record;
  if (
    typeof token !== "string" ||
    !/^[a-fA-F0-9]{64}$/.test(token) ||
    typeof socketPath !== "string" ||
    !Number.isSafeInteger(hello.protocolVersion) ||
    (hello.protocolVersion as number) < 1
  )
    return unsafe();
  try {
    parseAgentResponse(
      `${JSON.stringify({ version: 1, id: "metadata", ok: true, result: { ...hello, protocolVersion: CLI_PROTOCOL_VERSION } })}\n`,
      "hello"
    );
  } catch {
    return unsafe();
  }
  const endpoint = record as AgentEndpoint;
  if (
    endpoint.profilePath !== profilePath ||
    endpoint.socketPath !== agentSocketPaths(profilePath).socketPath
  )
    throw new AgentProtocolError(
      "profile_mismatch",
      "Endpoint metadata belongs to another profile."
    );
  if (hello.protocolVersion !== CLI_PROTOCOL_VERSION)
    throw new AgentProtocolError(
      "unsupported_version",
      "Desktop protocol is incompatible; quit and restart the correct desktop bundle."
    );
  return endpoint;
}
async function readRecord(
  profilePath: string
): Promise<{ endpoint: AgentEndpoint; identity: Stats } | null> {
  const paths = agentSocketPaths(await canonicalProfile(profilePath));
  try {
    assertPrivateAgentPath(await lstat(paths.directory), "directory");
  } catch (error) {
    if (missing(error)) return null;
    throw error;
  }
  let identity: Stats;
  try {
    identity = await lstat(paths.endpointPath);
  } catch (error) {
    if (missing(error)) return null;
    throw error;
  }
  assertPrivateAgentPath(identity, "file");
  if (identity.size > 16_384) return unusable();
  const file = await open(paths.endpointPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await file.stat();
    assertPrivateAgentPath(opened, "file");
    if (!sameFile(identity, opened) || opened.size > 16_384) return unsafe();
    // Fixed buffer also bounds a same-user writer growing the file after fstat.
    const buffer = Buffer.alloc(16_385);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead > 16_384) return unusable();
    const current = await lstat(paths.endpointPath);
    assertPrivateAgentPath(current, "file");
    if (
      !sameFile(opened, current) ||
      current.size !== bytesRead ||
      current.mtimeMs !== opened.mtimeMs
    )
      return unsafe();
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(
        buffer.subarray(0, bytesRead)
      );
    } catch {
      return unusable();
    }
    try {
      return { endpoint: parseEndpoint(text, profilePath), identity: current };
    } catch (error) {
      return unusable(error);
    }
  } finally {
    await file.close();
  }
}
export async function readAgentEndpoint(
  profilePath: string,
  options: { readonly requireSocket?: boolean } = {}
): Promise<AgentEndpoint | null> {
  const record = await readRecord(profilePath);
  if (!record) return null;
  if (options.requireSocket !== false) await validateAgentSocket(record.endpoint);
  return record.endpoint;
}
export async function isAgentSocketListening(socketPath: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    const timer = setTimeout(() => {
      socket.destroy();
      reject(
        new AgentProtocolError(
          "busy",
          "Existing agent socket did not answer the startup probe."
        )
      );
    }, 500);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });
    socket.once("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      socket.destroy();
      if (error.code === "ECONNREFUSED" || error.code === "ENOENT") resolve(false);
      else reject(error);
    });
  });
}
/**
 * Startup read for the CLI: unusable metadata with no listener is treated as
 * absent, so the launched desktop can retire it instead of every call failing.
 */
export async function readAgentEndpointForStartup(
  profilePath: string
): Promise<AgentEndpoint | null> {
  try {
    return await readAgentEndpoint(profilePath, { requireSocket: false });
  } catch (error) {
    if (!(error instanceof UnusableAgentEndpointError)) throw error;
    if (await isAgentSocketListening(agentSocketPaths(profilePath).socketPath))
      throw error;
    return null;
  }
}
/** Caller must hold the profile lock and have confirmed nothing listens. */
export async function removeUnusableAgentEndpoint(profilePath: string): Promise<void> {
  const paths = agentSocketPaths(await canonicalProfile(profilePath));
  assertPrivateAgentPath(await lstat(paths.directory), "directory");
  let current: Stats;
  try {
    current = await lstat(paths.endpointPath);
  } catch (error) {
    if (missing(error)) return;
    throw error;
  }
  assertPrivateAgentPath(current, "file");
  await unlink(paths.endpointPath);
}
export async function publishAgentEndpoint(endpoint: AgentEndpoint): Promise<void> {
  parseEndpoint(JSON.stringify(endpoint), endpoint.profilePath);
  const paths = await ensureAgentDirectory(endpoint.profilePath);
  const parent = await lstat(paths.directory);
  await validateAgentSocket(endpoint);
  const temporary = path.join(paths.directory, `.endpoint-${randomUUID()}.tmp`);
  const file = await open(temporary, "wx", PRIVATE_FILE_MODE);
  let created = true;
  try {
    await file.chmod(PRIVATE_FILE_MODE);
    await file.writeFile(JSON.stringify(endpoint), "utf8");
    await file.sync();
    const currentParent = await lstat(paths.directory);
    assertPrivateAgentPath(currentParent, "directory");
    if (!sameFile(parent, currentParent)) return unsafe();
    await validateAgentSocket(endpoint);
    // link publishes atomically and refuses to overwrite another generation.
    await link(temporary, paths.endpointPath);
    await unlink(temporary);
    created = false;
  } finally {
    await file.close();
    if (created)
      await unlink(temporary).catch((error: unknown) => {
        if (!missing(error)) throw error;
      });
  }
}
export async function removeAgentEndpoint(endpoint: AgentEndpoint): Promise<boolean> {
  const record = await readRecord(endpoint.profilePath);
  if (
    record?.endpoint.instanceId !== endpoint.instanceId ||
    record.endpoint.token !== endpoint.token ||
    record.endpoint.socketPath !== endpoint.socketPath
  )
    return false;
  const paths = agentSocketPaths(endpoint.profilePath);
  const current = await lstat(paths.endpointPath);
  assertPrivateAgentPath(current, "file");
  if (!sameFile(record.identity, current)) return false;
  await unlink(paths.endpointPath);
  return true;
}
