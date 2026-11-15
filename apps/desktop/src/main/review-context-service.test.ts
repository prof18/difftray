import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openStorage, type DifftrayStorage } from "@difftray/storage";
import {
  createReviewContextService,
  loadExplicitReviewState
} from "./review-context-service.js";
import { reviewMarkLineageFields } from "./review-mark-lineage.js";

const roots: string[] = [];
const stores: DifftrayStorage[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function git(root: string, ...args: string[]) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}
function fixture() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "difftray-agent-context-")));
  roots.push(root);
  git(root, "init", "-b", "main");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "Test");
  writeFileSync(path.join(root, "file.txt"), "initial\n");
  git(root, "add", ".");
  git(root, "commit", "-m", "initial");
  const store = openStorage(":memory:");
  stores.push(store);
  return { root, store, service: createReviewContextService(store) };
}

describe("explicit review contexts", () => {
  it("registers distinct linked worktrees without opening tabs, freezes selected mode and visibility", async () => {
    const { root, store, service } = fixture();
    const linked = `${root}-linked`;
    roots.push(linked);
    git(root, "worktree", "add", "-b", "other", linked);
    writeFileSync(path.join(root, "file.txt"), "main edit\n");
    writeFileSync(path.join(linked, "file.txt"), "linked edit\n");
    const first = await service.inspect(root, { kind: "selected" });
    const second = await service.inspect(linked, { kind: "working-tree" });
    expect(first.projectId).not.toBe(second.projectId);
    expect(first.snapshotHash).not.toBe(second.snapshotHash);
    expect(store.listOpenProjects()).toEqual([]);
    store.updateProjectDefaultDiffTarget(first.projectId, {
      mode: "commit",
      ref: "HEAD"
    });
    store.upsertAppSettings({ ...store.getAppSettings(), showGeneratedFiles: true });
    expect((await service.validate(first.id)).snapshotHash).toBe(first.snapshotHash);
    expect(first.selector).toEqual({ kind: "working-tree" });
  });
  it("rejects content, HEAD and base-ref movement, including untracked files", async () => {
    const { root, service } = fixture();
    writeFileSync(path.join(root, "new.txt"), "one\n");
    const context = await service.inspect(root, { kind: "working-tree" });
    writeFileSync(path.join(root, "new.txt"), "two\n");
    await expect(service.validate(context.id)).rejects.toMatchObject({
      code: "stale_review"
    });
    const next = await service.inspect(root, { kind: "working-tree" });
    git(root, "add", ".");
    git(root, "commit", "-m", "next");
    await expect(service.validate(next.id)).rejects.toMatchObject({
      code: "stale_review"
    });
    git(root, "branch", "base", "HEAD~1");
    const branch = await service.inspect(root, { kind: "branch", base: "base" });
    git(root, "branch", "-f", "base", "HEAD");
    await expect(service.validate(branch.id)).rejects.toMatchObject({
      code: "stale_review"
    });
  });
  it("pins commit SHA across checkout and detects repository replacement", async () => {
    const { root, service } = fixture();
    const context = await service.inspect(root, { kind: "commit", commit: "HEAD" });
    writeFileSync(path.join(root, "file.txt"), "next\n");
    git(root, "commit", "-am", "next");
    expect((await service.validate(context.id)).reviewTargetId).toBe(
      context.reviewTargetId
    );
    const old = `${root}-old`;
    roots.push(old);
    renameSync(root, old);
    git(old, "clone", old, root);
    await expect(service.validate(context.id)).rejects.toMatchObject({
      code: "stale_review"
    });
  });
  it("retains contexts across service restart and enforces TTL and capacity", async () => {
    const { root, store } = fixture();
    let now = 100;
    const service = createReviewContextService(store, {
      now: () => now,
      ttl: 10,
      maxContexts: 1
    });
    const context = await service.inspect(root, { kind: "working-tree" });
    await expect(service.inspect(root, { kind: "working-tree" })).rejects.toMatchObject({
      code: "limit_exceeded"
    });
    const restarted = createReviewContextService(store, { now: () => now });
    expect((await restarted.validate(context.id)).id).toBe(context.id);
    now = 110;
    await expect(restarted.validate(context.id)).rejects.toMatchObject({
      code: "context_expired"
    });
    await expect(service.inspect(root, { kind: "working-tree" })).resolves.toBeDefined();
  });
  it("checks again after an asynchronous live read", async () => {
    const { root, service } = fixture();
    const context = await service.inspect(root, { kind: "working-tree" });
    await expect(
      service.withContext(context.id, { live: true }, async () => {
        writeFileSync(path.join(root, "untracked"), "changed");
        return "must not escape";
      })
    ).rejects.toMatchObject({ code: "stale_review" });
  });
  it("validates manifest reads once and rejects the next read after a change", async () => {
    const { root, service } = fixture();
    const context = await service.inspect(root, { kind: "working-tree" });
    await expect(
      service.withContext(context.id, { live: false }, async () => {
        writeFileSync(path.join(root, "untracked"), "changed");
        return "frozen manifest";
      })
    ).resolves.toBe("frozen manifest");
    await expect(
      service.withContext(context.id, { live: false }, async () => "next")
    ).rejects.toMatchObject({ code: "stale_review" });
  });
  it("rejects commit and branch contexts when uncommitted Git attributes change their diff", async () => {
    const { root, service } = fixture();
    writeFileSync(path.join(root, "file.txt"), "next\n");
    git(root, "commit", "-am", "next");
    git(root, "branch", "base", "HEAD~1");
    const branch = await service.inspect(root, { kind: "branch", base: "base" });
    const commit = await service.inspect(root, { kind: "commit", commit: "HEAD" });
    writeFileSync(path.join(root, ".gitattributes"), "file.txt binary\n");
    await expect(service.validate(branch.id)).rejects.toMatchObject({
      code: "stale_review"
    });
    await expect(service.validate(commit.id)).rejects.toMatchObject({
      code: "stale_review"
    });
  });
  it("keeps commit and branch contexts valid across working-tree edits", async () => {
    const { root, service } = fixture();
    writeFileSync(path.join(root, "file.txt"), "next\n");
    git(root, "commit", "-am", "next");
    git(root, "branch", "base", "HEAD~1");
    const branch = await service.inspect(root, { kind: "branch", base: "base" });
    const commit = await service.inspect(root, { kind: "commit", commit: "HEAD" });
    writeFileSync(path.join(root, "file.txt"), "uncommitted\n");
    writeFileSync(path.join(root, "untracked"), "new");
    expect((await service.validate(branch.id)).snapshotHash).toBe(branch.snapshotHash);
    expect((await service.validate(commit.id)).snapshotHash).toBe(commit.snapshotHash);
    git(root, "commit", "-qam", "moves HEAD");
    await expect(service.validate(branch.id)).rejects.toMatchObject({
      code: "stale_review"
    });
    expect((await service.validate(commit.id)).reviewTargetId).toBe(
      commit.reviewTargetId
    );
  });
});

type LoadedReviewState = Awaited<ReturnType<typeof loadExplicitReviewState>>;

function markAll(store: DifftrayStorage, loaded: LoadedReviewState) {
  for (const { state } of loaded.files) {
    store.markReviewed({
      projectId: loaded.reviewTarget.projectId,
      reviewTargetId: loaded.reviewTargetId,
      path: state.path,
      reviewedDiffHash: state.diffHash,
      ...reviewMarkLineageFields(loaded.reviewTarget, state.diff)
    });
  }
}

function fileState(loaded: LoadedReviewState, filePath: string) {
  return loaded.files.find(({ state }) => state.path === filePath)?.state;
}

async function registeredProject(
  root: string,
  store: DifftrayStorage,
  service: ReturnType<typeof createReviewContextService>
) {
  const context = await service.inspect(root, { kind: "working-tree" });
  const project = store.getProject(context.projectId);
  if (!project) throw new Error("project was not registered");
  return project;
}

function lines(values: readonly string[]): string {
  return `${values.join("\n")}\n`;
}

function commitFeatureBranch(root: string) {
  writeFileSync(
    path.join(root, "f.txt"),
    lines(["a", "b", "c", "d", "e", "f", "g", "h"])
  );
  writeFileSync(
    path.join(root, "h.txt"),
    lines(["1", "2", "3", "4", "5", "6", "7", "8"])
  );
  writeFileSync(path.join(root, "u.txt"), lines(["one"]));
  git(root, "add", ".");
  git(root, "commit", "-m", "base files");
  git(root, "checkout", "-b", "feat");
  writeFileSync(
    path.join(root, "f.txt"),
    lines(["a", "b", "c", "d", "e", "F", "g", "h"])
  );
  writeFileSync(
    path.join(root, "h.txt"),
    lines(["1", "2", "3", "4", "5", "6", "7", "eight"])
  );
  git(root, "commit", "-am", "feature edits");
}

describe("review progress across history rewrites", () => {
  it("keeps unchanged files reviewed after a rebase and flags changed ones", async () => {
    const { root, store, service } = fixture();
    commitFeatureBranch(root);
    const project = await registeredProject(root, store, service);
    const selector = { kind: "branch", base: "main" } as const;
    const first = await loadExplicitReviewState(store, project, selector, false);
    markAll(store, first);

    git(root, "checkout", "main");
    writeFileSync(path.join(root, "u.txt"), lines(["two"]));
    writeFileSync(
      path.join(root, "h.txt"),
      lines(["top", "1", "2", "3", "4", "5", "6", "7", "8"])
    );
    git(root, "commit", "-am", "upstream edits");
    git(root, "checkout", "feat");
    git(root, "rebase", "main");

    const rebased = await loadExplicitReviewState(store, project, selector, false);
    expect(rebased.reviewTargetId).not.toBe(first.reviewTargetId);
    expect(fileState(rebased, "f.txt")).toMatchObject({
      invalidated: false,
      reviewed: true
    });
    expect(fileState(rebased, "h.txt")).toMatchObject({
      invalidated: true,
      reviewed: false
    });
    expect(rebased.progress.reviewedVisibleFiles).toBe(1);
  });

  it("keeps a working-tree file reviewed after an unrelated commit", async () => {
    const { root, store, service } = fixture();
    writeFileSync(path.join(root, "file.txt"), "changed\n");
    writeFileSync(path.join(root, "other.txt"), "other\n");
    const project = await registeredProject(root, store, service);
    const selector = { kind: "working-tree" } as const;
    markAll(store, await loadExplicitReviewState(store, project, selector, false));

    git(root, "add", "other.txt");
    git(root, "commit", "-m", "other");

    const next = await loadExplicitReviewState(store, project, selector, false);
    expect(fileState(next, "file.txt")).toMatchObject({ reviewed: true });
  });

  it("treats a new edit after a committed review as unreviewed, not changed", async () => {
    const { root, store, service } = fixture();
    writeFileSync(path.join(root, "file.txt"), "reviewed edit\n");
    const project = await registeredProject(root, store, service);
    const selector = { kind: "working-tree" } as const;
    markAll(store, await loadExplicitReviewState(store, project, selector, false));

    git(root, "commit", "-qam", "commit the reviewed edit");
    const clean = await loadExplicitReviewState(store, project, selector, false);
    expect(fileState(clean, "file.txt")).toBeUndefined();

    git(root, "commit", "-q", "--allow-empty", "-m", "later work");
    writeFileSync(path.join(root, "file.txt"), "a new, unreviewed edit\n");

    const edited = await loadExplicitReviewState(store, project, selector, false);
    expect(fileState(edited, "file.txt")).toMatchObject({
      invalidated: false,
      reviewed: false
    });
  });

  it("does not carry review to another branch", async () => {
    const { root, store, service } = fixture();
    commitFeatureBranch(root);
    const project = await registeredProject(root, store, service);
    const selector = { kind: "branch", base: "main" } as const;
    markAll(store, await loadExplicitReviewState(store, project, selector, false));

    git(root, "checkout", "-b", "feat2", "feat");

    const other = await loadExplicitReviewState(store, project, selector, false);
    for (const filePath of ["f.txt", "h.txt"]) {
      expect(fileState(other, filePath)).toMatchObject({
        invalidated: false,
        reviewed: false
      });
    }
  });
});
