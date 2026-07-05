import { execFile } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import {
  calculateProgress,
  createReviewTargetId,
  formatReviewCommentsReport,
  resolveReviewStates
} from "@difftray/core";
import {
  COMPANION_PROTOCOL_VERSION,
  openEnvelope,
  sealEnvelope,
  type EncryptedEnvelope,
  type EnvelopeResponsePlain
} from "@difftray/companion-protocol";
import { loadWorkingTreeDiffSummaries, loadWorkingTreeFileDiff } from "@difftray/git";
import { openStorage, type DifftrayStorage, type ProjectRecord } from "@difftray/storage";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";

import { createCompanionApi, type CompanionDeps } from "./api.js";
import {
  createCompanionAuthManager,
  createCompanionEnvelopeVerifier,
  getOrCreateCompanionServerIdentity
} from "./auth.js";
import { createCompanionServer } from "./server.js";
import { reviewWorkspaceView } from "../project-workspace-view.js";
import {
  commentReportContext,
  fileDiffFromGit,
  patchForDiff,
  projectView,
  reviewCommentView,
  reviewTargetFromGit,
  reviewTargetLabel,
  summarizePatch
} from "../view-models.js";

const execFileAsync = promisify(execFile);
const tempRoots: string[] = [];
const devicePublicKey = "VxR2nRFr92Q2rnS8eT0sMK0ZA8WaxSc4BcfiaYtBDDY";
const deviceSecretKey = "ZWZnaGlqa2xtbm9wcXJzdHV2d3h5ent8fX5_gIGCg4Q";
let requestCounter = 0;

afterEach(async () => {
  const roots = tempRoots.splice(0);

  await Promise.all(roots.map((root) => rm(root, { force: true, recursive: true })));
});

describe("companion server integration", () => {
  it("covers pairing, encrypted API operations, comments, report, and websocket mutation events", async () => {
    const { cleanup, deps, identity, pairSecret, project, setMutationListener } =
      await createIntegrationHarness();
    const server = createCompanionServer(deps);

    try {
      const { port } = await server.start(0);
      const baseUrl = `http://127.0.0.1:${port}`;
      setMutationListener((projectId, reason) => {
        server.broadcast({ kind: "workspace_changed", projectId, reason });
      });

      const handshake = await fetch(`${baseUrl}/companion/v1/handshake`);
      await expect(handshake.json()).resolves.toMatchObject({
        protocolVersion: COMPANION_PROTOCOL_VERSION,
        serverName: "Integration Mac",
        serverPublicKey: identity.serverPublicKey
      });

      const pairResponse = await boxedPairRequest({
        baseUrl,
        body: {
          deviceId: "device-1",
          deviceName: "Integration Phone",
          devicePublicKey,
          platform: "ios",
          protocolVersion: COMPANION_PROTOCOL_VERSION,
          secret: pairSecret
        },
        serverPublicKey: identity.serverPublicKey
      });
      expect(pairResponse.body).toMatchObject({ status: "approved" });

      const codePairing = deps.companionAuth.startPairing();
      const codePairResponse = await boxedPairRequest({
        baseUrl,
        body: {
          code: codePairing.code,
          deviceId: "device-1",
          deviceName: "Integration Phone",
          devicePublicKey,
          platform: "ios",
          protocolVersion: COMPANION_PROTOCOL_VERSION
        },
        serverPublicKey: identity.serverPublicKey
      });
      expect(codePairResponse.wireStatus).toBe(202);
      expect(codePairResponse.body).toMatchObject({ status: "pending" });
      const pairRequestId = readPairRequestId(codePairResponse.body);
      expect(deps.companionAuth.approvePairRequest(pairRequestId)).toMatchObject({
        status: "approved"
      });

      const projects = await encryptedRequest({
        baseUrl,
        logicalMethod: "GET",
        path: "/companion/v1/projects",
        serverPublicKey: identity.serverPublicKey
      });
      expect(projects.plain.status).toBe(200);
      expect(projects.plain.body).toMatchObject({
        projects: [expect.objectContaining({ id: project.id, name: project.name })]
      });

      const workspace = await encryptedRequest({
        baseUrl,
        logicalMethod: "GET",
        path: `/companion/v1/projects/${project.id}/workspace`,
        serverPublicKey: identity.serverPublicKey
      });
      expect(workspace.plain.status).toBe(200);
      const workspaceView = readWorkspace(workspace.plain.body);
      expect(workspaceView.project).toMatchObject({ id: project.id });
      expect(workspaceView.files).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: "binary.dat", status: "modified" }),
          expect.objectContaining({
            path: "renamed-new.txt",
            previousPath: "renamed-old.txt",
            status: "renamed"
          }),
          expect.objectContaining({ path: "tracked.txt", status: "modified" })
        ])
      );

      const binaryDiff = await encryptedRequest({
        baseUrl,
        body: { path: "binary.dat" },
        logicalMethod: "GET",
        path: `/companion/v1/projects/${project.id}/files/diff`,
        serverPublicKey: identity.serverPublicKey
      });
      expect(binaryDiff.plain.status).toBe(200);
      expect(binaryDiff.plain.body).toMatchObject({
        content: expect.objectContaining({ path: "binary.dat", status: "modified" }),
        contentKind: "binary"
      });

      const renamedFile = readWorkspaceFile(workspaceView, "renamed-new.txt");
      const renamedDiff = await encryptedRequest({
        baseUrl,
        body: { path: "renamed-new.txt" },
        logicalMethod: "GET",
        path: `/companion/v1/projects/${project.id}/files/diff`,
        serverPublicKey: identity.serverPublicKey
      });
      expect(renamedDiff.plain.status).toBe(200);
      expect(renamedDiff.plain.body).toMatchObject({
        content: expect.objectContaining({ path: "renamed-new.txt", status: "renamed" }),
        contentKind: "text",
        diffHash: renamedFile.diffHash
      });

      const trackedFile = readWorkspaceFile(workspaceView, "tracked.txt");
      const markResult = await encryptedRequest({
        baseUrl,
        body: {
          displayedDiffHash: trackedFile.diffHash,
          path: trackedFile.path,
          reviewTargetId: workspaceView.reviewTarget.id
        },
        logicalMethod: "POST",
        path: `/companion/v1/projects/${project.id}/reviews/mark`,
        serverPublicKey: identity.serverPublicKey
      });
      expect(markResult.plain.status).toBe(200);
      expect(markResult.plain.body).toMatchObject({
        marked: true,
        workspaceSummary: {
          files: expect.arrayContaining([
            expect.objectContaining({ path: "tracked.txt", reviewed: true })
          ])
        }
      });

      await writeFile(path.join(project.path, "tracked.txt"), "changed again\n");
      const staleMark = await encryptedRequest({
        baseUrl,
        body: {
          displayedDiffHash: trackedFile.diffHash,
          path: trackedFile.path,
          reviewTargetId: workspaceView.reviewTarget.id
        },
        logicalMethod: "POST",
        path: `/companion/v1/projects/${project.id}/reviews/mark`,
        serverPublicKey: identity.serverPublicKey
      });
      expect(staleMark.wireStatus).toBe(409);
      expect(staleMark.plain.status).toBe(409);
      expect(staleMark.plain.body).toMatchObject({
        error: { code: "stale_diff", protocolVersion: COMPANION_PROTOCOL_VERSION }
      });

      const socket = await authenticatedSocket(baseUrl, identity.serverPublicKey);
      const hello = await waitForSocketMessage(socket);
      expect(openServerEventEnvelope(hello, identity.serverPublicKey)).toMatchObject({
        kind: "hello",
        protocolVersion: COMPANION_PROTOCOL_VERSION
      });

      const reloadedWorkspace = await encryptedRequest({
        baseUrl,
        logicalMethod: "GET",
        path: `/companion/v1/projects/${project.id}/workspace`,
        serverPublicKey: identity.serverPublicKey
      });
      expect(reloadedWorkspace.plain.status).toBe(200);
      const workspaceAfterStale = readWorkspace(reloadedWorkspace.plain.body);
      const currentTrackedFile = readWorkspaceFile(workspaceAfterStale, "tracked.txt");
      const eventMessage = waitForSocketMessage(socket);
      const createComment = await encryptedRequest({
        baseUrl,
        body: {
          body: "Please revisit this line.",
          diffHash: currentTrackedFile.diffHash,
          lineEnd: 1,
          lineStart: 1,
          path: currentTrackedFile.path,
          reviewTargetId: workspaceAfterStale.reviewTarget.id,
          side: "additions"
        },
        logicalMethod: "POST",
        path: `/companion/v1/projects/${project.id}/comments`,
        serverPublicKey: identity.serverPublicKey
      });
      expect(createComment.plain.status).toBe(200);
      const comment = readComment(createComment.plain.body);
      expect(comment).toMatchObject({
        body: "Please revisit this line.",
        path: "tracked.txt",
        side: "additions"
      });

      const event = await eventMessage;
      expect(event).not.toContain("workspace_changed");
      expect(openServerEventEnvelope(event, identity.serverPublicKey)).toEqual({
        kind: "workspace_changed",
        projectId: project.id,
        reason: "comments"
      });

      const comments = await encryptedRequest({
        baseUrl,
        logicalMethod: "GET",
        path: `/companion/v1/projects/${project.id}/comments`,
        serverPublicKey: identity.serverPublicKey
      });
      expect(comments.plain.status).toBe(200);
      expect(comments.plain.body).toMatchObject({
        comments: [expect.objectContaining({ id: comment.id })]
      });

      const updateComment = await encryptedRequest({
        baseUrl,
        body: { body: "Updated integration comment." },
        logicalMethod: "PATCH",
        path: `/companion/v1/comments/${comment.id}`,
        serverPublicKey: identity.serverPublicKey
      });
      expect(updateComment.plain.status).toBe(200);
      expect(updateComment.plain.body).toMatchObject({
        comment: expect.objectContaining({
          body: "Updated integration comment.",
          id: comment.id
        })
      });

      const report = await encryptedRequest({
        baseUrl,
        logicalMethod: "GET",
        path: `/companion/v1/projects/${project.id}/comments/report`,
        serverPublicKey: identity.serverPublicKey
      });
      expect(report.plain.status).toBe(200);
      expect(report.plain.body).toMatchObject({
        report: expect.stringContaining("Updated integration comment.")
      });

      const deleteComment = await encryptedRequest({
        baseUrl,
        logicalMethod: "DELETE",
        path: `/companion/v1/comments/${comment.id}`,
        serverPublicKey: identity.serverPublicKey
      });
      expect(deleteComment.plain.status).toBe(200);
      expect(deleteComment.plain.body).toEqual({ deleted: true });

      socket.close();
    } finally {
      await server.stop();
      cleanup();
    }
  }, 15_000);

  it("rejects unauthenticated authenticated routes and guard violations", async () => {
    const { cleanup, deps, identity, pairSecret, project } =
      await createIntegrationHarness();
    const server = createCompanionServer(deps);

    try {
      const { port } = await server.start(0);
      const baseUrl = `http://127.0.0.1:${port}`;
      const pairResponse = await boxedPairRequest({
        baseUrl,
        body: {
          deviceId: "device-1",
          deviceName: "Integration Phone",
          devicePublicKey,
          platform: "ios",
          protocolVersion: COMPANION_PROTOCOL_VERSION,
          secret: pairSecret
        },
        serverPublicKey: identity.serverPublicKey
      });
      expect(pairResponse.body).toMatchObject({ status: "approved" });

      const routes = createCompanionApi(deps).filter((route) => route.requiresAuth);
      for (const route of routes) {
        const path = concreteRoutePath(route.path, project.id);
        const response = await fetch(`${baseUrl}${path}`, {
          body: JSON.stringify({}),
          headers: { "content-type": "application/json" },
          method: "POST"
        });
        expect({
          path: route.path,
          status: response.status
        }).toEqual({
          path: route.path,
          status: 401
        });

        const tampered = await fetch(`${baseUrl}${path}`, {
          body: JSON.stringify(
            tamperedRouteEnvelope({
              logicalMethod: route.method,
              path,
              serverPublicKey: identity.serverPublicKey
            })
          ),
          headers: { "content-type": "application/x-difftray-envelope" },
          method: "POST"
        });
        expect({
          path: route.path,
          status: tampered.status
        }).toEqual({
          path: route.path,
          status: 401
        });
      }

      const badHost = await httpGetWithHost(
        baseUrl,
        "/companion/v1/handshake",
        "evil.example.test"
      );
      expect(badHost.status).toBe(403);
      expect(badHost.body).toMatchObject({
        error: { code: "forbidden", protocolVersion: COMPANION_PROTOCOL_VERSION }
      });

      const traversal = await encryptedRequest({
        baseUrl,
        body: { path: "../tracked.txt" },
        logicalMethod: "GET",
        path: `/companion/v1/projects/${project.id}/files/diff`,
        serverPublicKey: identity.serverPublicKey
      });
      expect(traversal.wireStatus).toBe(404);
      expect(traversal.plain.body).toMatchObject({
        error: { code: "not_found", protocolVersion: COMPANION_PROTOCOL_VERSION }
      });

      const oversized = await fetch(`${baseUrl}/companion/v1/pair`, {
        body: JSON.stringify({ payload: "x".repeat(260 * 1024) }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      expect(oversized.status).toBe(413);
      await expect(oversized.json()).resolves.toMatchObject({
        error: { code: "bad_request", protocolVersion: COMPANION_PROTOCOL_VERSION }
      });

      const socket = new WebSocket(
        `${baseUrl.replace("http:", "ws:")}/companion/v1/events`
      );
      await waitForSocketOpen(socket);
      expect(await waitForSocketClose(socket)).toBe(1008);
    } finally {
      await server.stop();
      cleanup();
    }
  }, 10_000);
});

async function createIntegrationHarness(): Promise<{
  readonly cleanup: () => void;
  readonly deps: CompanionDeps;
  readonly identity: ReturnType<typeof getOrCreateCompanionServerIdentity>;
  readonly pairSecret: string;
  readonly project: ProjectRecord;
  readonly setMutationListener: (
    listener: (projectId: string, reason: "comments" | "review_state") => void
  ) => void;
}> {
  const root = await createTempRoot();
  const repo = await createFixtureRepo(root);
  const storagePath = path.join(root, "difftray.sqlite");
  const storage = openStorage(storagePath);
  const project = {
    id: "fixture-project",
    name: "Fixture Project",
    path: repo
  };

  storage.upsertProject(project);
  storage.appendProjectToTabOrder(project.id);

  const identity = getOrCreateCompanionServerIdentity({
    appVersion: "0.0.0-test",
    serverName: "Integration Mac",
    storage
  });
  const companionAuth = createCompanionAuthManager({ storage });
  const pairSecret = companionAuth.startPairing().secret;
  let mutationListener:
    | ((projectId: string, reason: "comments" | "review_state") => void)
    | undefined;
  const deps: CompanionDeps = {
    companionAuth,
    companionEnvelope: createCompanionEnvelopeVerifier({ storage }),
    commentsReport: async (projectId) => commentsReport(storage, projectId),
    createComment: async (input) => {
      const workspace = await loadWorkspaceView(storage, input.projectId);
      const file = workspace.files.find((candidate) => candidate.path === input.path);

      if (
        !file ||
        file.diffHash !== input.diffHash ||
        workspace.reviewTarget.id !== input.reviewTargetId
      ) {
        throw new Error(`Cannot create stale integration comment: ${input.path}`);
      }

      const comment = storage.createReviewComment({
        body: input.body.trim(),
        diffHash: input.diffHash,
        lineEnd: input.lineEnd,
        lineStart: input.lineStart,
        path: input.path,
        ...(file.previousPath ? { previousPath: file.previousPath } : {}),
        projectId: input.projectId,
        reviewTargetId: input.reviewTargetId,
        side: input.side
      });
      mutationListener?.(input.projectId, "comments");

      return reviewCommentView(comment);
    },
    deleteComment: async (commentId) => {
      const deleted = storage.deleteReviewComment(commentId);
      if (deleted) {
        mutationListener?.(project.id, "comments");
      }

      return deleted;
    },
    listBranchRefs: async () => [],
    listRecentCommits: async () => [],
    listRecentProjects: () =>
      storage.listRecentProjects().map((record) => projectView(record)),
    loadFileDiff: async (projectId, pathName) =>
      loadFileDiff(storage, projectId, pathName),
    loadWorkspaceView: async (projectId) => loadWorkspaceView(storage, projectId),
    markReviewed: async (input) => {
      const workspace = await loadWorkspaceView(storage, input.projectId);
      const file = workspace.files.find((candidate) => candidate.path === input.path);

      if (
        !file ||
        file.diffHash !== input.displayedDiffHash ||
        workspace.reviewTarget.id !== input.reviewTargetId
      ) {
        return { stale: true, workspace };
      }

      const result = storage.verifyAndMarkReviewed({
        currentDiffHash: file.diffHash,
        displayedDiffHash: input.displayedDiffHash,
        path: file.path,
        ...(file.previousPath ? { previousPath: file.previousPath } : {}),
        projectId: input.projectId,
        reviewTargetId: input.reviewTargetId
      });

      if (!result.marked) {
        return {
          stale: true,
          workspace: await loadWorkspaceView(storage, input.projectId)
        };
      }

      mutationListener?.(input.projectId, "review_state");

      return {
        marked: true,
        workspaceSummary: workspaceSummaryFromWorkspace(
          await loadWorkspaceView(storage, input.projectId)
        )
      };
    },
    notifyDesktopRenderer: () => undefined,
    serverIdentity: () => identity,
    storage,
    unmarkReviewed: async (input) => {
      const workspace = await loadWorkspaceView(storage, input.projectId);
      const file = workspace.files.find((candidate) => candidate.path === input.path);

      if (
        !file ||
        file.diffHash !== input.displayedDiffHash ||
        workspace.reviewTarget.id !== input.reviewTargetId
      ) {
        return { stale: true, workspace };
      }

      const result = storage.verifyAndUnmarkReviewed({
        currentDiffHash: file.diffHash,
        displayedDiffHash: input.displayedDiffHash,
        path: file.path,
        reviewTargetId: input.reviewTargetId
      });

      if (!result.unmarked) {
        return {
          stale: true,
          workspace: await loadWorkspaceView(storage, input.projectId)
        };
      }

      mutationListener?.(input.projectId, "review_state");

      return {
        unmarked: true,
        workspaceSummary: workspaceSummaryFromWorkspace(
          await loadWorkspaceView(storage, input.projectId)
        )
      };
    },
    updateComment: async (input) => {
      const comment = storage.updateReviewComment(input.commentId, input.body.trim());
      if (comment) {
        mutationListener?.(comment.projectId, "comments");
      }

      return comment ? reviewCommentView(comment) : null;
    },
    updateDiffTarget: async () => {
      throw new Error("updateDiffTarget is outside the D6a skeleton");
    }
  };

  return {
    cleanup: () => {
      storage.close();
    },
    deps,
    identity,
    pairSecret,
    project,
    setMutationListener: (listener) => {
      mutationListener = listener;
    }
  };
}

async function loadWorkspaceView(
  storage: DifftrayStorage,
  projectId: string
): ReturnType<CompanionDeps["loadWorkspaceView"]> {
  const project = storage.getProject(projectId);

  if (!project) {
    throw new Error(`Missing integration project: ${projectId}`);
  }

  const diffResult = await loadWorkingTreeDiffSummaries(project.path);
  const reviewTarget = {
    ...reviewTargetFromGit(diffResult.reviewTarget),
    projectId: project.id
  };

  if (reviewTarget.kind !== "working_tree") {
    throw new Error(`Unexpected integration review target: ${reviewTarget.kind}`);
  }

  const reviewTargetId = createReviewTargetId(reviewTarget);
  storage.upsertReviewTarget({
    headKind: "working_tree",
    ...(reviewTarget.headRefName ? { headRefName: reviewTarget.headRefName } : {}),
    headRefSha: reviewTarget.headSha,
    id: reviewTargetId,
    mode: "working_tree",
    projectId: reviewTarget.projectId
  });
  const diffs = diffResult.files.map((file) => fileDiffFromGit(file));
  const states = resolveReviewStates({
    diffs,
    marks: storage.listReviewMarks(reviewTargetId),
    reviewTarget,
    showGeneratedFiles: storage.getAppSettings().showGeneratedFiles
  });
  const files = states.map((state, index) => {
    const summary = diffResult.files[index];

    if (!summary) {
      throw new Error(`Missing integration diff summary: ${state.path}`);
    }

    return { state, summary };
  });

  return reviewWorkspaceView({
    comments: storage.listReviewComments(reviewTargetId),
    files,
    progress: calculateProgress(states),
    project,
    reviewTarget,
    reviewTargetId
  });
}

async function loadFileDiff(
  storage: DifftrayStorage,
  projectId: string,
  pathName: string
): ReturnType<CompanionDeps["loadFileDiff"]> {
  const project = storage.getProject(projectId);

  if (!project) {
    throw new Error(`Missing integration project: ${projectId}`);
  }

  const workspace = await loadWorkspaceView(storage, projectId);
  const file = workspace.files.find((candidate) => candidate.path === pathName);

  if (!file) {
    throw new Error(`Missing integration file: ${pathName}`);
  }

  const gitDiff = await loadWorkingTreeFileDiff(project.path, pathName);

  if (!gitDiff) {
    throw new Error(`Missing integration git diff: ${pathName}`);
  }

  const diff = fileDiffFromGit(gitDiff);
  const patch = patchForDiff(diff);
  const summary = summarizePatch(patch);
  const textContent = diff.content.kind === "text" ? diff.content : undefined;

  return {
    content: {
      additions: summary.additions,
      deletions: summary.deletions,
      ...(textContent?.newText !== undefined ? { newText: textContent.newText } : {}),
      ...(textContent?.oldText !== undefined ? { oldText: textContent.oldText } : {}),
      patch,
      path: diff.newPath,
      status: diff.status
    },
    contentKind: diff.content.kind,
    diffHash: file.diffHash
  };
}

async function commentsReport(
  storage: DifftrayStorage,
  projectId: string
): Promise<string> {
  const workspace = await loadWorkspaceView(storage, projectId);
  const comments = await Promise.all(
    workspace.comments.map(async (comment) => {
      const diff = await loadFileDiff(storage, projectId, comment.path);
      const context = commentReportContext(comment, diff.content);

      return {
        body: comment.body,
        ...(context ? { context } : {}),
        lineEnd: comment.lineEnd,
        lineStart: comment.lineStart,
        path: comment.path,
        side: comment.side
      };
    })
  );

  return formatReviewCommentsReport({
    comments,
    projectName: workspace.project.name,
    targetLabel: reviewTargetLabel(workspace.reviewTarget)
  });
}

function workspaceSummaryFromWorkspace(
  workspace: Awaited<ReturnType<CompanionDeps["loadWorkspaceView"]>>
) {
  return {
    files: workspace.files.map((file) => ({
      invalidated: file.invalidated,
      path: file.path,
      reviewed: file.reviewed
    })),
    progress: workspace.progress
  };
}

async function createFixtureRepo(root: string): Promise<string> {
  const repo = path.join(root, "repo");
  await git(root, "init", "--initial-branch=main", "repo");
  await git(repo, "config", "user.email", "difftray@example.test");
  await git(repo, "config", "user.name", "Difftray Test");
  await mkdir(path.join(repo, "nested"));
  await writeFile(path.join(repo, "binary.dat"), Buffer.from([0, 1, 2, 3]));
  await writeFile(path.join(repo, "renamed-old.txt"), "before rename\n");
  await writeFile(path.join(repo, "tracked.txt"), "initial\n");
  await git(repo, "add", "binary.dat", "renamed-old.txt", "tracked.txt");
  await git(repo, "commit", "-m", "initial");
  await writeFile(path.join(repo, "binary.dat"), Buffer.from([0, 1, 2, 3, 4]));
  await git(repo, "mv", "renamed-old.txt", "renamed-new.txt");
  await writeFile(path.join(repo, "tracked.txt"), "changed\n");

  return repo;
}

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "difftray-companion-integration-"));
  const realRoot = await realpath(root);
  tempRoots.push(realRoot);

  return realRoot;
}

async function git(cwd: string, ...args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd });
}

function readWorkspace(
  body: unknown
): Awaited<ReturnType<CompanionDeps["loadWorkspaceView"]>> {
  const workspace = (body as { readonly workspace?: unknown }).workspace;

  if (!workspace || typeof workspace !== "object") {
    throw new Error(`Missing integration workspace: ${JSON.stringify(body)}`);
  }

  return workspace as Awaited<ReturnType<CompanionDeps["loadWorkspaceView"]>>;
}

function readWorkspaceFile(
  workspace: Awaited<ReturnType<CompanionDeps["loadWorkspaceView"]>>,
  pathName: string
) {
  const file = workspace.files.find((candidate) => candidate.path === pathName);

  if (!file) {
    throw new Error(`Missing integration workspace file: ${pathName}`);
  }

  return file;
}

function readComment(body: unknown) {
  const comment = (body as { readonly comment?: unknown }).comment;

  if (!comment || typeof comment !== "object") {
    throw new Error(`Missing integration comment: ${JSON.stringify(body)}`);
  }

  return comment as Awaited<ReturnType<CompanionDeps["createComment"]>>;
}

function readPairRequestId(body: unknown): string {
  const pairRequestId = (body as { readonly pairRequestId?: unknown }).pairRequestId;

  if (typeof pairRequestId !== "string") {
    throw new Error(`Missing integration pair request id: ${JSON.stringify(body)}`);
  }

  return pairRequestId;
}

function concreteRoutePath(routePath: string, projectId: string): string {
  return routePath.replace(":projectId", projectId).replace(":commentId", "comment-1");
}

function tamperedRouteEnvelope(input: {
  readonly logicalMethod: string;
  readonly path: string;
  readonly serverPublicKey: string;
}): EncryptedEnvelope {
  requestCounter += 1;
  const envelope = sealEnvelope({
    devicePublicKey,
    plaintext: {
      method: input.logicalMethod,
      path: input.path,
      requestId: `integration-tampered-${requestCounter}`,
      ts: new Date().toISOString()
    },
    recipientPublicKey: input.serverPublicKey,
    senderSecretKey: deviceSecretKey
  });

  return { ...envelope, box: replaceFirstBase64UrlChar(envelope.box) };
}

function replaceFirstBase64UrlChar(value: string): string {
  const replacement = value.startsWith("A") ? "B" : "A";

  return `${replacement}${value.slice(1)}`;
}

function httpGetWithHost(
  baseUrl: string,
  pathname: string,
  host: string
): Promise<{ readonly body: unknown; readonly status: number }> {
  const url = new URL(baseUrl);

  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        headers: { host },
        hostname: url.hostname,
        method: "GET",
        path: pathname,
        port: url.port
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
        });
        response.on("end", () => {
          const rawBody = Buffer.concat(chunks).toString("utf8");
          resolve({
            body: rawBody ? (JSON.parse(rawBody) as unknown) : null,
            status: response.statusCode ?? 0
          });
        });
      }
    );
    request.on("error", reject);
    request.end();
  });
}

async function boxedPairRequest(input: {
  readonly baseUrl: string;
  readonly body: unknown;
  readonly serverPublicKey: string;
}): Promise<{
  readonly body: unknown;
  readonly wireStatus: number;
}> {
  const envelope = sealEnvelope({
    devicePublicKey,
    plaintext: input.body,
    recipientPublicKey: input.serverPublicKey,
    senderSecretKey: deviceSecretKey
  });
  const response = await fetch(`${input.baseUrl}/companion/v1/pair`, {
    body: JSON.stringify(envelope),
    headers: { "content-type": "application/x-difftray-envelope" },
    method: "POST"
  });
  const responseBody = (await response.json()) as EncryptedEnvelope;
  const opened = openEnvelope({
    envelope: responseBody,
    recipientSecretKey: deviceSecretKey,
    senderPublicKey: input.serverPublicKey
  });

  if (!opened.ok) {
    throw new Error(`Failed to open integration pair response: ${opened.error}`);
  }

  return {
    body: opened.value,
    wireStatus: response.status
  };
}

async function encryptedRequest(input: {
  readonly baseUrl: string;
  readonly body?: unknown;
  readonly logicalMethod: string;
  readonly path: string;
  readonly serverPublicKey: string;
}): Promise<{
  readonly plain: EnvelopeResponsePlain;
  readonly wireStatus: number;
}> {
  requestCounter += 1;
  const requestId = `integration-request-${requestCounter}`;
  const envelope = sealEnvelope({
    devicePublicKey,
    plaintext: {
      ...(input.body === undefined ? {} : { body: input.body }),
      method: input.logicalMethod,
      path: input.path,
      requestId,
      ts: new Date().toISOString()
    },
    recipientPublicKey: input.serverPublicKey,
    senderSecretKey: deviceSecretKey
  });
  const response = await fetch(`${input.baseUrl}${input.path}`, {
    body: JSON.stringify(envelope),
    headers: { "content-type": "application/x-difftray-envelope" },
    method: "POST"
  });
  const responseBody = (await response.json()) as unknown;
  const opened = openEnvelope({
    envelope: responseBody as EncryptedEnvelope,
    expectedRequestId: requestId,
    recipientSecretKey: deviceSecretKey,
    senderPublicKey: input.serverPublicKey
  });

  if (!opened.ok) {
    throw new Error(
      `Failed to open integration response (${response.status}): ${opened.error}; ${JSON.stringify(responseBody)}`
    );
  }

  return {
    plain: opened.value as EnvelopeResponsePlain,
    wireStatus: response.status
  };
}

async function authenticatedSocket(
  baseUrl: string,
  serverPublicKey: string
): Promise<WebSocket> {
  const socket = new WebSocket(`${baseUrl.replace("http:", "ws:")}/companion/v1/events`);
  await waitForSocketOpen(socket);
  socket.send(
    JSON.stringify(
      sealEnvelope({
        devicePublicKey,
        plaintext: {
          kind: "auth",
          ts: new Date().toISOString()
        },
        recipientPublicKey: serverPublicKey,
        senderSecretKey: deviceSecretKey
      })
    )
  );

  return socket;
}

function openServerEventEnvelope(data: string, serverPublicKey: string): unknown {
  const opened = openEnvelope({
    envelope: JSON.parse(data) as EncryptedEnvelope,
    recipientSecretKey: deviceSecretKey,
    senderPublicKey: serverPublicKey
  });

  if (!opened.ok) {
    throw new Error(`Failed to open integration websocket event: ${opened.error}`);
  }

  return opened.value;
}

async function waitForSocketOpen(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.OPEN) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
}

async function waitForSocketClose(socket: WebSocket): Promise<number> {
  return await withTimeout(
    new Promise<number>((resolve) => {
      socket.once("close", (code) => {
        resolve(code);
      });
    }),
    "Timed out waiting for websocket close"
  );
}

async function waitForSocketMessage(socket: WebSocket): Promise<string> {
  return await withTimeout(
    new Promise<string>((resolve, reject) => {
      socket.once("close", (code) => {
        reject(new Error(`WebSocket closed before message: ${code}`));
      });
      socket.once("message", (data) => {
        resolve(data.toString("utf8"));
      });
    }),
    "Timed out waiting for websocket message"
  );
}

async function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(message));
    }, 6_000);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}
