import { describe, expect, it } from "vitest";
import { openStorage } from "@difftray/storage";
import { createAgentReviewService } from "./agent-review-service.js";
import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Real Git fixtures with repeated context validation exceed the 5s default under full-suite load.
describe("agent review reads", { timeout: 20_000 }, () => {
  it("distinguishes oversized text from actual binary content", async () => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), "difftray-large-read-")));
    const storage = openStorage(":memory:");
    const git = (...args: string[]) =>
      execFileSync("git", ["-C", root, ...args], { stdio: "ignore" });
    try {
      git("init", "-b", "main");
      git("config", "user.email", "test@example.com");
      git("config", "user.name", "Test");
      writeFileSync(path.join(root, "large.txt"), "before\n");
      writeFileSync(path.join(root, "binary.bin"), Buffer.from([0, 1]));
      git("add", ".");
      git("commit", "-m", "initial");
      writeFileSync(path.join(root, "large.txt"), "long text line\n".repeat(160000));
      writeFileSync(path.join(root, "binary.bin"), Buffer.from([0, 2]));
      const service = createAgentReviewService(storage);
      const context = await service.inspect({
        repoPath: root,
        selector: { kind: "working-tree" }
      });
      expect(
        (await service.file({ contextId: context.contextId, path: "large.txt" })).content
      ).toEqual({ kind: "oversized", reason: "patch_too_large" });
      expect(
        (await service.file({ contextId: context.contextId, path: "binary.bin" })).content
          .kind
      ).toBe("binary");
    } finally {
      storage.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("pages fixed manifests, rejects foreign cursors, and uses summary identities for text reads", async () => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), "difftray-reads-")));
    const storage = openStorage(":memory:");
    const git = (...args: string[]) =>
      execFileSync("git", ["-C", root, ...args], { stdio: "ignore" });
    try {
      git("init", "-b", "main");
      git("config", "user.email", "test@example.com");
      git("config", "user.name", "Test");
      writeFileSync(path.join(root, "a.txt"), "before\n");
      git("add", ".");
      git("commit", "-m", "initial");
      const service = createAgentReviewService(storage);
      const empty = await service.inspect({
        repoPath: root,
        selector: { kind: "selected" }
      });
      expect(empty.fileCount).toBe(0);
      expect(await service.feedback({ contextId: empty.contextId })).toMatchObject({
        items: [],
        total: 0,
        note: null,
        inactiveCount: 0
      });
      writeFileSync(path.join(root, "a.txt"), "after\n");
      writeFileSync(path.join(root, "b.txt"), "new\n");
      const inspected = await service.inspect({
        repoPath: root,
        selector: { kind: "working-tree" }
      });
      const first = await service.files({ contextId: inspected.contextId, limit: 1 });
      expect(first.files.map((f) => f.path)).toEqual(["a.txt"]);
      expect(first.total).toBe(2);
      expect(
        (
          await service.files({
            contextId: inspected.contextId,
            cursor: first.nextCursor ?? "missing",
            limit: 1
          })
        ).files.map((f) => f.path)
      ).toEqual(["b.txt"]);
      const other = await service.inspect({
        repoPath: root,
        selector: { kind: "working-tree" }
      });
      await expect(
        service.files({
          contextId: other.contextId,
          cursor: first.nextCursor ?? "missing"
        })
      ).rejects.toMatchObject({ code: "invalid_request" });
      await expect(
        service.files({ contextId: inspected.contextId, cursor: "broken" })
      ).rejects.toMatchObject({ code: "invalid_request" });
      const file = await service.file({ contextId: inspected.contextId, path: "a.txt" });
      expect(file.diffHash).toBe(first.files[0]?.diffHash ?? "missing");
      expect(file.renderDiffHash).not.toBe(file.diffHash);
      expect(file.content).toMatchObject({
        kind: "text",
        oldText: "before\n",
        newText: "after\n"
      });
      expect(file.selectableRanges.additions).toEqual([{ start: 1, end: 1 }]);
      const comment = storage.createReviewFileComment({
        projectId: inspected.projectId,
        reviewTargetId: inspected.targetId,
        path: "a.txt",
        diffHash: file.diffHash,
        body: "Check café"
      });
      storage.createReviewFileComment({
        projectId: inspected.projectId,
        reviewTargetId: inspected.targetId,
        path: "b.txt",
        diffHash: first.files[0]?.diffHash ?? "missing",
        body: "obsolete"
      });
      storage.createReviewFileComment({
        projectId: inspected.projectId,
        reviewTargetId: inspected.targetId,
        path: "a.txt",
        diffHash: file.diffHash,
        body: "Second"
      });
      const feedback = await service.feedback({
        contextId: inspected.contextId,
        limit: 1
      });
      expect(feedback).toMatchObject({ total: 2, inactiveCount: 1 });
      expect(feedback.items[0]).toMatchObject({
        active: true,
        reviewTargetId: inspected.targetId
      });
      await expect(
        service.feedback({
          contextId: inspected.contextId,
          cursor: feedback.nextCursor ?? "missing",
          includeInactive: true
        })
      ).rejects.toMatchObject({ code: "invalid_request" });
      storage.updateReviewFileComment(comment.id, "Edited");
      await expect(
        service.feedback({
          contextId: inspected.contextId,
          cursor: feedback.nextCursor ?? "missing"
        })
      ).rejects.toMatchObject({ code: "stale_feedback" });
      const restarted = await service.feedback({
        contextId: inspected.contextId,
        includeInactive: true
      });
      expect(restarted.items.find((item) => item.body === "obsolete")).toMatchObject({
        active: false,
        inactiveReason: "diff_changed"
      });
      for (const invalid of ["../a.txt", "/a.txt", "missing.txt"])
        await expect(
          service.file({ contextId: inspected.contextId, path: invalid })
        ).rejects.toMatchObject({ code: "invalid_request" });
      writeFileSync(path.join(root, "a.txt"), "changed again\n");
      await expect(
        service.file({ contextId: inspected.contextId, path: "a.txt" })
      ).rejects.toMatchObject({ code: "stale_review" });
    } finally {
      storage.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("rejects unknown contexts without returning a partial page", async () => {
    const storage = openStorage(":memory:");
    try {
      const service = createAgentReviewService(storage);
      await expect(service.files({ contextId: "ctx_missing" })).rejects.toMatchObject({
        code: "context_missing"
      });
      await expect(service.feedback({ contextId: "ctx_missing" })).rejects.toMatchObject({
        code: "context_missing"
      });
    } finally {
      storage.close();
    }
  });
});
