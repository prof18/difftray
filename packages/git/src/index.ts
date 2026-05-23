import { execFile } from "node:child_process";
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

function absolutizeGitPath(root: string, gitPath: string): string {
  if (path.isAbsolute(gitPath)) {
    return path.normalize(gitPath);
  }

  return path.resolve(root, gitPath);
}
