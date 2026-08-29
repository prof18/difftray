import { createHash } from "node:crypto";
import path from "node:path";

import { gitBuffer } from "./git-command.js";

export type ParsedGitWorktree = {
  readonly bare?: true;
  readonly branchName?: string;
  readonly detached?: true;
  readonly headSha?: string;
  readonly locked: boolean;
  readonly lockReason?: string;
  readonly path: string;
  readonly prunable?: true;
  readonly prunableReason?: string;
};

export type GitWorktreeCandidate = ParsedGitWorktree & {
  readonly commonGitDir: string;
  readonly current: boolean;
  readonly id: string;
};

export async function listGitWorktrees(
  repositoryPath: string
): Promise<readonly GitWorktreeCandidate[]> {
  const [root, commonGitDirValue] = await Promise.all([
    gitPathOutput(repositoryPath, ["rev-parse", "--show-toplevel"]),
    gitPathOutput(repositoryPath, ["rev-parse", "--git-common-dir"])
  ]);

  if (!root || !commonGitDirValue) {
    throw new Error(`Unable to resolve Git worktree information for ${repositoryPath}`);
  }

  const commonGitDir = path.normalize(
    path.isAbsolute(commonGitDirValue)
      ? commonGitDirValue
      : path.resolve(root, commonGitDirValue)
  );
  const currentRoot = path.normalize(root);
  const output = await gitBuffer(repositoryPath, [
    "worktree",
    "list",
    "--porcelain",
    "-z"
  ]);

  return parseWorktreePorcelain(output).map((worktree) => ({
    ...worktree,
    commonGitDir,
    current: path.normalize(worktree.path) === currentRoot,
    id: worktreeOpaqueId(commonGitDir, worktree.path)
  }));
}

async function gitPathOutput(cwd: string, args: readonly string[]): Promise<string> {
  const output = await gitBuffer(cwd, args);

  // Git terminates this single path value with one LF. Remove only that
  // delimiter so embedded newlines and surrounding spaces remain intact.
  return (output.at(-1) === 0x0a ? output.subarray(0, -1) : output).toString("utf8");
}

export function parseWorktreePorcelain(output: Buffer): readonly ParsedGitWorktree[] {
  const records: ParsedGitWorktree[] = [];
  let record: MutableWorktree | undefined;

  for (const field of output.toString("utf8").split("\0")) {
    if (field.length === 0) {
      if (record) {
        records.push(finishRecord(record));
        record = undefined;
      }
      continue;
    }

    const separatorIndex = field.indexOf(" ");
    const key = separatorIndex < 0 ? field : field.slice(0, separatorIndex);
    const value = separatorIndex < 0 ? undefined : field.slice(separatorIndex + 1);

    if (key === "worktree") {
      if (record) {
        records.push(finishRecord(record));
      }
      record = { locked: false, path: value ?? "" };
      continue;
    }

    if (!record) {
      throw new Error("Git worktree record is missing its worktree path.");
    }

    if (key === "HEAD" && value) {
      record.headSha = value;
    } else if (key === "branch" && value) {
      record.branchName = value.replace(/^refs\/heads\//, "");
    } else if (key === "detached") {
      record.detached = true;
    } else if (key === "bare") {
      record.bare = true;
    } else if (key === "locked") {
      record.locked = true;
      if (value) record.lockReason = value;
    } else if (key === "prunable") {
      record.prunable = true;
      if (value) record.prunableReason = value;
    }
  }

  if (record) {
    records.push(finishRecord(record));
  }

  return records;
}

export function worktreeOpaqueId(commonGitDir: string, worktreePath: string): string {
  return createHash("sha256")
    .update(path.normalize(commonGitDir))
    .update("\0")
    .update(path.normalize(worktreePath))
    .digest("base64url");
}

type MutableWorktree = {
  bare?: true;
  branchName?: string;
  detached?: true;
  headSha?: string;
  locked: boolean;
  lockReason?: string;
  path: string;
  prunable?: true;
  prunableReason?: string;
};

function finishRecord(record: MutableWorktree): ParsedGitWorktree {
  if (!record.path) {
    throw new Error("Git worktree record is missing its worktree path.");
  }

  return record;
}
