import { execFile } from "node:child_process";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import {
  calculateProgress,
  createReviewTargetId,
  resolveReviewStates
} from "@difftray/core";
import {
  COMPANION_PROTOCOL_VERSION,
  openEnvelope,
  sealEnvelope,
  type EncryptedEnvelope,
  type EnvelopeResponsePlain
} from "@difftray/companion-protocol";
import { loadWorkingTreeDiffSummaries } from "@difftray/git";
import { openStorage, type DifftrayStorage, type ProjectRecord } from "@difftray/storage";
import { afterEach, describe, expect, it } from "vitest";

import type { CompanionDeps } from "./api.js";
import {
  createCompanionAuthManager,
  createCompanionEnvelopeVerifier,
  getOrCreateCompanionServerIdentity
} from "./auth.js";
import { createCompanionServer } from "./server.js";
import { reviewWorkspaceView } from "../project-workspace-view.js";
import { fileDiffFromGit, projectView, reviewTargetFromGit } from "../view-models.js";

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
  it("boots against temp SQLite and a fixture git repo", async () => {
    const { cleanup, deps, identity, pairSecret, project } =
      await createIntegrationHarness();
    const server = createCompanionServer(deps);

    try {
      const { port } = await server.start(0);
      const baseUrl = `http://127.0.0.1:${port}`;

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
      expect(workspace.plain.body).toMatchObject({
        workspace: {
          files: [
            expect.objectContaining({
              path: "tracked.txt",
              status: "modified"
            })
          ],
          project: expect.objectContaining({ id: project.id })
        }
      });
    } finally {
      await server.stop();
      cleanup();
    }
  });
});

async function createIntegrationHarness(): Promise<{
  readonly cleanup: () => void;
  readonly deps: CompanionDeps;
  readonly identity: ReturnType<typeof getOrCreateCompanionServerIdentity>;
  readonly pairSecret: string;
  readonly project: ProjectRecord;
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
  const deps: CompanionDeps = {
    companionAuth,
    companionEnvelope: createCompanionEnvelopeVerifier({ storage }),
    commentsReport: async () => "",
    createComment: async () => {
      throw new Error("createComment is outside the D6a skeleton");
    },
    deleteComment: async () => false,
    listBranchRefs: async () => [],
    listRecentCommits: async () => [],
    listRecentProjects: () =>
      storage.listRecentProjects().map((record) => projectView(record)),
    loadFileDiff: async () => {
      throw new Error("loadFileDiff is outside the D6a skeleton");
    },
    loadWorkspaceView: async (projectId) => loadWorkspaceView(storage, projectId),
    markReviewed: async () => {
      throw new Error("markReviewed is outside the D6a skeleton");
    },
    notifyDesktopRenderer: () => undefined,
    serverIdentity: () => identity,
    storage,
    unmarkReviewed: async () => {
      throw new Error("unmarkReviewed is outside the D6a skeleton");
    },
    updateComment: async () => null,
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
    project
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

async function createFixtureRepo(root: string): Promise<string> {
  const repo = path.join(root, "repo");
  await git(root, "init", "--initial-branch=main", "repo");
  await git(repo, "config", "user.email", "difftray@example.test");
  await git(repo, "config", "user.name", "Difftray Test");
  await writeFile(path.join(repo, "tracked.txt"), "initial\n");
  await git(repo, "add", "tracked.txt");
  await git(repo, "commit", "-m", "initial");
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
