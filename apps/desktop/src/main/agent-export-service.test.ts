import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createReviewNoteScopeId } from "@difftray/core";
import { openStorage } from "@difftray/storage";
import { expect, it } from "vitest";
import {
  createReviewContextService,
  loadExplicitFileDiff,
  loadExplicitReviewState
} from "./review-context-service.js";
import { reviewWorkspaceView } from "./project-workspace-view.js";
import { formatExplicitReviewReport } from "./review-feedback-service.js";
import { createAgentExportService } from "./agent-export-service.js";

it.each(["working-tree", "branch", "commit"] as const)(
  "exports byte-identical UI feedback for %s despite selected mode changes",
  async (kind) => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), "agent-export-")));
    const storage = openStorage(":memory:");
    const git = (...args: string[]) =>
      execFileSync("git", ["-C", root, ...args], { stdio: "ignore" });
    try {
      git("init", "-b", "main");
      git("config", "user.email", "test@example.com");
      git("config", "user.name", "Test");
      writeFileSync(path.join(root, "file.txt"), "old\nsecond\n");
      git("add", ".");
      git("commit", "-m", "initial");
      git("branch", "base");
      writeFileSync(path.join(root, "file.txt"), "new\nsecond changed\n");
      if (kind !== "working-tree") {
        git("add", ".");
        git("commit", "-m", "change");
      }
      const contexts = createReviewContextService(storage);
      const context = await contexts.inspect(
        root,
        kind === "branch"
          ? { kind, base: "base" }
          : kind === "commit"
            ? { kind, commit: "HEAD" }
            : { kind }
      );
      const file = context.files[0];
      if (!file) throw new Error("Missing fixture file");
      const common = {
        projectId: context.projectId,
        reviewTargetId: context.reviewTargetId,
        path: file.path,
        diffHash: file.diffHash
      };
      storage.createReviewComment({
        ...common,
        actor: { kind: "agent", name: "Reviewer", runId: "run" },
        side: "additions",
        lineStart: 1,
        lineEnd: 2,
        body: "Range α"
      });
      storage.createReviewComment({
        ...common,
        side: "deletions",
        lineStart: 1,
        lineEnd: 1,
        body: "Line β"
      });
      storage.createReviewFileComment({
        ...common,
        body: "File γ",
        actor: { kind: "agent", name: "Reviewer", runId: "run" }
      });
      storage.createReviewFileComment({
        ...common,
        diffHash: "stale",
        body: "Hidden stale"
      });
      storage.saveReviewNote({
        actor: { kind: "agent", name: "Reviewer", runId: "run" },
        projectId: context.projectId,
        scopeId: createReviewNoteScopeId(context.reviewTarget),
        body: "Overall δ"
      });
      const project = storage.getProject(context.projectId);
      if (!project) throw new Error("Missing fixture project");
      const state = await loadExplicitReviewState(
        storage,
        project,
        context.selector,
        context.showGeneratedFiles
      );
      const workspace = reviewWorkspaceView({
        ...state,
        project,
        comments: storage.listReviewComments(context.reviewTargetId),
        fileComments: storage.listReviewFileComments(context.reviewTargetId),
        reviewNote: storage.getReviewNote(createReviewNoteScopeId(context.reviewTarget))
      });
      const expected = await formatExplicitReviewReport(
        root,
        context.reviewTarget,
        workspace
      );
      storage.updateProjectDefaultDiffTarget(project.id, {
        mode: "commit",
        ref: "invalid-visible-selection"
      });
      const service = createAgentExportService(storage, { contexts });
      const result = await service.export({ contextId: context.id, format: "prompt" });
      expect(result).toMatchObject({
        format: "prompt",
        content: expected,
        metadata: {
          inactiveCount: 1,
          reviewedPathCount: 1,
          reviewedPathsTruncated: false
        }
      });
      expect(expected).toContain("> 1 new");
      expect(expected).toContain("Agent: Reviewer");
      expect(expected).toContain("Last edited by agent: Reviewer");
      expect(expected).not.toContain("Hidden stale");
      const json = await service.export({ contextId: context.id, format: "json" });
      expect(json.format === "json" && json.content.items).toHaveLength(4);
      storage.setReviewNoteDismissed(createReviewNoteScopeId(context.reviewTarget), true);
      const dismissed = await service.export({ contextId: context.id, format: "prompt" });
      expect(dismissed.content).not.toContain("Overall δ");
      const changing = createAgentExportService(storage, {
        contexts,
        loadFile: async (...args) => {
          const loaded = await loadExplicitFileDiff(...args);
          storage.createReviewFileComment({ ...common, body: "concurrent edit" });
          return loaded;
        }
      });
      await expect(
        changing.export({ contextId: context.id, format: "prompt" })
      ).rejects.toMatchObject({ code: "stale_feedback" });
      if (kind === "working-tree") {
        const changingCode = createAgentExportService(storage, {
          contexts,
          loadFile: async (...args) => {
            const loaded = await loadExplicitFileDiff(...args);
            writeFileSync(path.join(root, "file.txt"), "changed during export\n");
            return loaded;
          }
        });
        await expect(
          changingCode.export({ contextId: context.id, format: "prompt" })
        ).rejects.toMatchObject({ code: "stale_review" });
      }
    } finally {
      storage.close();
      rmSync(root, { recursive: true, force: true });
    }
  }
);
