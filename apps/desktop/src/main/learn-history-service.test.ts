import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  EXCERPT_MAX_LINES,
  buildLineExcerpt,
  createDiffHash,
  createReviewNoteScopeId,
  createReviewTargetId,
  type FeedbackExcerpt,
  type ReviewTarget
} from "@difftray/core";
import {
  openStorage,
  type DifftrayStorage,
  type StoredProjectRecord
} from "@difftray/storage";
import { afterEach, describe, expect, it } from "vitest";

import {
  EARLIER_BODY_MAX_CHARS,
  RECOVERY_BUDGET_MS,
  createLearnHistoryService,
  defaultLearnHistoryGit,
  type LearnHistoryGit,
  type LearnHistoryItem,
  type LearnHistoryResult
} from "./learn-history-service.js";
import {
  loadExplicitFileSummary,
  loadExplicitReviewTarget,
  selectedReviewSelector
} from "./review-context-service.js";
import { fileDiffFromGit, reviewTargetRecord } from "./view-models.js";

const roots: string[] = [];
const stores: DifftrayStorage[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

const gitReadNames = [
  "readFileAtRef",
  "readPatchBetween",
  "listPathCommits",
  "loadFileDiff"
] as const;

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function tempDir(): string {
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(), "difftray-learn-")));
  roots.push(directory);
  return directory;
}

function numbered(prefix: string, count = 10): string {
  return (
    Array.from({ length: count }, (_, index) => `${prefix} ${index + 1}`).join("\n") +
    "\n"
  );
}

function write(root: string, relativePath: string, text: string): void {
  mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
  writeFileSync(path.join(root, relativePath), text);
}

function initRepo(directory = tempDir(), prefix = "a"): string {
  mkdirSync(directory, { recursive: true });
  git(directory, "init", "-b", "main");
  git(directory, "config", "user.email", "test@example.com");
  git(directory, "config", "user.name", "Test");
  write(directory, "src/a.ts", numbered(prefix));
  git(directory, "add", ".");
  git(directory, "commit", "-m", "initial");
  return directory;
}

function commitAll(root: string, message: string): string {
  git(root, "add", "--all");
  git(root, "commit", "-m", message);
  return git(root, "rev-parse", "HEAD");
}

function addWorktree(root: string, branch: string): string {
  const worktree = `${root}-${branch}`;
  roots.push(worktree);
  git(root, "worktree", "add", "-b", branch, worktree);
  return worktree;
}

type Fixture = {
  readonly storage: DifftrayStorage;
  readonly sql: (statement: string, ...params: (string | null)[]) => void;
};

function openFixture(): Fixture {
  const filename = path.join(tempDir(), "difftray.sqlite");
  const storage = openStorage(filename);
  stores.push(storage);
  return {
    sql: (statement, ...params) => {
      const db = new DatabaseSync(filename);
      try {
        db.prepare(statement).run(...params);
      } finally {
        db.close();
      }
    },
    storage
  };
}

function register(
  storage: DifftrayStorage,
  projectPath: string,
  options: { readonly base?: string; readonly commit?: string } = {}
): StoredProjectRecord {
  storage.upsertProject({
    id: projectPath,
    name: path.basename(projectPath),
    path: projectPath,
    ...(options.base
      ? { defaultBaseRef: options.base, defaultDiffTargetMode: "branch" }
      : {}),
    ...(options.commit
      ? { defaultCommitRef: options.commit, defaultDiffTargetMode: "commit" }
      : {})
  });
  const project = storage.getProject(projectPath);
  if (!project) throw new Error("project missing");
  return project;
}

type CurrentTarget = { readonly id: string; readonly target: ReviewTarget };

async function currentTarget(
  storage: DifftrayStorage,
  project: StoredProjectRecord
): Promise<CurrentTarget> {
  const target = await loadExplicitReviewTarget(
    project.path,
    selectedReviewSelector(project)
  );
  const id = createReviewTargetId(target);
  storage.upsertReviewTarget(reviewTargetRecord(id, target));
  return { id, target };
}

async function currentHash(
  project: StoredProjectRecord,
  target: ReviewTarget,
  filePath: string,
  previousPath?: string
): Promise<string> {
  const summary = await loadExplicitFileSummary(
    project.path,
    target,
    filePath,
    previousPath
  );
  if (!summary) throw new Error(`no summary for ${filePath}`);
  return createDiffHash(target, fileDiffFromGit(summary));
}

type CommentInput = {
  readonly body: string;
  readonly path?: string;
  readonly previousPath?: string;
  readonly side?: "additions" | "deletions";
  readonly line?: number;
  readonly stale?: boolean;
  readonly diffHash?: string;
  readonly excerptJson?: string;
  readonly target?: CurrentTarget;
};

async function addLine(
  storage: DifftrayStorage,
  project: StoredProjectRecord,
  input: CommentInput
): Promise<string> {
  const target = input.target ?? (await currentTarget(storage, project));
  const filePath = input.path ?? "src/a.ts";
  const diffHash =
    input.diffHash ??
    (input.stale
      ? "stale"
      : await currentHash(project, target.target, filePath, input.previousPath));
  return storage.createReviewComment({
    body: input.body,
    diffHash,
    ...(input.excerptJson ? { excerptJson: input.excerptJson } : {}),
    lineEnd: input.line ?? 2,
    lineStart: input.line ?? 2,
    path: filePath,
    ...(input.previousPath ? { previousPath: input.previousPath } : {}),
    projectId: project.id,
    reviewTargetId: target.id,
    side: input.side ?? "additions"
  }).id;
}

async function addFileComment(
  storage: DifftrayStorage,
  project: StoredProjectRecord,
  input: CommentInput
): Promise<string> {
  const target = input.target ?? (await currentTarget(storage, project));
  const filePath = input.path ?? "src/a.ts";
  const diffHash = input.stale
    ? "stale"
    : await currentHash(project, target.target, filePath, input.previousPath);
  return storage.createReviewFileComment({
    body: input.body,
    diffHash,
    path: filePath,
    projectId: project.id,
    reviewTargetId: target.id
  }).id;
}

function countingGit(overrides: Partial<LearnHistoryGit> = {}) {
  const calls: string[] = [];
  const base: LearnHistoryGit = { ...defaultLearnHistoryGit, ...overrides };
  const wrapped = Object.fromEntries(
    Object.entries(base).map(([name, fn]) => [
      name,
      (...args: unknown[]) => {
        calls.push(name);
        return (fn as (...values: unknown[]) => unknown)(...args);
      }
    ])
  ) as LearnHistoryGit;
  return {
    calls,
    count: (name: keyof LearnHistoryGit) => calls.filter((call) => call === name).length,
    git: wrapped,
    reads: () =>
      calls.filter((call) => (gitReadNames as readonly string[]).includes(call)).length
  };
}

function collector(
  storage: DifftrayStorage,
  options: {
    readonly git?: LearnHistoryGit;
    readonly now?: () => number;
    readonly gitLookupCap?: number;
  } = {}
) {
  return createLearnHistoryService({
    git: options.git ?? defaultLearnHistoryGit,
    now: options.now ?? (() => Date.now() + 1000),
    storage,
    ...(options.gitLookupCap !== undefined ? { gitLookupCap: options.gitLookupCap } : {})
  });
}

function item(result: LearnHistoryResult, body: string): LearnHistoryItem {
  const found = result.newItems.find((entry) => entry.body === body);
  if (!found) throw new Error(`no item ${body}`);
  return found;
}

function bodies(result: LearnHistoryResult): readonly string[] {
  return result.newItems.map((entry) => entry.body).sort();
}

function excerptText(excerpt: FeedbackExcerpt | null): string {
  if (!excerpt) return "";
  if (excerpt.kind === "lines") return excerpt.lines.map((line) => line.text).join("\n");
  if (excerpt.kind === "patch") return excerpt.lines.join("\n");
  return excerpt.files.map((file) => file.path).join("\n");
}

describe("LearnHistoryService grouping", () => {
  it("collects feedback from both worktrees and not from an unrelated repository", async () => {
    const root = initRepo();
    const linked = addWorktree(root, "feature");
    const unrelated = initRepo();
    const { storage } = openFixture();
    const main = register(storage, root);
    const second = register(storage, linked);
    const foreign = register(storage, unrelated);
    write(root, "src/a.ts", numbered("worktree A"));
    write(linked, "src/a.ts", numbered("worktree B"));
    write(unrelated, "src/a.ts", numbered("unrelated"));
    await addLine(storage, main, { body: "main body" });
    await addLine(storage, second, { body: "linked body" });
    await addLine(storage, foreign, { body: "foreign body" });

    const result = await collector(storage).collect({ repoPath: root });

    expect(bodies(result)).toEqual(["linked body", "main body"]);
    expect(result.worktreeRoot).toBe(root);
    expect(result.commonGitDir).toBe(realpathSync(path.join(root, ".git")));
    expect(item(result, "main body")).toMatchObject({
      author: { kind: "human" },
      excerptSource: "recovered",
      kind: "line",
      status: "active",
      targetLabel: "working tree",
      worktreePath: root
    });
    // Rule 2 reads each item's own worktree, not the requested one.
    const linkedItem = item(result, "linked body");
    expect(linkedItem.worktreePath).toBe(linked);
    expect(excerptText(linkedItem.excerpt)).toContain("worktree B 2");
    expect(excerptText(linkedItem.excerpt)).not.toContain("worktree A");
  });

  it("keeps a removed worktree with target_changed and recovers through the requested worktree", async () => {
    const root = initRepo();
    const linked = addWorktree(root, "feature");
    write(linked, "src/a.ts", numbered("feature"));
    commitAll(linked, "feature change");
    const { storage } = openFixture();
    register(storage, root);
    const project = register(storage, linked, { base: "main" });
    await addLine(storage, project, { body: "removed body", line: 3 });
    await collector(storage).collect({ repoPath: root });
    git(root, "worktree", "remove", "--force", linked);

    const result = await collector(storage).collect({ repoPath: root });

    expect(item(result, "removed body")).toMatchObject({
      excerptSource: "recovered",
      status: "target_changed",
      targetLabel: "main...feature",
      worktreePath: linked
    });
    expect(excerptText(item(result, "removed body").excerpt)).toContain("feature 3");
  });

  it("returns the same items and excerpts from a subdirectory as from the root", async () => {
    const root = initRepo();
    const { storage } = openFixture();
    const project = register(storage, root);
    write(root, "src/a.ts", numbered("changed"));
    await addLine(storage, project, { body: "sub body" });
    const service = collector(storage, { now: () => Date.parse("2099-01-01") });

    const fromRoot = await service.collect({ repoPath: root });
    const fromSubdirectory = await service.collect({ repoPath: path.join(root, "src") });

    expect(fromSubdirectory.newItems).toEqual(fromRoot.newItems);
    expect(fromSubdirectory.worktreeRoot).toBe(root);
  });

  it("does not hide feedback behind a worktree project created later, and the cursor marks", async () => {
    const root = initRepo();
    const { storage } = openFixture();
    const project = register(storage, root);
    write(root, "src/a.ts", numbered("changed"));
    await addLine(storage, project, { body: "before worktree" });
    const linked = addWorktree(root, "later");
    register(storage, linked);

    const result = await collector(storage).collect({ repoPath: root });

    expect(bodies(result)).toEqual(["before worktree"]);
    expect(storage.getProjectRepositoryKey(linked)?.commonGitDirSince).toBeNull();
    expect(result.cursor).toBe(item(result, "before worktree").updatedAt);
    expect(
      storage.advanceLearnCursor(result.commonGitDir, result.cursor ?? "").moved
    ).toBe(true);
  });
});

describe("LearnHistoryService status", () => {
  it("follows the agent feedback precedence for comments and notes", async () => {
    const root = initRepo();
    write(root, "src/c.ts", numbered("c"));
    commitAll(root, "add c");
    const { storage } = openFixture();
    const project = register(storage, root);
    write(root, "src/a.ts", numbered("changed"));
    write(root, "src/c.ts", numbered("c changed"));
    const current = await currentTarget(storage, project);
    await addLine(storage, project, { body: "active", target: current });
    await addLine(storage, project, {
      body: "hash changed",
      stale: true,
      target: current
    });
    await addLine(storage, project, { body: "gone", path: "src/c.ts", target: current });
    git(root, "checkout", "--", "src/c.ts");
    storage.upsertReviewTarget({
      headKind: "working_tree",
      headRefName: "main",
      headRefSha: "0000000000000000000000000000000000000000",
      id: "old-target",
      mode: "working_tree",
      projectId: project.id
    });
    await addLine(storage, project, {
      body: "old target",
      diffHash: "whatever",
      target: { id: "old-target", target: current.target }
    });
    const scope = createReviewNoteScopeId(current.target);
    storage.saveReviewNote({
      body: "current dismissed",
      projectId: project.id,
      scopeId: scope
    });
    storage.setReviewNoteDismissed(scope, true);
    storage.saveReviewNote({
      body: "old note",
      projectId: project.id,
      scopeId: "old-scope"
    });
    storage.saveReviewNote({
      body: "old dismissed",
      projectId: project.id,
      scopeId: "old-dismissed"
    });
    storage.setReviewNoteDismissed("old-dismissed", true);

    const result = await collector(storage).collect({ repoPath: root });

    expect(item(result, "active").status).toBe("active");
    expect(item(result, "hash changed").status).toBe("diff_changed");
    expect(item(result, "gone").status).toBe("diff_changed");
    expect(item(result, "old target").status).toBe("target_changed");
    expect(item(result, "current dismissed")).toMatchObject({
      dismissed: true,
      kind: "note",
      path: null,
      status: "dismissed",
      targetLabel: "working tree"
    });
    expect(item(result, "old note")).toMatchObject({
      dismissed: false,
      excerptSource: "unavailable",
      status: "target_changed",
      targetLabel: "earlier target"
    });
    expect(item(result, "old dismissed")).toMatchObject({
      dismissed: true,
      status: "target_changed"
    });
  });

  it("reports comments of a project whose base branch was deleted as target_changed", async () => {
    const root = initRepo();
    git(root, "branch", "base");
    write(root, "src/a.ts", numbered("main next"));
    commitAll(root, "next");
    const { storage } = openFixture();
    const project = register(storage, root, { base: "base" });
    await addLine(storage, project, { body: "base deleted" });
    git(root, "branch", "-D", "base");

    const result = await collector(storage).collect({ repoPath: root });

    expect(item(result, "base deleted")).toMatchObject({
      excerptSource: "recovered",
      status: "target_changed"
    });
    expect(excerptText(item(result, "base deleted").excerpt)).toContain("main next 2");
  });

  it("loads targets only for projects with rows and summaries only when needed", async () => {
    const root = initRepo();
    const linked = addWorktree(root, "feature");
    const { storage } = openFixture();
    register(storage, root);
    const second = register(storage, linked);
    storage.upsertReviewTarget({
      headKind: "working_tree",
      headRefSha: "1111111111111111111111111111111111111111",
      id: "elsewhere",
      mode: "working_tree",
      projectId: second.id
    });
    storage.createReviewComment({
      body: "other target",
      diffHash: "h",
      lineEnd: 1,
      lineStart: 1,
      path: "src/a.ts",
      projectId: second.id,
      reviewTargetId: "elsewhere",
      side: "deletions"
    });
    const counting = countingGit();

    const result = await collector(storage, { git: counting.git }).collect({
      repoPath: root
    });

    expect(bodies(result)).toEqual(["other target"]);
    expect(counting.count("loadCurrentTarget")).toBe(1);
    expect(counting.count("loadTargetSummaries")).toBe(0);
  });
});

describe("LearnHistoryService excerpt rules", () => {
  it("uses a saved excerpt first, and falls back to unavailable", async () => {
    const root = initRepo();
    const { storage } = openFixture();
    const project = register(storage, root);
    const saved = buildLineExcerpt({
      lineEnd: 1,
      lineStart: 1,
      maxLines: EXCERPT_MAX_LINES,
      side: "additions",
      text: "saved text\n"
    });
    await addLine(storage, project, {
      body: "saved",
      excerptJson: JSON.stringify(saved),
      stale: true
    });
    await addFileComment(storage, project, { body: "nothing", stale: true });
    const counting = countingGit();

    const result = await collector(storage, { git: counting.git }).collect({
      repoPath: root
    });

    expect(item(result, "saved")).toMatchObject({
      excerpt: saved,
      excerptSource: "saved"
    });
    expect(item(result, "nothing")).toMatchObject({
      excerpt: null,
      excerptSource: "unavailable",
      kind: "file"
    });
    expect(counting.reads()).toBe(0);
  });

  it("recovers active working-tree comments and file comments with rule 2", async () => {
    const root = initRepo();
    const { storage } = openFixture();
    const project = register(storage, root);
    write(root, "src/a.ts", numbered("live"));
    await addLine(storage, project, { body: "live line" });
    await addFileComment(storage, project, { body: "live file" });

    const result = await collector(storage).collect({ repoPath: root });

    expect(item(result, "live line").excerptSource).toBe("recovered");
    expect(excerptText(item(result, "live line").excerpt)).toContain("live 2");
    expect(item(result, "live file")).toMatchObject({
      excerpt: { kind: "patch" },
      excerptSource: "recovered"
    });
    expect(excerptText(item(result, "live file").excerpt)).toContain("+live 2");
  });

  it("does not follow a symlink that replaced the commented file", async () => {
    const root = initRepo();
    const secretDirectory = tempDir();
    write(secretDirectory, "secret.txt", numbered("TOP SECRET"));
    const { storage } = openFixture();
    const project = register(storage, root);
    rmSync(path.join(root, "src/a.ts"));
    symlinkSync(path.join(secretDirectory, "secret.txt"), path.join(root, "src/a.ts"));
    await addLine(storage, project, { body: "symlink" });

    const result = await collector(storage).collect({ repoPath: root });

    expect(item(result, "symlink").status).toBe("active");
    expect(JSON.stringify(item(result, "symlink").excerpt)).not.toContain("TOP SECRET");
  });

  it("falls through from a rule-2 miss on an active branch comment to rule 3", async () => {
    const root = initRepo();
    git(root, "branch", "base");
    write(root, "src/a.ts", numbered("branch head"));
    commitAll(root, "head");
    const { storage } = openFixture();
    const project = register(storage, root, { base: "base" });
    await addLine(storage, project, { body: "branch active" });
    const counting = countingGit({ loadFileDiff: async () => null });

    const result = await collector(storage, { git: counting.git }).collect({
      repoPath: root
    });

    expect(item(result, "branch active")).toMatchObject({
      excerptSource: "recovered",
      status: "active",
      targetLabel: "base...main"
    });
    expect(excerptText(item(result, "branch active").excerpt)).toContain("branch head 2");
    expect(counting.count("loadFileDiff")).toBe(1);
    expect(counting.count("readFileAtRef")).toBe(1);
  });

  it("reads branch, commit and renamed deletions at the right refs with rule 3", async () => {
    const root = initRepo();
    git(root, "branch", "base");
    git(root, "mv", "src/a.ts", "src/b.ts");
    write(root, "src/b.ts", numbered("renamed"));
    write(root, "src/d.ts", numbered("added"));
    const head = commitAll(root, "rename");
    const { storage } = openFixture();
    const branchProject = register(storage, root, { base: "base" });
    await addLine(storage, branchProject, {
      body: "renamed deletions",
      path: "src/b.ts",
      previousPath: "src/a.ts",
      side: "deletions",
      stale: true
    });
    await addLine(storage, branchProject, {
      body: "branch additions",
      path: "src/b.ts",
      previousPath: "src/a.ts",
      stale: true
    });
    const commitTarget = await currentTarget(storage, {
      ...branchProject,
      defaultCommitRef: head,
      defaultDiffTargetMode: "commit"
    });
    await addLine(storage, branchProject, {
      body: "commit additions",
      path: "src/d.ts",
      stale: true,
      target: commitTarget
    });
    await addLine(storage, branchProject, {
      body: "commit deletions",
      path: "src/b.ts",
      previousPath: "src/a.ts",
      side: "deletions",
      stale: true,
      target: commitTarget
    });

    const result = await collector(storage).collect({ repoPath: root });

    expect(excerptText(item(result, "renamed deletions").excerpt)).toContain("a 2");
    expect(item(result, "renamed deletions").excerptSource).toBe("recovered");
    expect(excerptText(item(result, "branch additions").excerpt)).toContain("renamed 2");
    expect(excerptText(item(result, "commit additions").excerpt)).toContain("added 2");
    expect(excerptText(item(result, "commit deletions").excerpt)).toContain("a 2");
    expect(item(result, "commit additions").targetLabel).toBe(
      `commit ${head.slice(0, 7)}`
    );
  });

  it("reads working-tree deletions at the head commit with rule 4", async () => {
    const root = initRepo();
    const { storage } = openFixture();
    const project = register(storage, root);
    write(root, "src/a.ts", numbered("edited"));
    await addLine(storage, project, {
      body: "wt deletions",
      side: "deletions",
      stale: true
    });

    const result = await collector(storage).collect({ repoPath: root });

    expect(item(result, "wt deletions").excerptSource).toBe("recovered");
    expect(excerptText(item(result, "wt deletions").excerpt)).toContain("a 2");
  });

  it("uses the oldest later target of the same branch with rule 5a", async () => {
    const root = initRepo();
    const fixture = openFixture();
    const { storage } = fixture;
    const project = register(storage, root);
    write(root, "src/a.ts", numbered("uncommitted"));
    const commentId = await addLine(storage, project, {
      body: "approximate",
      stale: true
    });
    fixture.sql(
      "update review_comments set created_at = ? where id = ?",
      "2020-01-01T00:00:00.000Z",
      commentId
    );
    write(root, "src/a.ts", numbered("first later"));
    const firstLater = commitAll(root, "first later");
    write(root, "src/a.ts", numbered("second later"));
    const secondLater = commitAll(root, "second later");
    const targets = [
      {
        headRefName: "main",
        id: "before",
        sha: firstLater,
        at: "2019-01-01T00:00:00.000Z"
      },
      {
        headRefName: "other",
        id: "other-branch",
        sha: firstLater,
        at: "2021-01-01T00:00:00.000Z"
      },
      {
        headRefName: "main",
        id: "second",
        sha: secondLater,
        at: "2022-01-01T00:00:00.000Z"
      },
      {
        headRefName: "main",
        id: "first",
        sha: firstLater,
        at: "2021-06-01T00:00:00.000Z"
      }
    ];
    for (const target of targets) {
      storage.upsertReviewTarget({
        headKind: "working_tree",
        headRefName: target.headRefName,
        headRefSha: target.sha,
        id: target.id,
        mode: "working_tree",
        projectId: project.id
      });
      fixture.sql(
        "update review_targets set created_at = ? where id = ?",
        target.at,
        target.id
      );
    }
    const counting = countingGit();

    const result = await collector(storage, { git: counting.git }).collect({
      repoPath: root
    });

    expect(item(result, "approximate")).toMatchObject({
      excerptCommit: firstLater,
      excerptSource: "approximate"
    });
    expect(excerptText(item(result, "approximate").excerpt)).toContain("first later 2");
    expect(counting.count("listPathCommits")).toBe(0);
  });

  it("uses the first commit touching the path with rule 5b, listing commits once per path", async () => {
    const root = initRepo();
    const fixture = openFixture();
    const { storage } = fixture;
    const project = register(storage, root);
    write(root, "src/a.ts", numbered("uncommitted"));
    const ids = [
      await addLine(storage, project, { body: "five b one", stale: true }),
      await addLine(storage, project, { body: "five b two", stale: true, line: 3 }),
      await addLine(storage, project, { body: "five b three", stale: true, line: 4 })
    ];
    for (const id of ids)
      fixture.sql(
        "update review_comments set created_at = ? where id = ?",
        "2020-01-01T00:00:00.000Z",
        id
      );
    const initial = git(root, "rev-list", "--max-parents=0", "HEAD");
    const counting = countingGit();

    const result = await collector(storage, { git: counting.git }).collect({
      repoPath: root
    });

    expect(item(result, "five b one")).toMatchObject({
      excerptCommit: initial,
      excerptSource: "approximate"
    });
    expect(excerptText(item(result, "five b three").excerpt)).toContain("a 4");
    expect(counting.count("listPathCommits")).toBe(1);
  });

  it("reads the patch between the target refs for a branch file comment with rule 6", async () => {
    const root = initRepo();
    git(root, "branch", "base");
    write(root, "src/a.ts", numbered("patched"));
    commitAll(root, "patch");
    const { storage } = openFixture();
    const project = register(storage, root, { base: "base" });
    await addFileComment(storage, project, { body: "old file comment", stale: true });

    const result = await collector(storage).collect({ repoPath: root });

    expect(item(result, "old file comment")).toMatchObject({
      excerpt: { kind: "patch" },
      excerptSource: "recovered"
    });
    expect(excerptText(item(result, "old file comment").excerpt)).toContain("+patched 2");
  });
});

describe("LearnHistoryService bounds", () => {
  it("turns lookups after the cap into not_looked_up", async () => {
    const root = initRepo();
    const { storage } = openFixture();
    const project = register(storage, root);
    write(root, "src/a.ts", numbered("edited"));
    for (let index = 1; index <= 5; index += 1)
      await addLine(storage, project, {
        body: `capped ${index}`,
        line: index,
        side: "deletions",
        stale: true
      });
    const counting = countingGit();

    const result = await collector(storage, {
      git: counting.git,
      gitLookupCap: 3
    }).collect({ repoPath: root });

    expect(result.newItems.map((entry) => entry.excerptSource)).toEqual([
      "recovered",
      "recovered",
      "recovered",
      "not_looked_up",
      "not_looked_up"
    ]);
    expect(counting.reads()).toBe(3);
  });

  it("loads summaries once per project and stays within the cap for 200 items", async () => {
    const root = initRepo();
    for (const name of ["b", "c", "d"]) write(root, `src/${name}.ts`, numbered(name));
    commitAll(root, "more files");
    const { storage } = openFixture();
    const project = register(storage, root);
    const target = await currentTarget(storage, project);
    const files = ["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts"];
    for (const file of files) write(root, file, numbered(`edited ${file}`));
    const hashes = new Map<string, string>();
    for (const file of files)
      hashes.set(file, await currentHash(project, target.target, file));
    for (let index = 0; index < 200; index += 1) {
      const file = files[index % files.length] ?? "src/a.ts";
      await addLine(storage, project, {
        body: `bulk ${index}`,
        diffHash: hashes.get(file) ?? "",
        line: (index % 10) + 1,
        path: file,
        target
      });
    }
    const counting = countingGit();

    const result = await collector(storage, {
      git: counting.git,
      gitLookupCap: 20
    }).collect({ repoPath: root });

    expect(result.newItems).toHaveLength(200);
    expect(result.newItems.every((entry) => entry.status === "active")).toBe(true);
    expect(counting.count("loadTargetSummaries")).toBe(1);
    expect(counting.reads()).toBeLessThanOrEqual(20);
    expect(
      result.newItems.filter((entry) => entry.excerptSource === "not_looked_up")
    ).toHaveLength(180);
  });

  it("stops recovery once the clock passes the recovery budget", async () => {
    const root = initRepo();
    const { storage } = openFixture();
    const project = register(storage, root);
    write(root, "src/a.ts", numbered("edited"));
    for (let index = 1; index <= 3; index += 1)
      await addLine(storage, project, {
        body: `budget ${index}`,
        line: index,
        side: "deletions",
        stale: true
      });
    let clock = Date.now() + 1000;
    const counting = countingGit({
      readFileAtRef: async (...args) => {
        clock += RECOVERY_BUDGET_MS + 1;
        return defaultLearnHistoryGit.readFileAtRef(...args);
      }
    });

    const result = await collector(storage, {
      git: counting.git,
      now: () => clock
    }).collect({ repoPath: root });

    expect(result.newItems.map((entry) => entry.excerptSource)).toEqual([
      "recovered",
      "not_looked_up",
      "not_looked_up"
    ]);
  });

  it("stops with request_timeout when the signal is aborted", async () => {
    const root = initRepo();
    const { storage } = openFixture();
    const project = register(storage, root);
    write(root, "src/a.ts", numbered("edited"));
    await addLine(storage, project, { body: "one", side: "deletions", stale: true });
    await addLine(storage, project, { body: "two", side: "deletions", stale: true });
    const before = new AbortController();
    before.abort();

    await expect(
      collector(storage).collect({ repoPath: root, signal: before.signal })
    ).rejects.toMatchObject({ code: "request_timeout" });

    const during = new AbortController();
    const counting = countingGit({
      readFileAtRef: async (...args) => {
        during.abort();
        return defaultLearnHistoryGit.readFileAtRef(...args);
      }
    });
    await expect(
      collector(storage, { git: counting.git }).collect({
        repoPath: root,
        signal: during.signal
      })
    ).rejects.toMatchObject({ code: "request_timeout" });
    expect(counting.count("readFileAtRef")).toBe(1);
  });
});

describe("LearnHistoryService window", () => {
  async function seedWindow() {
    const root = initRepo();
    const fixture = openFixture();
    const project = register(fixture.storage, root);
    const times: Record<string, string> = {
      ancient: "2025-06-01T00:00:00.000Z",
      first: "2026-01-01T00:00:00.000Z",
      second: "2026-02-01T00:00:00.000Z",
      third: "2026-03-01T00:00:00.000Z"
    };
    for (const [body, at] of Object.entries(times)) {
      const id = await addLine(fixture.storage, project, {
        body: body === "second" ? `second\nmore ${"x".repeat(300)}` : body,
        stale: true
      });
      fixture.sql(
        "update review_comments set created_at = ?, updated_at = ? where id = ?",
        at,
        at,
        id
      );
    }
    return { fixture, root };
  }
  const april = () => Date.parse("2026-04-01T00:00:00.000Z");

  it("chooses the window from all, since and the stored cursor", async () => {
    const { fixture, root } = await seedWindow();
    const service = collector(fixture.storage, { now: april });

    const all = await service.collect({ all: true, repoPath: root });
    expect(all.newItems).toHaveLength(4);
    expect(all.earlierItems).toEqual([]);

    const since = await service.collect({
      repoPath: root,
      since: "2026-01-15T00:00:00.000Z"
    });
    expect(since.newItems.map((entry) => entry.body.split("\n")[0])).toEqual([
      "second",
      "third"
    ]);
    expect(since.earlierItems.map((entry) => entry.bodyFirstLine)).toEqual(["first"]);

    fixture.storage.advanceLearnCursor(all.commonGitDir, "2026-02-15T00:00:00.000Z");
    const stored = await service.collect({ repoPath: root });
    expect(stored.lastLearnedAt).toBe("2026-02-15T00:00:00.000Z");
    expect(stored.newItems.map((entry) => entry.body)).toEqual(["third"]);
    expect(stored.earlierItems.map((entry) => entry.bodyFirstLine)).toEqual([
      "second",
      "first"
    ]);
    expect(stored.earlierItems[0]).toEqual({
      author: { kind: "human" },
      bodyFirstLine: "second",
      createdAt: "2026-02-01T00:00:00.000Z",
      dismissed: false,
      id: stored.earlierItems[0]?.id,
      kind: "line",
      path: "src/a.ts",
      status: "diff_changed",
      updatedAt: "2026-02-01T00:00:00.000Z"
    });
  });

  it("cuts earlier bodies to EARLIER_BODY_MAX_CHARS", async () => {
    const root = initRepo();
    const fixture = openFixture();
    const project = register(fixture.storage, root);
    const id = await addLine(fixture.storage, project, {
      body: "y".repeat(EARLIER_BODY_MAX_CHARS + 50),
      stale: true
    });
    fixture.sql(
      "update review_comments set created_at = ?, updated_at = ? where id = ?",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
      id
    );

    const result = await collector(fixture.storage, { now: april }).collect({
      repoPath: root,
      since: "2026-02-01T00:00:00.000Z"
    });

    expect(result.earlierItems[0]?.bodyFirstLine).toHaveLength(EARLIER_BODY_MAX_CHARS);
  });

  it("leaves feedback written at reportStartedAt for the next report", async () => {
    const root = initRepo();
    const fixture = openFixture();
    const project = register(fixture.storage, root);
    const startedAt = Date.parse("2026-05-01T00:00:00.000Z");
    const early = await addLine(fixture.storage, project, { body: "early", stale: true });
    const late = await addLine(fixture.storage, project, { body: "late", stale: true });
    fixture.sql(
      "update review_comments set created_at = ?, updated_at = ? where id = ?",
      "2026-04-30T23:59:50.000Z",
      "2026-04-30T23:59:50.000Z",
      early
    );
    fixture.sql(
      "update review_comments set created_at = ?, updated_at = ? where id = ?",
      new Date(startedAt).toISOString(),
      new Date(startedAt).toISOString(),
      late
    );

    const first = await collector(fixture.storage, { now: () => startedAt }).collect({
      repoPath: root
    });
    expect(first.newItems.map((entry) => entry.body)).toEqual(["early"]);
    expect(first.cursor).toBe("2026-04-30T23:59:50.000Z");
    fixture.storage.advanceLearnCursor(first.commonGitDir, first.cursor ?? "");

    const next = await collector(fixture.storage, {
      now: () => startedAt + 1000
    }).collect({
      repoPath: root
    });
    expect(next.newItems.map((entry) => entry.body)).toEqual(["late"]);
  });
});

describe("LearnHistoryService repository replacement", () => {
  it("cuts off feedback of a linked worktree whose common directory changed", async () => {
    const repoX = initRepo();
    const linked = addWorktree(repoX, "feat");
    const fixture = openFixture();
    const { storage } = fixture;
    const project = register(storage, linked);
    await addLine(storage, project, { body: "old X", stale: true });
    await collector(storage).collect({ repoPath: linked });
    git(repoX, "worktree", "remove", "--force", linked);
    const repoY = initRepo(tempDir(), "y");
    git(repoY, "worktree", "add", "-b", "feat-y", linked);

    let clock = Date.now() + 1000;
    const service = collector(storage, { now: () => clock });
    const replaced = await service.collect({ repoPath: linked });
    expect(bodies(replaced)).toEqual([]);
    const key = storage.getProjectRepositoryKey(linked);
    expect(key?.commonGitDir).toBe(realpathSync(path.join(repoY, ".git")));
    expect(key?.commonGitDirSince).toBe(new Date(clock).toISOString());

    const fresh = await addLine(storage, project, { body: "new Y", stale: true });
    const after = new Date(clock + 1000).toISOString();
    fixture.sql(
      "update review_comments set created_at = ?, updated_at = ? where id = ?",
      after,
      after,
      fresh
    );
    clock += 5000;
    expect(bodies(await service.collect({ repoPath: repoY }))).toEqual(["new Y"]);
  });

  it("cuts off a standalone clone replaced by an unrelated clone at the same path", async () => {
    const origin = initRepo();
    const unrelatedOrigin = initRepo(tempDir(), "unrelated");
    const parent = tempDir();
    const clone = path.join(parent, "clone");
    execFileSync("git", ["clone", "--quiet", origin, clone]);
    const fixture = openFixture();
    const { storage } = fixture;
    const project = register(storage, clone);
    await addLine(storage, project, { body: "old clone", stale: true });
    const linked = addWorktree(clone, "old-wt");
    const linkedProject = register(storage, linked);
    await addLine(storage, linkedProject, { body: "old linked", stale: true });
    storage.saveReviewNote({
      body: "old note",
      projectId: project.id,
      scopeId: "old-note"
    });
    const first = await collector(storage).collect({ repoPath: clone });
    expect(bodies(first)).toEqual(["old clone", "old linked", "old note"]);
    const removedNullRoot = path.join(parent, "gone");
    register(storage, removedNullRoot);
    storage.setProjectCommonGitDir(removedNullRoot, first.commonGitDir, null, null);
    storage.upsertReviewTarget({
      headKind: "working_tree",
      headRefSha: "2222222222222222222222222222222222222222",
      id: "gone-target",
      mode: "working_tree",
      projectId: removedNullRoot
    });
    storage.createReviewComment({
      body: "old null root",
      diffHash: "h",
      lineEnd: 1,
      lineStart: 1,
      path: "src/a.ts",
      projectId: removedNullRoot,
      reviewTargetId: "gone-target",
      side: "deletions"
    });
    expect(bodies(await collector(storage).collect({ repoPath: clone }))).toContain(
      "old null root"
    );
    storage.advanceLearnCursor(first.commonGitDir, "2000-01-01T00:00:00.000Z");
    git(clone, "worktree", "remove", "--force", linked);
    rmSync(clone, { force: true, recursive: true });
    execFileSync("git", ["clone", "--quiet", unrelatedOrigin, clone]);

    const replaced = await collector(storage).collect({ repoPath: clone });

    expect(bodies(replaced)).toEqual([]);
    expect(storage.getLearnCursor(first.commonGitDir)).toBeNull();
    expect(
      storage.getProjectRepositoryKey(removedNullRoot)?.commonGitDirSince
    ).not.toBeNull();

    storage.setReviewNoteDismissed("old-note", true);
    const afterDismiss = await collector(storage, {
      now: () => Date.now() + 5000
    }).collect({ repoPath: clone });
    expect(bodies(afterDismiss)).toEqual([]);
  });

  it("keeps all history when the same repository is cloned again at the path", async () => {
    const origin = initRepo();
    const clone = path.join(tempDir(), "clone");
    execFileSync("git", ["clone", "--quiet", origin, clone]);
    const { storage } = openFixture();
    const project = register(storage, clone);
    await addLine(storage, project, { body: "kept", stale: true });
    await collector(storage).collect({ repoPath: clone });
    rmSync(clone, { force: true, recursive: true });
    execFileSync("git", ["clone", "--quiet", origin, clone]);

    const result = await collector(storage).collect({ repoPath: clone });

    expect(bodies(result)).toEqual(["kept"]);
    expect(storage.getProjectRepositoryKey(clone)?.commonGitDirSince).toBeNull();
  });

  it("cuts off a leftover linked worktree directory that no longer resolves after a clone replacement", async () => {
    const origin = initRepo();
    const unrelatedOrigin = initRepo(tempDir(), "unrelated");
    const clone = path.join(tempDir(), "clone");
    execFileSync("git", ["clone", "--quiet", origin, clone]);
    const { storage } = openFixture();
    const project = register(storage, clone);
    await addLine(storage, project, { body: "old clone", stale: true });
    const linked = addWorktree(clone, "old-wt");
    const linkedProject = register(storage, linked);
    await addLine(storage, linkedProject, { body: "old linked", stale: true });
    const first = await collector(storage).collect({ repoPath: clone });
    expect(bodies(first)).toEqual(["old clone", "old linked"]);
    // Replacing the main clone drops the linked worktree's metadata but leaves its
    // directory behind.
    rmSync(clone, { force: true, recursive: true });
    execFileSync("git", ["clone", "--quiet", unrelatedOrigin, clone]);
    await expect(defaultLearnHistoryGit.pathExists(linked)).resolves.toBe(true);
    await expect(defaultLearnHistoryGit.resolveWorktree(linked)).rejects.toThrow();

    const replaced = await collector(storage).collect({ repoPath: clone });

    expect(replaced.commonGitDir).toBe(first.commonGitDir);
    expect(bodies(replaced)).toEqual([]);
    expect(storage.getProjectRepositoryKey(linked)?.commonGitDirSince).not.toBeNull();
  });

  it("keeps a removed worktree whose stored root still exists but is not the current root", async () => {
    const root = initRepo();
    const mainRoot = git(root, "rev-parse", "HEAD");
    git(root, "checkout", "--quiet", "--orphan", "other-root");
    git(root, "rm", "-rf", "--quiet", ".");
    write(root, "other.txt", "other\n");
    const otherRoot = commitAll(root, "other root");
    git(root, "checkout", "--quiet", "main");
    const linked = addWorktree(root, "feature");
    const { storage } = openFixture();
    register(storage, root);
    const project = register(storage, linked);
    await addLine(storage, project, { body: "removed kept", stale: true });
    const first = await collector(storage).collect({ repoPath: root });
    const requestedRoot = storage.getProjectRepositoryKey(root)?.repositoryRootCommit;
    expect(requestedRoot).toBe([mainRoot, otherRoot].sort()[0]);
    const differentRoot = requestedRoot === mainRoot ? otherRoot : mainRoot;
    storage.setProjectCommonGitDir(linked, first.commonGitDir, null, differentRoot);
    git(root, "worktree", "remove", "--force", linked);

    const result = await collector(storage).collect({ repoPath: root });

    expect(bodies(result)).toEqual(["removed kept"]);
  });

  it("drops a removed worktree whose stored root is not a commit of the repository", async () => {
    const root = initRepo();
    const linked = addWorktree(root, "feature");
    const { storage } = openFixture();
    register(storage, root);
    const project = register(storage, linked);
    await addLine(storage, project, { body: "foreign", stale: true });
    const first = await collector(storage).collect({ repoPath: root });
    storage.setProjectCommonGitDir(
      linked,
      first.commonGitDir,
      null,
      "3333333333333333333333333333333333333333"
    );
    git(root, "worktree", "remove", "--force", linked);

    const result = await collector(storage).collect({ repoPath: root });

    expect(bodies(result)).toEqual([]);
  });

  it("does not treat a branch with unrelated history as a replacement", async () => {
    const root = initRepo();
    const { storage } = openFixture();
    const project = register(storage, root);
    await addLine(storage, project, { body: "before orphan", stale: true });
    await collector(storage).collect({ repoPath: root });
    git(root, "checkout", "--orphan", "unrelated");
    git(root, "rm", "-rf", "--quiet", ".");
    write(root, "other.txt", "other\n");
    commitAll(root, "unrelated root");

    const result = await collector(storage).collect({ repoPath: root });

    expect(bodies(result)).toEqual(["before orphan"]);
    expect(storage.getProjectRepositoryKey(root)?.commonGitDirSince).toBeNull();
  });
});
