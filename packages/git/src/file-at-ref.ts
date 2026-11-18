import { gitOutput, gitOutputOrMaxBuffer, gitOutputOrNull } from "./git-command.js";
import { readCommittedTextSnapshot } from "./git-diff-content.js";

export type PathCommit = {
  readonly committedAt: string;
  readonly sha: string;
};

// Reads the text of one file at a commit, with the same 2 MiB and binary limits as
// the diff snapshots. Returns null for a missing path, an unknown ref or non-text.
export async function readFileAtRef(
  repoPath: string,
  ref: string,
  relativePath: string
): Promise<string | null> {
  if (!isRefArgument(ref)) return null;
  return (await readCommittedTextSnapshot(repoPath, ref, relativePath)) ?? null;
}

// Every commit on any ref that changed the path, oldest first. Throws when Git fails,
// including when the output exceeds the Git output buffer.
export async function listPathCommits(
  repoPath: string,
  relativePath: string
): Promise<readonly PathCommit[]> {
  const output = await gitOutput(repoPath, [
    "--literal-pathspecs",
    "log",
    "--all",
    "--reverse",
    "--format=%H%x09%ct",
    "--",
    relativePath
  ]);

  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .flatMap((line) => {
      const [sha, seconds] = line.split("\t");
      const committedAtMs = Number(seconds) * 1000;

      return sha && Number.isFinite(committedAtMs)
        ? [{ committedAt: new Date(committedAtMs).toISOString(), sha }]
        : [];
    });
}

export function firstCommitTouchingPathSince(
  commits: readonly PathCommit[],
  iso: string
): PathCommit | null {
  const since = Date.parse(iso);

  if (Number.isNaN(since)) return null;

  let first: PathCommit | null = null;

  for (const commit of commits) {
    const committedAt = Date.parse(commit.committedAt);

    if (committedAt < since) continue;
    if (first === null || committedAt < Date.parse(first.committedAt)) first = commit;
  }

  return first;
}

// The lexically first root commit across all refs, so checking out a branch with
// unrelated history does not change it. Null for a repository with no commit.
export async function readRootCommit(repoPath: string): Promise<string | null> {
  const output = await gitOutputOrNull(repoPath, [
    "rev-list",
    "--max-parents=0",
    "--all"
  ]);

  if (output === null) return null;

  const roots = output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .sort();

  return roots[0] ?? null;
}

export async function commitExists(repoPath: string, sha: string): Promise<boolean> {
  if (!isRefArgument(sha)) return false;
  return (
    (await gitOutputOrNull(repoPath, ["cat-file", "-e", `${sha}^{commit}`])) !== null
  );
}

// The unified diff of one file between two refs, following a rename from oldPath to
// newPath. Null when either ref is missing, the diff is empty or too large.
export async function readPatchBetween(
  repoPath: string,
  oldRef: string,
  newRef: string,
  oldPath: string,
  newPath: string
): Promise<string | null> {
  if (!isRefArgument(oldRef) || !isRefArgument(newRef)) return null;
  const paths = [...new Set([oldPath, newPath])];

  try {
    const output = await gitOutputOrMaxBuffer(repoPath, [
      "--literal-pathspecs",
      "diff",
      "-M",
      "--no-ext-diff",
      "--no-textconv",
      oldRef,
      newRef,
      "--",
      ...paths
    ]);

    return output === undefined || output.length === 0 ? null : output;
  } catch {
    return null;
  }
}

// Refs come from stored review targets; one that looks like an option never reaches Git.
function isRefArgument(ref: string): boolean {
  return ref.length > 0 && !ref.startsWith("-");
}
