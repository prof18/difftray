import { createHash, randomBytes } from "node:crypto";
import { chmod, link, lstat, mkdir, open, readdir, unlink } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";

import {
  formatLearnReport,
  summarizeLearnReport,
  type LearnExcerptSource,
  type LearnReportInput,
  type LearnStatus
} from "@difftray/core";

import { assertPrivateAgentPath } from "../shared/agent-endpoint.js";
import {
  AgentProtocolError,
  PRIVATE_DIRECTORY_MODE,
  PRIVATE_FILE_MODE
} from "../shared/agent-protocol.js";
import type { LearnHistoryResult, LearnHistoryService } from "./learn-history-service.js";

export const REPORT_DIR_NAME = "learn-reports";
export const REPORT_DIR_MODE = PRIVATE_DIRECTORY_MODE;
export const REPORT_FILE_MODE = PRIVATE_FILE_MODE;
export const REPORT_TTL_MS = 86_400_000;

// <sha256(commonGitDir) prefix>-<createdAt with : as ->-<random>.md|json, or a
// leftover temporary file of an interrupted write.
const reportFilePattern =
  /^(?:[0-9a-f]{16}-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z-[0-9a-f]{8}\.(?:md|json)|\.tmp-[0-9a-f]{16})$/u;

export type LearnReportFormat = "markdown" | "json";

export type LearnReportWriteInput = {
  readonly repoPath: string;
  readonly format: LearnReportFormat;
  readonly since?: string;
  readonly all?: boolean;
  /** An absolute path that must not exist yet. Difftray never cleans it up. */
  readonly out?: string;
  readonly signal?: AbortSignal;
};

export type LearnReportResult = {
  readonly path: string;
  readonly format: LearnReportFormat;
  readonly createdAt: string;
  readonly cursor: string | null;
  readonly lastLearnedAt: string | null;
  readonly newCount: number;
  readonly earlierCount: number;
  readonly authors: { readonly human: number; readonly agent: number };
  readonly statuses: Readonly<Record<LearnStatus, number>>;
  readonly excerpts: Readonly<Record<LearnExcerptSource, number>>;
};

export type LearnReportServiceDependencies = {
  readonly history: Pick<LearnHistoryService, "collect">;
  /** The profile folder; reports go to its REPORT_DIR_NAME subfolder. */
  readonly userDataPath: string;
  readonly now?: () => number;
  /** Writes the content to the open temporary file; replaced in tests. */
  readonly writeContent?: (handle: FileHandle, content: string) => Promise<void>;
};

export type LearnReportService = {
  readonly write: (input: LearnReportWriteInput) => Promise<LearnReportResult>;
};

export function learnReportDirectory(userDataPath: string): string {
  return path.join(userDataPath, REPORT_DIR_NAME);
}

export function createLearnReportService(
  dependencies: LearnReportServiceDependencies
): LearnReportService {
  const now = dependencies.now ?? Date.now;
  const writeContent =
    dependencies.writeContent ??
    ((handle: FileHandle, content: string) => handle.writeFile(content, "utf8"));
  const directory = learnReportDirectory(dependencies.userDataPath);

  async function write(input: LearnReportWriteInput): Promise<LearnReportResult> {
    if (input.out !== undefined) {
      await assertOutAvailable(input.out);
      await purgeExpiredLearnReports({ now, userDataPath: dependencies.userDataPath });
    } else {
      await ensureReportDirectory(directory);
      await purgeDirectory(directory, now());
    }

    const history = await dependencies.history.collect({
      repoPath: input.repoPath,
      ...(input.since !== undefined ? { since: input.since } : {}),
      ...(input.all !== undefined ? { all: input.all } : {}),
      ...(input.signal !== undefined ? { signal: input.signal } : {})
    });
    assertActive(input.signal);

    const report = reportInput(history);
    const summary = summarizeLearnReport(report);
    const content =
      input.format === "json"
        ? `${JSON.stringify(
            {
              version: 1,
              repository: {
                commonGitDir: report.repository,
                name: report.repositoryName
              },
              createdAt: report.createdAt,
              cursor: report.cursor,
              lastLearnedAt: report.lastLearnedAt,
              summary,
              newItems: report.newItems,
              earlierItems: report.earlierItems
            },
            null,
            2
          )}\n`
        : formatLearnReport(report);
    const finalPath =
      input.out ?? path.join(directory, reportFileName(history, input.format));
    // Collecting can take a while; check the folder again right before writing.
    if (input.out === undefined)
      assertPrivateAgentPath(await lstat(directory), "directory");

    await publish(
      finalPath,
      content,
      writeContent,
      input.signal,
      input.out !== undefined
    );

    return {
      authors: summary.authors,
      createdAt: report.createdAt,
      cursor: report.cursor,
      earlierCount: summary.earlierCount,
      excerpts: summary.excerpts,
      format: input.format,
      lastLearnedAt: report.lastLearnedAt,
      newCount: summary.newCount,
      path: finalPath,
      statuses: summary.statuses
    };
  }

  return { write };
}

/** Deletes expired report files; run once at app startup. */
export async function purgeExpiredLearnReports(input: {
  readonly userDataPath: string;
  readonly now?: () => number;
}): Promise<void> {
  const directory = learnReportDirectory(input.userDataPath);
  let stats;
  try {
    stats = await lstat(directory);
  } catch (error) {
    if (isMissing(error)) return;
    throw error;
  }
  assertPrivateAgentPath(stats, "directory");
  await purgeDirectory(directory, (input.now ?? Date.now)());
}

function reportInput(history: LearnHistoryResult): LearnReportInput {
  return {
    createdAt: history.reportStartedAt,
    cursor: history.cursor,
    earlierItems: history.earlierItems,
    lastLearnedAt: history.lastLearnedAt,
    newItems: history.newItems,
    repository: history.commonGitDir,
    repositoryName: repositoryName(history)
  };
}

function repositoryName(history: LearnHistoryResult): string {
  const base = path.basename(history.commonGitDir);
  if (base === ".git") return path.basename(path.dirname(history.commonGitDir));
  if (base.endsWith(".git") && base.length > 4) return base.slice(0, -4);
  return path.basename(history.worktreeRoot);
}

function reportFileName(history: LearnHistoryResult, format: LearnReportFormat): string {
  const repository = createHash("sha256")
    .update(history.commonGitDir)
    .digest("hex")
    .slice(0, 16);
  const created = history.reportStartedAt.replaceAll(":", "-");
  const extension = format === "json" ? "json" : "md";

  return `${repository}-${created}-${randomBytes(4).toString("hex")}.${extension}`;
}

async function ensureReportDirectory(directory: string): Promise<void> {
  try {
    await mkdir(directory, { mode: REPORT_DIR_MODE });
    // The umask can remove bits from the requested mode; set it exactly.
    await chmod(directory, REPORT_DIR_MODE);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  assertPrivateAgentPath(await lstat(directory), "directory");
}

async function purgeDirectory(directory: string, nowMs: number): Promise<void> {
  for (const name of await readdir(directory)) {
    if (!reportFilePattern.test(name)) continue;
    const file = path.join(directory, name);
    try {
      const stats = await lstat(file);
      if (!stats.isFile() || nowMs - stats.mtimeMs <= REPORT_TTL_MS) continue;
      await unlink(file);
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }
}

async function assertOutAvailable(out: string): Promise<void> {
  if (!path.isAbsolute(out))
    throw new AgentProtocolError("invalid_request", "The out path must be absolute.");
  try {
    await lstat(out);
  } catch (error) {
    if (isMissing(error)) return;
    throw error;
  }
  throw outExists();
}

async function publish(
  finalPath: string,
  content: string,
  writeContent: (handle: FileHandle, content: string) => Promise<void>,
  signal: AbortSignal | undefined,
  isOut: boolean
): Promise<void> {
  const temporary = path.join(
    path.dirname(finalPath),
    `.tmp-${randomBytes(8).toString("hex")}`
  );
  let handle: FileHandle;
  try {
    handle = await open(temporary, "wx", REPORT_FILE_MODE);
  } catch (error) {
    if (isOut && isMissing(error))
      throw new AgentProtocolError("invalid_request", "The out folder does not exist.");
    throw error;
  }
  try {
    try {
      await handle.chmod(REPORT_FILE_MODE);
      await writeContent(handle, content);
      await handle.sync();
    } finally {
      await handle.close();
    }
    assertActive(signal);
    try {
      // link publishes the complete file at once and never replaces an existing one.
      await link(temporary, finalPath);
    } catch (error) {
      if (isOut && (error as NodeJS.ErrnoException).code === "EEXIST") throw outExists();
      throw error;
    }
    if (signal?.aborted) {
      await unlink(finalPath).catch(ignoreMissing);
      assertActive(signal);
    }
  } finally {
    await unlink(temporary).catch(ignoreMissing);
  }
}

function assertActive(signal: AbortSignal | undefined): void {
  if (signal?.aborted)
    throw new AgentProtocolError("request_timeout", "Learn report was cancelled.");
}

function outExists(): AgentProtocolError {
  return new AgentProtocolError("invalid_request", "The out path already exists.");
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

function ignoreMissing(error: unknown): void {
  if (!isMissing(error)) throw error;
}
