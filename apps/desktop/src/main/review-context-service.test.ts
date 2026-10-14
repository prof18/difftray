import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openStorage, type DifftrayStorage } from "@difftray/storage";
import { createReviewContextService } from "./review-context-service.js";

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
