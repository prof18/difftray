import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type GitRepository = {
  readonly gitDir: string;
  readonly root: string;
};

export type GitWorktreeInfo = {
  readonly commonGitDir: string;
  readonly gitDir: string;
  readonly isLinkedWorktree: boolean;
  readonly root: string;
};

export type GitFileStatus = "added" | "deleted" | "modified" | "renamed" | "untracked";

export type GitPorcelainStatus = {
  readonly indexStatus?: GitStatusCode;
  readonly path: string;
  readonly previousPath?: string;
  readonly status: GitFileStatus;
  readonly workingTreeStatus?: GitStatusCode;
};

export type GitStatusCode = "added" | "deleted" | "modified" | "renamed";

export type GitWorkingTreeReviewTarget = {
  readonly headRefName?: string;
  readonly headSha: string;
  readonly kind: "working_tree";
  readonly projectId: string;
};

export type GitBranchReviewTarget = {
  readonly baseRefName: string;
  readonly baseSha: string;
  readonly headRefName?: string;
  readonly headSha: string;
  readonly kind: "branch";
  readonly mergeBaseSha: string;
  readonly projectId: string;
};

export type GitLoadedFileDiff = {
  readonly content:
    | {
        readonly kind: "text";
        readonly patch: string;
      }
    | {
        readonly byteSize: number;
        readonly digest: string;
        readonly kind: "binary";
      };
  readonly newPath: string;
  readonly oldPath?: string;
  readonly status: "added" | "deleted" | "modified" | "renamed";
};

export type WorkingTreeDiffResult = {
  readonly files: readonly GitLoadedFileDiff[];
  readonly reviewTarget: GitWorkingTreeReviewTarget;
};

export type BranchDiffResult = {
  readonly files: readonly GitLoadedFileDiff[];
  readonly reviewTarget: GitBranchReviewTarget;
};

export async function findGitRepository(
  startPath: string
): Promise<GitRepository | null> {
  try {
    const [root, gitDir] = await gitLines(startPath, [
      "rev-parse",
      "--show-toplevel",
      "--absolute-git-dir"
    ]);

    if (!root || !gitDir) {
      return null;
    }

    return {
      gitDir,
      root
    };
  } catch {
    return null;
  }
}

export async function getWorktreeInfo(startPath: string): Promise<GitWorktreeInfo> {
  const [root, gitDir, commonGitDir] = await gitLines(startPath, [
    "rev-parse",
    "--show-toplevel",
    "--absolute-git-dir",
    "--git-common-dir"
  ]);

  if (!root || !gitDir || !commonGitDir) {
    throw new Error(`Unable to resolve Git worktree information for ${startPath}`);
  }

  const absoluteCommonGitDir = absolutizeGitPath(root, commonGitDir);

  return {
    commonGitDir: absoluteCommonGitDir,
    gitDir,
    isLinkedWorktree: path.normalize(gitDir) !== path.normalize(absoluteCommonGitDir),
    root
  };
}

export async function getGitStatus(
  repoPath: string
): Promise<readonly GitPorcelainStatus[]> {
  const { stdout } = await execFileAsync(
    "git",
    ["-C", repoPath, "status", "--porcelain=v2", "-z", "--untracked-files=all"],
    { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
  );

  return parseStatusPorcelainV2(stdout);
}

export async function listBranchRefs(repoPath: string): Promise<readonly string[]> {
  const output = await gitOutput(repoPath, [
    "for-each-ref",
    "--format=%(refname)",
    "--sort=refname",
    "refs/heads",
    "refs/remotes"
  ]);

  return Array.from(
    new Set(
      output
        .split("\n")
        .map((ref) => ref.trim())
        .map(shortBranchRefFromFullRef)
        .filter((ref): ref is string => ref !== undefined)
    )
  );
}

export async function loadWorkingTreeDiffs(
  repoPath: string
): Promise<WorkingTreeDiffResult> {
  const branchName = await currentBranchName(repoPath);
  const reviewTarget: GitWorkingTreeReviewTarget = {
    ...(branchName ? { headRefName: branchName } : {}),
    headSha: await requiredGitOutput(repoPath, ["rev-parse", "HEAD"]),
    kind: "working_tree",
    projectId: repoPath
  };

  const status = await getGitStatus(repoPath);
  const trackedDiffs = await loadTrackedDiffs(repoPath, ["HEAD"]);
  const trackedPaths = new Set(trackedDiffs.map((diff) => diff.newPath));
  const untrackedDiffs = await Promise.all(
    status
      .filter((entry) => entry.status === "untracked" && !trackedPaths.has(entry.path))
      .map(async (entry) => synthesizeUntrackedDiff(repoPath, entry.path))
  );

  return {
    files: [...trackedDiffs, ...untrackedDiffs],
    reviewTarget
  };
}

export async function loadBranchDiffs(
  repoPath: string,
  baseRefName: string
): Promise<BranchDiffResult> {
  const baseSha = await gitOutputOrNull(repoPath, [
    "rev-parse",
    "--verify",
    `${baseRefName}^{commit}`
  ]);

  if (!baseSha) {
    throw new Error(`Unable to resolve base ref "${baseRefName}"`);
  }

  const headSha = await requiredGitOutput(repoPath, ["rev-parse", "HEAD"]);
  const mergeBaseSha = await requiredGitOutput(repoPath, [
    "merge-base",
    baseRefName,
    "HEAD"
  ]);
  const branchName = await currentBranchName(repoPath);
  const reviewTarget: GitBranchReviewTarget = {
    baseRefName,
    baseSha,
    ...(branchName ? { headRefName: branchName } : {}),
    headSha,
    kind: "branch",
    mergeBaseSha,
    projectId: repoPath
  };

  return {
    files: await loadTrackedDiffs(repoPath, [mergeBaseSha, "HEAD"]),
    reviewTarget
  };
}

export function parseStatusPorcelainV2(output: string): readonly GitPorcelainStatus[] {
  const records = output.split("\0").filter((record) => record.length > 0);
  const statuses: GitPorcelainStatus[] = [];

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];

    if (!record) {
      continue;
    }

    if (record.startsWith("? ")) {
      statuses.push({
        path: record.slice(2),
        status: "untracked"
      });
      continue;
    }

    if (record.startsWith("1 ")) {
      statuses.push(parseOrdinaryRecord(record));
      continue;
    }

    if (record.startsWith("2 ")) {
      const previousPath = records[index + 1];
      if (!previousPath) {
        throw new Error(`Git rename status record is missing previous path: ${record}`);
      }

      statuses.push(parseRenameRecord(record, previousPath));
      index += 1;
    }
  }

  return statuses;
}

function shortBranchRefFromFullRef(ref: string): string | undefined {
  if (ref.startsWith("refs/heads/")) {
    return ref.slice("refs/heads/".length);
  }

  if (ref.startsWith("refs/remotes/") && !ref.endsWith("/HEAD")) {
    return ref.slice("refs/remotes/".length);
  }

  return undefined;
}

function parseOrdinaryRecord(record: string): GitPorcelainStatus {
  const fields = splitStatusFields(record, 8);
  const xy = fields[1] ?? "..";
  const status = statusFromXY(xy);
  const indexStatus = statusCodeFromPorcelainCode(xy[0]);
  const workingTreeStatus = statusCodeFromPorcelainCode(xy[1]);

  return {
    ...(indexStatus ? { indexStatus } : {}),
    path: fields[8] ?? "",
    status,
    ...(workingTreeStatus ? { workingTreeStatus } : {})
  };
}

function parseRenameRecord(record: string, previousPath: string): GitPorcelainStatus {
  const fields = splitStatusFields(record, 9);
  const xy = fields[1] ?? "..";
  const indexStatus = statusCodeFromPorcelainCode(xy[0]);
  const workingTreeStatus = statusCodeFromPorcelainCode(xy[1]);

  return {
    ...(indexStatus ? { indexStatus } : {}),
    path: fields[9] ?? "",
    previousPath,
    status: "renamed" as const,
    ...(workingTreeStatus ? { workingTreeStatus } : {})
  };
}

function splitStatusFields(record: string, spaceCount: number): readonly string[] {
  const fields: string[] = [];
  let start = 0;

  for (let spacesSeen = 0; spacesSeen < spaceCount; spacesSeen += 1) {
    const nextSpace = record.indexOf(" ", start);
    if (nextSpace === -1) {
      throw new Error(`Malformed Git porcelain-v2 status record: ${record}`);
    }

    fields.push(record.slice(start, nextSpace));
    start = nextSpace + 1;
  }

  fields.push(record.slice(start));
  return fields;
}

function statusFromXY(xy: string): GitFileStatus {
  if (xy.includes("A")) {
    return "added";
  }

  if (xy.includes("D")) {
    return "deleted";
  }

  if (xy.includes("R")) {
    return "renamed";
  }

  return "modified";
}

function statusCodeFromPorcelainCode(
  code: string | undefined
): GitStatusCode | undefined {
  switch (code) {
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "M":
      return "modified";
    case "R":
      return "renamed";
    default:
      return undefined;
  }
}

type NameStatusDiff = {
  readonly newPath: string;
  readonly oldPath?: string;
  readonly status: GitLoadedFileDiff["status"];
};

async function loadTrackedDiffs(
  repoPath: string,
  diffArgs: readonly string[]
): Promise<readonly GitLoadedFileDiff[]> {
  const [nameStatuses, patchOutput] = await Promise.all([
    loadNameStatus(repoPath, diffArgs),
    gitOutput(repoPath, [
      "diff",
      "--patch",
      "--find-renames",
      "--no-ext-diff",
      ...diffArgs
    ])
  ]);
  const patches = splitPatchOutput(patchOutput);

  return nameStatuses.map((nameStatus, index) => ({
    content: {
      kind: "text",
      patch: patches[index] ?? ""
    },
    newPath: nameStatus.newPath,
    ...(nameStatus.oldPath ? { oldPath: nameStatus.oldPath } : {}),
    status: nameStatus.status
  }));
}

async function loadNameStatus(
  repoPath: string,
  diffArgs: readonly string[]
): Promise<readonly NameStatusDiff[]> {
  const output = await gitOutput(repoPath, [
    "diff",
    "--name-status",
    "--find-renames",
    "-z",
    ...diffArgs
  ]);
  const records = output.split("\0").filter((record) => record.length > 0);
  const diffs: NameStatusDiff[] = [];

  for (let index = 0; index < records.length; index += 1) {
    const code = records[index];
    const pathRecord = records[index + 1];

    if (!code || !pathRecord) {
      continue;
    }

    if (code.startsWith("R")) {
      const newPath = records[index + 2];
      if (!newPath) {
        throw new Error("Git rename diff is missing the new path.");
      }

      diffs.push({
        newPath,
        oldPath: pathRecord,
        status: "renamed"
      });
      index += 2;
      continue;
    }

    diffs.push({
      newPath: pathRecord,
      status: statusFromNameStatusCode(code)
    });
    index += 1;
  }

  return diffs;
}

function splitPatchOutput(output: string): readonly string[] {
  if (output.length === 0) {
    return [];
  }

  return output
    .split("\ndiff --git ")
    .map((section, index) => (index === 0 ? section : `diff --git ${section}`))
    .map((section) => section.trimEnd());
}

async function synthesizeUntrackedDiff(
  repoPath: string,
  relativePath: string
): Promise<GitLoadedFileDiff> {
  const filePath = path.join(repoPath, relativePath);
  const bytes = await readFile(filePath);

  if (isBinary(bytes)) {
    return {
      content: {
        byteSize: bytes.byteLength,
        digest: createHash("sha256").update(bytes).digest("hex"),
        kind: "binary"
      },
      newPath: relativePath,
      status: "added"
    };
  }

  const text = bytes.toString("utf8");

  return {
    content: {
      kind: "text",
      patch: synthesizeAddedPatch(relativePath, text)
    },
    newPath: relativePath,
    status: "added"
  };
}

function synthesizeAddedPatch(relativePath: string, text: string): string {
  const lines = text.length === 0 ? [] : text.replaceAll("\r\n", "\n").split("\n");
  const normalizedLines = lines.at(-1) === "" ? lines.slice(0, -1) : lines;

  return [
    `diff --git a/${relativePath} b/${relativePath}`,
    "new file mode 100644",
    "index 0000000..0000000",
    "--- /dev/null",
    `+++ b/${relativePath}`,
    `@@ -0,0 +1,${String(normalizedLines.length)} @@`,
    ...normalizedLines.map((line) => `+${line}`)
  ].join("\n");
}

function isBinary(bytes: Buffer): boolean {
  return bytes.includes(0);
}

function statusFromNameStatusCode(code: string): GitLoadedFileDiff["status"] {
  switch (code[0]) {
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "M":
      return "modified";
    default:
      return "modified";
  }
}

async function currentBranchName(repoPath: string): Promise<string | undefined> {
  const branchName = await gitOutputOrNull(repoPath, [
    "rev-parse",
    "--abbrev-ref",
    "HEAD"
  ]);

  if (!branchName || branchName === "HEAD") {
    return undefined;
  }

  return branchName;
}

async function requiredGitOutput(cwd: string, args: readonly string[]): Promise<string> {
  return gitOutput(cwd, args);
}

async function gitOutputOrNull(
  cwd: string,
  args: readonly string[]
): Promise<string | null> {
  try {
    return await gitOutput(cwd, args);
  } catch {
    return null;
  }
}

async function gitLines(
  cwd: string,
  args: readonly string[]
): Promise<readonly string[]> {
  const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], {
    encoding: "utf8"
  });

  return stdout
    .trimEnd()
    .split("\n")
    .map((line) => line.trim());
}

async function gitOutput(cwd: string, args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024
  });

  return stdout.trimEnd();
}

function absolutizeGitPath(root: string, gitPath: string): string {
  if (path.isAbsolute(gitPath)) {
    return path.normalize(gitPath);
  }

  return path.resolve(root, gitPath);
}
