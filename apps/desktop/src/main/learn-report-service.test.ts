import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  utimes,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { AgentProtocolError } from "../shared/agent-protocol.js";
import type {
  LearnHistoryCollectInput,
  LearnHistoryItem,
  LearnHistoryResult
} from "./learn-history-service.js";
import {
  REPORT_DIR_NAME,
  REPORT_TTL_MS,
  createLearnReportService,
  purgeExpiredLearnReports,
  type LearnReportServiceDependencies
} from "./learn-report-service.js";

const commonGitDir = "/Users/me/src/difftray/.git";
const createdAt = "2026-11-20T10:00:00.000Z";
const nowMs = Date.parse("2026-11-20T10:00:05.000Z");
const reportName = new RegExp(
  `^${createHash("sha256").update(commonGitDir).digest("hex").slice(0, 16)}-2026-11-20T10-00-00\\.000Z-[0-9a-f]{8}\\.(md|json)$`,
  "u"
);
const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { force: true, recursive: true }))
  );
});

async function tempRoot(): Promise<string> {
  const root = await realpath(
    await mkdtemp(path.join(tmpdir(), "difftray-learn-report-"))
  );
  tempRoots.push(root);
  return root;
}

function item(overrides: Partial<LearnHistoryItem> = {}): LearnHistoryItem {
  return {
    author: { kind: "human" },
    body: "Validate --since before sending.",
    createdAt: "2026-10-12T09:00:00.000Z",
    dismissed: false,
    excerpt: {
      kind: "lines",
      lines: [{ kind: "commented", lineNumber: 41, text: "return value;" }],
      side: "additions",
      truncated: false,
      version: 1
    },
    excerptCommit: null,
    excerptSource: "saved",
    id: "c_1",
    kind: "line",
    lineEnd: 41,
    lineStart: 41,
    path: "src/cli/commands.ts",
    previousPath: null,
    side: "additions",
    status: "active",
    targetLabel: "main...cli-flags",
    updatedAt: "2026-11-19T17:42:10.120Z",
    worktreePath: "/Users/me/src/difftray",
    ...overrides
  };
}

const historyResult: LearnHistoryResult = {
  commonGitDir,
  cursor: "2026-11-19T17:42:10.120Z",
  earlierItems: [
    {
      author: { kind: "agent", name: "codex", runId: "run" },
      bodyFirstLine: "Possible race",
      createdAt: "2026-06-02T10:00:00.000Z",
      dismissed: true,
      id: "c_old",
      kind: "line",
      path: "src/main/index.ts",
      status: "dismissed",
      updatedAt: "2026-06-02T10:00:00.000Z"
    }
  ],
  lastLearnedAt: "2026-10-01T08:00:00.000Z",
  newItems: [
    item(),
    item({
      author: { kind: "agent", name: "claude", runId: "run" },
      excerpt: null,
      excerptSource: "not_looked_up",
      id: "c_2",
      status: "diff_changed"
    })
  ],
  reportStartedAt: createdAt,
  worktreeRoot: "/Users/me/src/difftray"
};

function service(
  userDataPath: string,
  overrides: Partial<LearnReportServiceDependencies> = {}
) {
  const calls: LearnHistoryCollectInput[] = [];
  const reports = createLearnReportService({
    history: {
      collect: (collectInput) => {
        calls.push(collectInput);
        return Promise.resolve(historyResult);
      }
    },
    now: () => nowMs,
    userDataPath,
    ...overrides
  });
  return { calls, reports };
}

async function writeAged(file: string, ageMs: number): Promise<void> {
  await writeFile(file, "old", { mode: 0o600 });
  const seconds = (nowMs - ageMs) / 1000;
  await utimes(file, seconds, seconds);
}

describe("LearnReportService.write", () => {
  it("writes a private Markdown file in the reports folder and returns the counts", async () => {
    const userData = await tempRoot();
    const { calls, reports } = service(userData);
    const signal = new AbortController().signal;

    const result = await reports.write({
      all: true,
      format: "markdown",
      repoPath: "/Users/me/src/difftray",
      signal
    });

    const folder = path.join(userData, REPORT_DIR_NAME);
    expect(((await lstat(folder)).mode & 0o7777).toString(8)).toBe("700");
    expect(path.dirname(result.path)).toBe(folder);
    expect(path.basename(result.path)).toMatch(reportName);
    expect(result.path.endsWith(".md")).toBe(true);
    expect(((await lstat(result.path)).mode & 0o7777).toString(8)).toBe("600");
    expect(calls).toEqual([{ all: true, repoPath: "/Users/me/src/difftray", signal }]);
    expect(await readFile(result.path, "utf8")).toContain(
      "# Difftray review feedback: `difftray`"
    );
    expect(result).toEqual({
      authors: { agent: 1, human: 1 },
      createdAt,
      cursor: "2026-11-19T17:42:10.120Z",
      earlierCount: 1,
      excerpts: {
        approximate: 0,
        not_looked_up: 1,
        recovered: 0,
        saved: 1,
        unavailable: 0
      },
      format: "markdown",
      lastLearnedAt: "2026-10-01T08:00:00.000Z",
      newCount: 2,
      path: result.path,
      statuses: { active: 1, diff_changed: 1, dismissed: 0, target_changed: 0 }
    });
    expect(await readdir(folder)).toEqual([path.basename(result.path)]);
  });

  it("passes since to the collector", async () => {
    const { calls, reports } = service(await tempRoot());

    await reports.write({
      format: "markdown",
      repoPath: "/repo",
      since: "2026-11-01T00:00:00.000Z"
    });

    expect(calls[0]).toMatchObject({ since: "2026-11-01T00:00:00.000Z" });
  });

  it("writes JSON with version 1 and the report fields", async () => {
    const { reports } = service(await tempRoot());

    const result = await reports.write({ format: "json", repoPath: "/repo" });
    const parsed = JSON.parse(await readFile(result.path, "utf8")) as Record<
      string,
      unknown
    >;

    expect(path.basename(result.path)).toMatch(reportName);
    expect(result.path.endsWith(".json")).toBe(true);
    expect(parsed).toMatchObject({
      createdAt,
      cursor: historyResult.cursor,
      earlierItems: historyResult.earlierItems,
      lastLearnedAt: historyResult.lastLearnedAt,
      newItems: historyResult.newItems,
      repository: { commonGitDir, name: "difftray" },
      summary: { earlierCount: 1, newCount: 2 },
      version: 1
    });
    expect(Object.keys(parsed).sort()).toEqual(
      [
        "createdAt",
        "cursor",
        "earlierItems",
        "lastLearnedAt",
        "newItems",
        "repository",
        "summary",
        "version"
      ].sort()
    );
  });

  it("writes two files for two reports in the same millisecond", async () => {
    const { reports } = service(await tempRoot());

    const first = await reports.write({ format: "markdown", repoPath: "/repo" });
    const second = await reports.write({ format: "markdown", repoPath: "/repo" });

    expect(first.path).not.toBe(second.path);
    expect(path.basename(second.path)).toMatch(reportName);
  });

  it("deletes expired report and temporary files and keeps newer or unrelated ones", async () => {
    const userData = await tempRoot();
    const folder = path.join(userData, REPORT_DIR_NAME);
    await mkdir(folder, { mode: 0o700 });
    const expired = "0123456789abcdef-2026-11-18T09-00-00.000Z-0a1b2c3d.md";
    const expiredJson = "0123456789abcdef-2026-11-18T09-00-00.000Z-0a1b2c3e.json";
    const expiredTemp = ".tmp-0a1b2c3d4e5f6a7b";
    const fresh = "0123456789abcdef-2026-11-20T09-00-00.000Z-0a1b2c3d.md";
    const unrelated = "notes.md";
    await writeAged(path.join(folder, expired), REPORT_TTL_MS + 1000);
    await writeAged(path.join(folder, expiredJson), REPORT_TTL_MS + 1000);
    await writeAged(path.join(folder, expiredTemp), REPORT_TTL_MS + 1000);
    await writeAged(path.join(folder, fresh), REPORT_TTL_MS - 60_000);
    await writeAged(path.join(folder, unrelated), REPORT_TTL_MS * 3);
    await mkdir(
      path.join(folder, "0123456789abcdef-2026-11-18T09-00-00.000Z-0a1b2c3f.md")
    );

    const { reports } = service(userData);
    const result = await reports.write({ format: "markdown", repoPath: "/repo" });

    expect((await readdir(folder)).sort()).toEqual(
      [
        "0123456789abcdef-2026-11-18T09-00-00.000Z-0a1b2c3f.md",
        fresh,
        path.basename(result.path),
        unrelated
      ].sort()
    );
  });

  it("purges expired files at startup without writing a report", async () => {
    const userData = await tempRoot();
    const folder = path.join(userData, REPORT_DIR_NAME);
    await mkdir(folder, { mode: 0o700 });
    const expired = "0123456789abcdef-2026-11-18T09-00-00.000Z-0a1b2c3d.md";
    await writeAged(path.join(folder, expired), REPORT_TTL_MS + 1000);

    await purgeExpiredLearnReports({ now: () => nowMs, userDataPath: userData });

    expect(await readdir(folder)).toEqual([]);
    await expect(
      purgeExpiredLearnReports({ userDataPath: await tempRoot() })
    ).resolves.toBeUndefined();
  });

  it("rejects a reports folder with loose permissions", async () => {
    const userData = await tempRoot();
    await mkdir(path.join(userData, REPORT_DIR_NAME), { mode: 0o755 });
    const { reports } = service(userData);

    await expect(
      reports.write({ format: "markdown", repoPath: "/repo" })
    ).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("leaves neither a final nor a temporary file when the write fails", async () => {
    const userData = await tempRoot();
    const { reports } = service(userData, {
      writeContent: () => Promise.reject(new Error("disk full"))
    });

    await expect(
      reports.write({ format: "markdown", repoPath: "/repo" })
    ).rejects.toThrow("disk full");
    expect(await readdir(path.join(userData, REPORT_DIR_NAME))).toEqual([]);
  });

  it("fails with request_timeout and leaves no file when the request is cancelled", async () => {
    const userData = await tempRoot();
    const controller = new AbortController();
    const { reports } = service(userData, {
      writeContent: async (handle, content) => {
        await handle.writeFile(content, "utf8");
        controller.abort();
      }
    });

    await expect(
      reports.write({ format: "markdown", repoPath: "/repo", signal: controller.signal })
    ).rejects.toMatchObject({ code: "request_timeout" });
    expect(await readdir(path.join(userData, REPORT_DIR_NAME))).toEqual([]);
  });

  it("writes an absolute out path with mode 0600 and never cleans it up", async () => {
    const root = await tempRoot();
    const out = path.join(root, "report.md");
    const { reports } = service(await tempRoot());

    const result = await reports.write({ format: "markdown", out, repoPath: "/repo" });

    expect(result.path).toBe(out);
    expect(((await lstat(out)).mode & 0o7777).toString(8)).toBe("600");
    expect(await readdir(root)).toEqual(["report.md"]);

    await utimes(
      out,
      (nowMs - REPORT_TTL_MS * 2) / 1000,
      (nowMs - REPORT_TTL_MS * 2) / 1000
    );
    await reports.write({ format: "markdown", repoPath: "/repo" });
    expect(await readdir(root)).toEqual(["report.md"]);
  });

  it("purges expired reports before writing to an out path", async () => {
    const userData = await tempRoot();
    const folder = path.join(userData, REPORT_DIR_NAME);
    await mkdir(folder, { mode: 0o700 });
    const expired = "0123456789abcdef-2026-11-18T09-00-00.000Z-0a1b2c3d.md";
    await writeAged(path.join(folder, expired), REPORT_TTL_MS + 1000);
    const { reports } = service(userData);

    await reports.write({
      format: "markdown",
      out: path.join(await tempRoot(), "report.md"),
      repoPath: "/repo"
    });

    expect(await readdir(folder)).toEqual([]);
  });

  it("rejects an out path whose folder does not exist", async () => {
    const out = path.join(await tempRoot(), "missing", "report.md");
    const { reports } = service(await tempRoot());

    await expect(
      reports.write({ format: "markdown", out, repoPath: "/repo" })
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("rejects a relative or an existing out path", async () => {
    const root = await tempRoot();
    const existing = path.join(root, "existing.md");
    await writeFile(existing, "keep");
    const { calls, reports } = service(await tempRoot());

    for (const out of ["report.md", existing]) {
      const failure = reports.write({ format: "markdown", out, repoPath: "/repo" });
      await expect(failure).rejects.toBeInstanceOf(AgentProtocolError);
      await expect(failure).rejects.toMatchObject({ code: "invalid_request" });
    }
    expect(await readFile(existing, "utf8")).toBe("keep");
    expect(await readdir(root)).toEqual(["existing.md"]);
    expect(calls).toEqual([]);
  });
});
