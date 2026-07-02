import { request, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";

import type { CompanionDeps } from "./api.js";
import { createCompanionServer } from "./server.js";

type StartedServer = {
  readonly baseUrl: string;
  readonly server: Awaited<ReturnType<typeof createCompanionServer>>;
};

const startedServers: StartedServer[] = [];

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
      serverPublicKey: ""
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

    const valid = await fetch(
      `${baseUrl}/companion/v1/projects/project-1/files/diff?path=src%2Fapp.ts`
    );
    expect(valid.status).toBe(200);
    await expect(valid.json()).resolves.toMatchObject({
      contentKind: "text",
      diffHash: "diff-hash"
    });

    const traversal = await fetch(
      `${baseUrl}/companion/v1/projects/project-1/files/diff?path=..%2Fsecret.txt`
    );
    const absolute = await fetch(
      `${baseUrl}/companion/v1/projects/project-1/files/diff?path=%2Fetc%2Fpasswd`
    );
    const outsideDiff = await fetch(
      `${baseUrl}/companion/v1/projects/project-1/files/diff?path=README.md`
    );

    expect(traversal.status).toBe(404);
    expect(absolute.status).toBe(404);
    expect(outsideDiff.status).toBe(404);
    expect(calls).toEqual(["src/app.ts"]);
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
      fetch(`${baseUrl}/companion/v1/projects/project-1/workspace`),
      fetch(`${baseUrl}/companion/v1/projects/project-1/comments`)
    ]);

    await waitFor(() => loadCount === 1);
    resolveWorkspace?.(testWorkspace("project-1"));
    const responses = await workspaceRequests;

    expect(loadCount).toBe(1);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
  });

  it("maps missing comments to not_found on delete", async () => {
    const { baseUrl } = await startServer({
      deleteComment: async () => false
    });

    const response = await fetch(`${baseUrl}/companion/v1/comments/comment-1`, {
      method: "DELETE"
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "not_found", protocolVersion: 1 }
    });
  });
});

async function startServer(
  overrides: Partial<CompanionDeps> = {}
): Promise<StartedServer> {
  const server = createCompanionServer({
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
      serverPublicKey: ""
    }),
    storage: {} as CompanionDeps["storage"],
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
