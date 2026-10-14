import { expect, it, vi } from "vitest";
import { openStorage, type DifftrayStorage } from "@difftray/storage";
import { createReviewContextService } from "./review-context-service.js";
import { createAgentReviewService } from "./agent-review-service.js";
import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createAgentFeedbackService } from "./agent-feedback-service.js";
import {
  AgentProtocolError,
  type AgentReviewContext,
  type FeedbackSubmission
} from "../shared/agent-protocol.js";

const context: AgentReviewContext = {
  id: "ctx_" + "a".repeat(32),
  projectId: "project",
  canonicalWorktreePath: "/repo",
  gitDir: "/repo/.git",
  commonGitDir: "/repo/.git",
  repositoryIdentity: "identity",
  selector: { kind: "working-tree" },
  reviewTarget: { kind: "working_tree", projectId: "project", headSha: "head" },
  reviewTargetId: "target",
  snapshotHash: "snapshot",
  showGeneratedFiles: true,
  files: [
    {
      path: "renamed",
      previousPath: "old",
      diffHash: "hash",
      kind: "text",
      visible: true
    },
    { path: "binary", diffHash: "binaryhash", kind: "binary", visible: true }
  ],
  createdAt: 0,
  expiresAt: 100
};
const submission: FeedbackSubmission = {
  actor: { name: "Codex", runId: "run" },
  requestId: "request",
  items: [
    {
      kind: "line",
      path: "renamed",
      previousPath: "old",
      diffHash: "hash",
      side: "deletions",
      lineStart: 1,
      lineEnd: 2,
      body: "Deleted range"
    },
    {
      kind: "line",
      path: "renamed",
      previousPath: "old",
      diffHash: "hash",
      side: "additions",
      lineStart: 1,
      lineEnd: 1,
      body: "Single line"
    },
    { kind: "file", path: "binary", diffHash: "binaryhash", body: "Binary finding" },
    { kind: "overall", expectedNoteVersion: "absent", body: "Overall" }
  ]
};
function fixture() {
  const events: string[] = [];
  const lookup = vi.fn(
    (key: Parameters<DifftrayStorage["findAgentFeedbackReceipt"]>[0]) => {
      expect(key.actor.kind).toBe("agent");
      return null as ReturnType<DifftrayStorage["findAgentFeedbackReceipt"]>;
    }
  );
  const apply = vi.fn(
    (batch: Parameters<DifftrayStorage["applyAgentFeedbackBatch"]>[0]) => {
      expect(batch.items.length).toBeGreaterThan(0);
      events.push("write");
      return {
        requestId: "request",
        deduplicated: false,
        itemIds: ["id"],
        noteVersion: "new"
      };
    }
  );
  const storage = {
    findAgentFeedbackReceipt: lookup,
    applyAgentFeedbackBatch: apply
  } as unknown as DifftrayStorage;
  const contexts = {
    withContext: vi.fn(
      async <T>(
        _id: string,
        _options: { readonly live: boolean },
        read: (c: AgentReviewContext) => Promise<T>
      ) => {
        events.push("before");
        const result = await read(context);
        events.push("after");
        return result;
      }
    )
  };
  const reads = {
    file: vi.fn(() =>
      Promise.resolve({
        path: "renamed",
        diffHash: "hash",
        content: { kind: "text" as const, patch: "patch" },
        selectableRanges: {
          additions: [{ start: 1, end: 3 }],
          deletions: [{ start: 1, end: 2 }]
        }
      })
    )
  };
  const onCommitted = vi.fn();
  return {
    storage,
    contexts,
    reads,
    onCommitted,
    lookup,
    apply,
    events,
    service: createAgentFeedbackService(storage, {
      contexts: contexts as unknown as Pick<
        ReturnType<typeof createReviewContextService>,
        "withContext"
      >,
      reads,
      onCommitted
    })
  };
}

it("validates all scopes and writes only after final context validation", async () => {
  const f = fixture();
  await f.service.submit({ contextId: context.id, submission });
  expect(f.events).toEqual(["before", "after", "write"]);
  expect(f.reads.file).toHaveBeenCalledTimes(1);
  expect(f.apply.mock.calls[0]?.[0]).toMatchObject({
    actor: { kind: "agent", name: "Codex" },
    projectId: "project",
    reviewTargetId: "target",
    items: submission.items
  });
  expect(f.onCommitted).toHaveBeenCalledOnce();
});
it("rejects unavailable anchors, mismatched rename paths and hashes without any write", async () => {
  for (const change of [
    { lineEnd: 4 },
    { previousPath: "incorrect" },
    { diffHash: "renderhash" },
    { path: "binary", previousPath: "old", diffHash: "binaryhash" }
  ]) {
    const f = fixture();
    f.reads.file.mockResolvedValue({
      path: "renamed",
      diffHash: "hash",
      content: { kind: "text", patch: "patch" },
      selectableRanges: { additions: [], deletions: [{ start: 1, end: 2 }] }
    });
    const item = submission.items[0];
    if (!item || item.kind !== "line") throw new Error("Missing line fixture");
    await expect(
      f.service.submit({
        contextId: context.id,
        submission: { ...submission, items: [{ ...item, ...change }] }
      })
    ).rejects.toBeInstanceOf(AgentProtocolError);
    expect(f.apply).not.toHaveBeenCalled();
  }
});
it("rechecks receipts after concurrent success during failed freshness validation", async () => {
  const f = fixture();
  const receipt = {
    requestId: "request",
    deduplicated: true,
    itemIds: ["original"],
    noteVersion: "note"
  };
  f.lookup.mockReturnValueOnce(null).mockReturnValueOnce(receipt);
  f.contexts.withContext.mockRejectedValue(
    new AgentProtocolError("context_expired", "Expired")
  );
  expect(await f.service.submit({ contextId: context.id, submission })).toEqual(receipt);
  expect(f.apply).not.toHaveBeenCalled();
  expect(f.onCommitted).not.toHaveBeenCalled();
});
it("preserves stale validation errors without a matching receipt", async () => {
  const f = fixture();
  f.contexts.withContext.mockRejectedValue(
    new AgentProtocolError("stale_review", "Changed")
  );
  await expect(
    f.service.submit({ contextId: context.id, submission })
  ).rejects.toMatchObject({ code: "stale_review" });
  expect(f.lookup).toHaveBeenCalledTimes(2);
  expect(f.apply).not.toHaveBeenCalled();
});
it("does not write when the final validation fails after anchor loading", async () => {
  const f = fixture();
  f.contexts.withContext.mockImplementation(async (_id, _options, read) => {
    await read(context);
    throw new AgentProtocolError("stale_review", "Changed after anchor loading");
  });
  await expect(
    f.service.submit({ contextId: context.id, submission })
  ).rejects.toMatchObject({ code: "stale_review" });
  expect(f.reads.file).toHaveBeenCalledOnce();
  expect(f.apply).not.toHaveBeenCalled();
  expect(f.onCommitted).not.toHaveBeenCalled();
});
it("does not notify when the transaction recovers a concurrently committed receipt", async () => {
  const f = fixture();
  f.apply.mockReturnValue({
    requestId: "request",
    deduplicated: true,
    itemIds: ["existing"],
    noteVersion: "note"
  });
  expect(await f.service.submit({ contextId: context.id, submission })).toMatchObject({
    deduplicated: true,
    itemIds: ["existing"]
  });
  expect(f.onCommitted).not.toHaveBeenCalled();
});
it("hashes ordered original context and actor, independent of JSON key ordering", async () => {
  const f = fixture();
  await f.service.submit({ contextId: context.id, submission });
  await f.service.submit({
    contextId: context.id,
    submission: { ...submission, actor: { runId: "run", name: "Codex" } }
  });
  expect(f.lookup.mock.calls[0]?.[0]).toEqual(f.lookup.mock.calls[1]?.[0]);
  await f.service.submit({
    contextId: context.id,
    submission: { ...submission, actor: { ...submission.actor, runId: "other" } }
  });
  expect(f.lookup.mock.calls[2]?.[0]).not.toEqual(f.lookup.mock.calls[0]?.[0]);
});

it("returns committed receipts before touching a missing context", async () => {
  const receipt = {
    requestId: "request",
    deduplicated: true,
    itemIds: ["original"],
    noteVersion: "note"
  };
  const lookup = vi.fn(() => receipt);
  const contexts = {
    withContext: vi.fn(() => {
      throw new Error("must not load");
    })
  };
  const notify = vi.fn();
  const storage = { findAgentFeedbackReceipt: lookup } as unknown as DifftrayStorage;
  const service = createAgentFeedbackService(storage, { contexts, onCommitted: notify });
  expect(
    await service.submit({
      contextId: "ctx_" + "a".repeat(32),
      submission: {
        actor: { name: "Codex", runId: "run" },
        requestId: "request",
        items: [{ kind: "overall", body: "Note", expectedNoteVersion: "old" }]
      }
    })
  ).toEqual(receipt);
  expect(contexts.withContext).not.toHaveBeenCalled();
  expect(notify).not.toHaveBeenCalled();
});

// Real Git fixtures with repeated context validation exceed the 5s default under full-suite load.
it("stores all scopes with summary hashes and replays after source mutation and expiry", async () => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "difftray-submit-")));
  const storage = openStorage(":memory:");
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", root, ...args], { stdio: "ignore" });
  let now = 0;
  try {
    git("init", "-b", "main");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
    writeFileSync(path.join(root, "file.txt"), "one\ntwo\nthree\n");
    git("add", ".");
    git("commit", "-m", "initial");
    writeFileSync(path.join(root, "file.txt"), "changed\nsecond\nthree\n");
    const contexts = createReviewContextService(storage, { now: () => now, ttl: 10 });
    const reads = createAgentReviewService(storage, contexts);
    const inspected = await reads.inspect({
      repoPath: root,
      selector: { kind: "working-tree" }
    });
    const file = await reads.file({ contextId: inspected.contextId, path: "file.txt" });
    const onCommitted = vi.fn();
    const service = createAgentFeedbackService(storage, { contexts, onCommitted });
    const payload: FeedbackSubmission = {
      actor: { name: "Codex", runId: "run" },
      requestId: "request",
      items: [
        {
          kind: "line",
          path: file.path,
          diffHash: file.diffHash,
          side: "additions",
          lineStart: 1,
          lineEnd: 1,
          body: "Single"
        },
        {
          kind: "line",
          path: file.path,
          diffHash: file.diffHash,
          side: "deletions",
          lineStart: 1,
          lineEnd: 2,
          body: "Range"
        },
        { kind: "file", path: file.path, diffHash: file.diffHash, body: "File" },
        { kind: "overall", expectedNoteVersion: inspected.noteVersion, body: "Overall" }
      ]
    };
    const first = await service.submit({
      contextId: inspected.contextId,
      submission: payload
    });
    expect(first.itemIds).toHaveLength(4);
    expect(storage.listReviewComments(inspected.targetId)).toHaveLength(2);
    expect(storage.listReviewComments(inspected.targetId)[0]).toMatchObject({
      diffHash: file.diffHash,
      createdBy: { kind: "agent", name: "Codex", runId: "run" }
    });
    await expect(
      service.submit({
        contextId: inspected.contextId,
        submission: { ...payload, requestId: "conflict" }
      })
    ).rejects.toMatchObject({ code: "note_conflict" });
    expect(storage.listReviewComments(inspected.targetId)).toHaveLength(2);
    await service.submit({
      contextId: inspected.contextId,
      submission: {
        ...payload,
        actor: { ...payload.actor, runId: "another" },
        items: payload.items.filter((item) => item.kind !== "overall")
      }
    });
    expect(storage.listReviewComments(inspected.targetId)).toHaveLength(4);
    now = 100;
    writeFileSync(path.join(root, "file.txt"), "mutated\n");
    const restarted = createAgentFeedbackService(storage, {
      contexts: {
        withContext: vi.fn(() => {
          throw new Error("no context access on replay");
        })
      },
      onCommitted
    });
    expect(
      await restarted.submit({ contextId: inspected.contextId, submission: payload })
    ).toEqual({ ...first, deduplicated: true });
    await expect(
      restarted.submit({
        contextId: inspected.contextId,
        submission: {
          ...payload,
          items: [{ kind: "overall", body: "Different", expectedNoteVersion: "anything" }]
        }
      })
    ).rejects.toMatchObject({ code: "idempotency_conflict" });
    expect(onCommitted).toHaveBeenCalledTimes(2);
  } finally {
    storage.close();
    rmSync(root, { recursive: true, force: true });
  }
}, 20_000);
