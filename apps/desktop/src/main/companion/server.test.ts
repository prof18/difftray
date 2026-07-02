import { request, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";

import {
  openEnvelope,
  sealEnvelope,
  type EncryptedEnvelope,
  type EnvelopeResponsePlain
} from "@difftray/companion-protocol";

import type { CompanionDeps } from "./api.js";
import { createCompanionEnvelopeVerifier } from "./auth.js";
import { createCompanionServer } from "./server.js";

type StartedServer = {
  readonly baseUrl: string;
  readonly server: Awaited<ReturnType<typeof createCompanionServer>>;
};

const startedServers: StartedServer[] = [];
const serverPublicKey = "B6N8vBQgk8i3VdwbEOhstCY3StFqqFPtC9_AsrhtHHw";
const serverSecretKey = "AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA";
const devicePublicKey = "VxR2nRFr92Q2rnS8eT0sMK0ZA8WaxSc4BcfiaYtBDDY";
const deviceSecretKey = "ZWZnaGlqa2xtbm9wcXJzdHV2d3h5ent8fX5_gIGCg4Q";
let requestCounter = 0;

afterEach(async () => {
  const servers = startedServers.splice(0);

  await Promise.all(servers.map(({ server }) => server.stop()));
});

describe("companion server core", () => {
  it("returns the server identity from the handshake endpoint", async () => {
    const { baseUrl } = await startServer();

    const response = await fetch(`${baseUrl}/companion/v1/handshake`);

    await expect(response.json()).resolves.toEqual({
      appVersion: "0.0.0-test",
      pairingOpen: false,
      protocolVersion: 1,
      serverId: "server-test",
      serverName: "Test Mac",
      serverPublicKey
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("x-difftray-protocol")).toBe("1");
  });

  it("maps unknown routes and malformed JSON to companion error bodies", async () => {
    const { baseUrl } = await startServer();

    const missing = await fetch(`${baseUrl}/companion/v1/nope`);
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({
      error: { code: "not_found", protocolVersion: 1 }
    });

    const malformed = await fetch(`${baseUrl}/companion/v1/pair`, {
      body: "{",
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toMatchObject({
      error: { code: "bad_request", protocolVersion: 1 }
    });
  });

  it("approves QR pair requests through the pairing route", async () => {
    const pairRequests: unknown[] = [];
    const { baseUrl } = await startServer({
      companionAuth: {
        approvePairRequest: () => ({ reason: "not_found", status: "rejected" }),
        cancelPairing: () => undefined,
        denyPairRequest: () => ({ status: "denied" }),
        getActivePairingSession: () => null,
        listPendingPairRequests: () => [],
        pairDevice: (requestBody) => {
          pairRequests.push(requestBody);

          return {
            deviceId: requestBody.deviceId,
            devicePublicKey: requestBody.devicePublicKey,
            status: "approved"
          };
        },
        startPairing: () => ({
          code: "123456",
          expiresAt: "2026-07-02T12:05:00.000Z",
          secret: "pairing-secret"
        })
      }
    });

    const plaintextResponse = await fetch(`${baseUrl}/companion/v1/pair`, {
      body: JSON.stringify({
        deviceId: "device-1",
        deviceName: "Marco's iPhone",
        devicePublicKey,
        platform: "ios",
        protocolVersion: 1,
        secret: "pairing-secret"
      }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    expect(plaintextResponse.status).toBe(401);

    const response = await boxedPairRequest({
      baseUrl,
      body: {
        deviceId: "device-1",
        deviceName: "Marco's iPhone",
        devicePublicKey,
        platform: "ios",
        protocolVersion: 1,
        secret: "pairing-secret"
      }
    });

    expect(response.wireStatus).toBe(200);
    expect(response.body).toEqual({
      serverId: "server-test",
      serverName: "Test Mac",
      status: "approved"
    });
    expect(pairRequests).toEqual([
      {
        deviceId: "device-1",
        deviceName: "Marco's iPhone",
        devicePublicKey,
        platform: "ios",
        protocolVersion: 1,
        secret: "pairing-secret"
      }
    ]);
  });

  it("rejects bad Host headers before routing", async () => {
    const { baseUrl } = await startServer();

    const evil = await rawRequest(`${baseUrl}/companion/v1/handshake`, {
      host: "evil.example:48620"
    });
    const unrelatedTailnet = await rawRequest(`${baseUrl}/companion/v1/handshake`, {
      host: "not-this-mac.tailnet.ts.net:48620"
    });

    expect(evil.status).toBe(403);
    expect(evil.body).toMatchObject({
      error: { code: "forbidden", protocolVersion: 1 }
    });
    expect(unrelatedTailnet.status).toBe(403);
    expect(unrelatedTailnet.body).toMatchObject({
      error: { code: "forbidden", protocolVersion: 1 }
    });
  });

  it("enforces URL length and body size caps", async () => {
    const { baseUrl } = await startServer();

    const longUrl = await fetch(`${baseUrl}/companion/v1/handshake?${"q".repeat(4097)}`);
    expect(longUrl.status).toBe(414);
    await expect(longUrl.json()).resolves.toMatchObject({
      error: { code: "bad_request", protocolVersion: 1 }
    });

    const oversizedBody = await fetch(`${baseUrl}/companion/v1/pair`, {
      body: JSON.stringify({ payload: "x".repeat(256 * 1024) }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    expect(oversizedBody.status).toBe(413);
    await expect(oversizedBody.json()).resolves.toMatchObject({
      error: { code: "bad_request", protocolVersion: 1 }
    });
  });

  it("rate limits repeated requests per remote address", async () => {
    const { baseUrl } = await startServer();
    const handshakeResponses = await sequentialRequests(31, () =>
      fetch(`${baseUrl}/companion/v1/handshake`)
    );
    const pairResponses = await sequentialRequests(11, () =>
      fetch(`${baseUrl}/companion/v1/pair`, {
        body: "{}",
        headers: { "content-type": "application/json" },
        method: "POST"
      })
    );

    expect(handshakeResponses.at(29)?.status).not.toBe(429);
    expect(handshakeResponses.at(30)?.status).toBe(429);
    expect(pairResponses.at(9)?.status).not.toBe(429);
    expect(pairResponses.at(10)?.status).toBe(429);
  });

  it("validates file diff paths against the current workspace before loading content", async () => {
    const calls: string[] = [];
    const { baseUrl } = await startServer({
      loadFileDiff: async (_projectId, path) => {
        calls.push(path);

        return {
          content: {
            additions: 1,
            deletions: 0,
            patch: "@@ -0,0 +1 @@\n+hello",
            path,
            status: "modified"
          },
          contentKind: "text",
          diffHash: "diff-hash"
        };
      }
    });

    const valid = await encryptedRequest({
      baseUrl,
      body: { path: "src/app.ts" },
      logicalMethod: "GET",
      path: "/companion/v1/projects/project-1/files/diff"
    });
    expect(valid.wireStatus).toBe(200);
    expect(valid.plain.status).toBe(200);
    expect(valid.plain.body).toMatchObject({
      contentKind: "text",
      diffHash: "diff-hash"
    });

    const traversal = await encryptedRequest({
      baseUrl,
      body: { path: "../secret.txt" },
      logicalMethod: "GET",
      path: "/companion/v1/projects/project-1/files/diff"
    });
    const absolute = await encryptedRequest({
      baseUrl,
      body: { path: "/etc/passwd" },
      logicalMethod: "GET",
      path: "/companion/v1/projects/project-1/files/diff"
    });
    const outsideDiff = await encryptedRequest({
      baseUrl,
      body: { path: "README.md" },
      logicalMethod: "GET",
      path: "/companion/v1/projects/project-1/files/diff"
    });

    expect(traversal.plain.status).toBe(404);
    expect(absolute.plain.status).toBe(404);
    expect(outsideDiff.plain.status).toBe(404);
    expect(calls).toEqual(["src/app.ts"]);
  });

  it("rejects plaintext access to authenticated routes", async () => {
    const { baseUrl } = await startServer();

    const response = await fetch(`${baseUrl}/companion/v1/projects`);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "unauthorized", protocolVersion: 1 }
    });
  });

  it("returns plaintext 401 for revoked devices on authenticated routes", async () => {
    const { baseUrl } = await startServer({
      companionEnvelope: createCompanionEnvelopeVerifier({
        now: () => new Date("2026-07-02T12:01:00.000Z"),
        storage: testCompanionStorage({ revoked: true })
      })
    });
    const response = await rawEncryptedRequest({
      baseUrl,
      logicalMethod: "GET",
      path: "/companion/v1/projects"
    });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      error: { code: "unauthorized", protocolVersion: 1 }
    });
  });

  it("coalesces concurrent workspace loads per project", async () => {
    let loadCount = 0;
    let resolveWorkspace:
      | ((workspace: Awaited<ReturnType<CompanionDeps["loadWorkspaceView"]>>) => void)
      | undefined;
    const workspacePromise = new Promise<
      Awaited<ReturnType<CompanionDeps["loadWorkspaceView"]>>
    >((resolve) => {
      resolveWorkspace = resolve;
    });
    const { baseUrl } = await startServer({
      loadWorkspaceView: async (projectId) => {
        loadCount += 1;

        return await workspacePromise.then((workspace) => ({
          ...workspace,
          project: { ...workspace.project, id: projectId }
        }));
      }
    });

    const workspaceRequests = Promise.all([
      encryptedRequest({
        baseUrl,
        logicalMethod: "GET",
        path: "/companion/v1/projects/project-1/workspace"
      }),
      encryptedRequest({
        baseUrl,
        logicalMethod: "GET",
        path: "/companion/v1/projects/project-1/comments"
      })
    ]);

    await waitFor(() => loadCount === 1);
    resolveWorkspace?.(testWorkspace("project-1"));
    const responses = await workspaceRequests;

    expect(loadCount).toBe(1);
    expect(responses.map((response) => response.plain.status)).toEqual([200, 200]);
  });

  it("maps missing comments to not_found on delete", async () => {
    const { baseUrl } = await startServer({
      deleteComment: async () => false
    });

    const response = await encryptedRequest({
      baseUrl,
      logicalMethod: "DELETE",
      path: "/companion/v1/comments/comment-1"
    });

    expect(response.wireStatus).toBe(404);
    expect(response.plain.body).toMatchObject({
      error: { code: "not_found", protocolVersion: 1 }
    });
  });
});

async function startServer(
  overrides: Partial<CompanionDeps> = {}
): Promise<StartedServer> {
  const server = createCompanionServer({
    companionAuth: {
      approvePairRequest: () => ({ reason: "not_found", status: "rejected" }),
      cancelPairing: () => undefined,
      denyPairRequest: () => ({ reason: "not_found", status: "rejected" }),
      getActivePairingSession: () => null,
      listPendingPairRequests: () => [],
      pairDevice: () => ({ reason: "pairing_expired", status: "rejected" }),
      startPairing: () => ({
        code: "000000",
        expiresAt: "2026-07-02T12:05:00.000Z",
        secret: "test-secret"
      })
    },
    companionEnvelope: createCompanionEnvelopeVerifier({
      now: () => new Date("2026-07-02T12:01:00.000Z"),
      storage: testCompanionStorage()
    }),
    commentsReport: async () => "",
    createComment: async () => {
      throw new Error("not implemented in test");
    },
    deleteComment: async () => false,
    listBranchRefs: async () => [],
    listRecentCommits: async () => [],
    listRecentProjects: () => [],
    loadFileDiff: async () => {
      throw new Error("unexpected loadFileDiff call");
    },
    loadWorkspaceView: async (projectId) => testWorkspace(projectId),
    markReviewed: async () => ({
      marked: true,
      workspaceSummary: {
        files: [],
        progress: { reviewedVisibleFiles: 0, totalVisibleReviewableFiles: 0 }
      }
    }),
    notifyDesktopRenderer: () => undefined,
    serverIdentity: () => ({
      appVersion: "0.0.0-test",
      serverId: "server-test",
      serverName: "Test Mac",
      serverPublicKey
    }),
    storage: testCompanionStorage(),
    unmarkReviewed: async () => ({
      unmarked: true,
      workspaceSummary: {
        files: [],
        progress: { reviewedVisibleFiles: 0, totalVisibleReviewableFiles: 0 }
      }
    }),
    updateComment: async () => null,
    updateDiffTarget: async () => {
      throw new Error("not implemented in test");
    },
    ...overrides
  });
  const { port } = await server.start(0);
  const address = (server as unknown as { readonly httpServer?: Server }).httpServer;
  expect(address).toBeUndefined();
  const started = { baseUrl: `http://127.0.0.1:${port}`, server };
  startedServers.push(started);

  return started;
}

function testWorkspace(
  projectId: string
): Awaited<ReturnType<CompanionDeps["loadWorkspaceView"]>> {
  return {
    comments: [],
    files: [
      {
        additions: 1,
        deletions: 0,
        diffHash: "diff-hash",
        diffLoaded: false,
        generated: false,
        invalidated: false,
        path: "src/app.ts",
        reviewable: true,
        reviewed: false,
        status: "modified",
        visible: true
      }
    ],
    progress: {
      reviewedVisibleFiles: 0,
      totalVisibleReviewableFiles: 1
    },
    project: {
      id: projectId,
      name: "Project",
      path: "/tmp/project"
    },
    reviewTarget: {
      headSha: "head-sha",
      id: "target-1",
      kind: "working_tree"
    }
  };
}

function testCompanionStorage(
  options: { readonly revoked?: boolean } = {}
): CompanionDeps["storage"] {
  return {
    findCompanionDeviceByPublicKey: (publicKey: string) =>
      publicKey === devicePublicKey
        ? {
            createdAt: "2026-07-02T12:00:00.000Z",
            id: "device-1",
            name: "Phone",
            platform: "ios",
            publicKey: devicePublicKey,
            ...(options.revoked ? { revokedAt: "2026-07-02T12:00:30.000Z" } : {})
          }
        : null,
    getCompanionServerKeyPair: () => ({
      publicKey: serverPublicKey,
      secretKey: serverSecretKey
    }),
    touchCompanionDeviceLastSeen: () => undefined,
    upsertCompanionServerKeyPair: () => undefined
  } as unknown as CompanionDeps["storage"];
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
  }

  throw new Error("Timed out waiting for condition");
}

async function sequentialRequests(
  count: number,
  requestFactory: () => Promise<Response>
): Promise<readonly Response[]> {
  const responses: Response[] = [];

  for (let index = 0; index < count; index += 1) {
    responses.push(await requestFactory());
  }

  return responses;
}

async function encryptedRequest(input: {
  readonly baseUrl: string;
  readonly body?: unknown;
  readonly logicalMethod: string;
  readonly path: string;
}): Promise<{
  readonly plain: EnvelopeResponsePlain;
  readonly wireStatus: number;
}> {
  requestCounter += 1;
  const requestId = `request-${requestCounter}`;
  const envelope = sealEnvelope({
    devicePublicKey,
    plaintext: {
      ...(input.body === undefined ? {} : { body: input.body }),
      method: input.logicalMethod,
      path: input.path,
      requestId,
      ts: "2026-07-02T12:00:00.000Z"
    },
    recipientPublicKey: serverPublicKey,
    senderSecretKey: deviceSecretKey
  });
  const response = await fetch(`${input.baseUrl}${input.path}`, {
    body: JSON.stringify(envelope),
    headers: { "content-type": "application/x-difftray-envelope" },
    method: "POST"
  });
  const responseBody = (await response.json()) as EncryptedEnvelope;
  const opened = openEnvelope({
    envelope: responseBody,
    expectedRequestId: requestId,
    recipientSecretKey: deviceSecretKey,
    senderPublicKey: serverPublicKey
  });

  if (!opened.ok) {
    throw new Error(`Failed to open companion response: ${opened.error}`);
  }

  return {
    plain: opened.value as EnvelopeResponsePlain,
    wireStatus: response.status
  };
}

async function rawEncryptedRequest(input: {
  readonly baseUrl: string;
  readonly body?: unknown;
  readonly logicalMethod: string;
  readonly path: string;
}): Promise<{ readonly body: unknown; readonly status: number }> {
  requestCounter += 1;
  const envelope = sealEnvelope({
    devicePublicKey,
    plaintext: {
      ...(input.body === undefined ? {} : { body: input.body }),
      method: input.logicalMethod,
      path: input.path,
      requestId: `request-${requestCounter}`,
      ts: "2026-07-02T12:00:00.000Z"
    },
    recipientPublicKey: serverPublicKey,
    senderSecretKey: deviceSecretKey
  });
  const response = await fetch(`${input.baseUrl}${input.path}`, {
    body: JSON.stringify(envelope),
    headers: { "content-type": "application/x-difftray-envelope" },
    method: "POST"
  });

  return {
    body: (await response.json()) as unknown,
    status: response.status
  };
}

async function boxedPairRequest(input: {
  readonly baseUrl: string;
  readonly body: unknown;
}): Promise<{
  readonly body: unknown;
  readonly wireStatus: number;
}> {
  const envelope = sealEnvelope({
    devicePublicKey,
    plaintext: input.body,
    recipientPublicKey: serverPublicKey,
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
    senderPublicKey: serverPublicKey
  });

  if (!opened.ok) {
    throw new Error(`Failed to open companion pair response: ${opened.error}`);
  }

  return {
    body: opened.value,
    wireStatus: response.status
  };
}

async function rawRequest(
  url: string,
  headers: Record<string, string>
): Promise<{ readonly body: unknown; readonly status: number }> {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const clientRequest = request(url, { headers }, (response) => {
      response.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });
      response.on("end", () => {
        resolve({
          body: JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown,
          status: response.statusCode ?? 0
        });
      });
    });

    clientRequest.on("error", reject);
    clientRequest.end();
  });
}
