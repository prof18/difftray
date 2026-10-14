import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { _electron as electron } from "playwright";

// Every mutation below belongs to this harness's disposable repository/profile.
// Clock control and database inspection run in its own Electron main process;
// there are no production-only test hooks or installed-app dependencies.
export async function runWriteMatrix({
  cli,
  createProfile,
  repository,
  stop,
  browser,
  selected,
  open,
  fixture,
  results,
  executablePath,
  children,
  fixtureSockets,
  until
}) {
  const repo = await repository(
    "write retry matrix",
    "old one\nold two\nold three\n",
    "new one\nnew two\nnew three\n"
  );
  const profile = await createProfile("write-retry-matrix");
  const launch = async () => {
    const app = await electron.launch({
      executablePath,
      args: ["--agent-background"],
      env: profile.env,
      cwd: fixture
    });
    children.push(app);
    await cli(profile, ["doctor"]);
    return app;
  };
  await launch();
  const inspect = async () =>
    (await cli(profile, ["review", "inspect", "--repo", repo.path])).result;
  const feedback = async (context, extra = []) =>
    (await cli(profile, ["review", "feedback", "--context", context.contextId, ...extra]))
      .result;
  const context = await inspect();
  const file = (
    await cli(profile, [
      "review",
      "file",
      "--context",
      context.contextId,
      "--path",
      "tracked.txt"
    ])
  ).result;
  const actor = { name: "Matrix reviewer one", runId: randomUUID() };
  const fileItem = (body) => ({
    kind: "file",
    path: file.path,
    diffHash: file.diffHash,
    body
  });
  const submission = (items, reviewer = actor) => ({
    actor: reviewer,
    requestId: randomUUID(),
    items
  });
  const input = async (value) => {
    const filename = path.join(fixture, `write-matrix-${randomUUID()}.json`);
    await writeFile(filename, JSON.stringify(value));
    return filename;
  };
  const submit = async (context, value, success = true, exitCode) =>
    cli(
      profile,
      [
        "feedback",
        "submit",
        "--context",
        context.contextId,
        "--input",
        await input(value)
      ],
      success,
      exitCode
    );
  const individual = [
    {
      kind: "line",
      path: file.path,
      diffHash: file.diffHash,
      side: "additions",
      lineStart: 1,
      lineEnd: 1,
      body: "Individual single line"
    },
    {
      kind: "line",
      path: file.path,
      diffHash: file.diffHash,
      side: "deletions",
      lineStart: 1,
      lineEnd: 2,
      body: "Individual inclusive range"
    },
    fileItem("Individual file"),
    {
      kind: "overall",
      expectedNoteVersion: context.noteVersion,
      body: "Individual overall"
    }
  ];
  for (const item of individual) {
    const receipt = (await submit(context, submission([item]))).result;
    assert.equal(receipt.deduplicated, false);
    assert.equal(receipt.itemIds.length, 1);
    const stored = (await feedback(context)).items.find(
      (entry) => entry.id === receipt.itemIds[0]
    );
    assert.ok(stored, `individual ${item.kind} finding must be readable`);
    assert.equal(stored.body, item.body);
    assert.equal(stored.active, true);
    assert.deepEqual(stored.lastEditedBy, { kind: "agent", ...actor });
    if (item.kind === "line") {
      assert.equal(stored.lineStart, item.lineStart);
      assert.equal(stored.lineEnd, item.lineEnd);
      assert.equal(stored.side, item.side);
    }
  }
  assert.equal((await feedback(context)).total, 4);
  results.push(
    "individual packaged single-line, inclusive-range, file and overall submissions"
  );

  // Separate CLI processes race with independent identities under the same profile.
  const reviewerTwo = { name: "Matrix reviewer two", runId: randomUUID() };
  const concurrent = await Promise.all([
    submit(context, submission([fileItem("Concurrent reviewer one")], actor)),
    submit(context, submission([fileItem("Concurrent reviewer two")], reviewerTwo))
  ]);
  assert.equal(
    new Set(concurrent.flatMap((response) => response.result.itemIds)).size,
    2
  );
  const exchanged = (
    await cli(profile, [
      "review",
      "export",
      "--context",
      context.contextId,
      "--format",
      "json"
    ])
  ).result.content;
  for (const name of [actor.name, reviewerTwo.name])
    assert.ok(
      exchanged.items.some((item) => item.createdBy?.name === name),
      "both reviewers must be visible through export"
    );
  results.push("two independent concurrent packaged reviewers and cross-reviewer export");

  const firstPage = await feedback(context, ["--limit", "1"]);
  assert.ok(firstPage.nextCursor);
  await submit(context, submission([fileItem("Invalidate pagination snapshot")]));
  const stalePage = await cli(
    profile,
    [
      "review",
      "feedback",
      "--context",
      context.contextId,
      "--limit",
      "1",
      "--cursor",
      firstPage.nextCursor
    ],
    false,
    4
  );
  assert.equal(stalePage.error.code, "stale_feedback");
  const all = await feedback(context);
  const pages = [];
  const cursors = new Set();
  let cursor;
  let version;
  do {
    const page = await feedback(context, [
      "--limit",
      "2",
      ...(cursor ? ["--cursor", cursor] : [])
    ]);
    version ??= page.feedbackVersion;
    assert.equal(page.feedbackVersion, version);
    assert.equal(page.total, all.total);
    pages.push(...page.items);
    cursor = page.nextCursor;
    if (cursor) {
      assert.ok(!cursors.has(cursor), "pagination must make bounded progress");
      cursors.add(cursor);
      assert.ok(cursors.size <= all.total);
    }
  } while (cursor);
  assert.deepEqual(
    pages,
    all.items,
    "fresh pagination must return every row exactly once in order"
  );
  results.push(
    "stale feedback cursor rejected and fresh pagination returns all rows once"
  );

  // Send a real authenticated request and discard the response before parsing it.
  // A later CLI read proves the commit independently of the lost transport reply.
  const lost = submission([fileItem("Lost reply committed finding")]);
  const endpoint = JSON.parse(await readFile(profile.endpoint, "utf8"));
  await new Promise((resolve, reject) => {
    const socket = net.createConnection(endpoint.socketPath);
    fixtureSockets.push(socket);
    socket.setTimeout(10_000, () => {
      socket.destroy();
      reject(new Error("Owned lost-reply fixture timed out"));
    });
    socket.once("error", () =>
      reject(new Error("Owned lost-reply fixture connection failed"))
    );
    socket.once("connect", () =>
      socket.write(
        `${JSON.stringify({ version: 1, id: randomUUID(), token: endpoint.token, method: "feedback.submit", params: { contextId: context.contextId, submission: lost } })}\n`
      )
    );
    socket.once("data", () => {
      socket.destroy();
      resolve();
    });
  });
  const committed = await until(async () => {
    const snapshot = await feedback(context);
    return snapshot.items.some((item) => item.body === lost.items[0].body) && snapshot;
  }, "lost-reply committed finding");
  assert.equal(
    committed.items.filter((item) => item.body === lost.items[0].body).length,
    1
  );
  const replay = (await submit(context, lost)).result;
  assert.equal(replay.deduplicated, true);
  assert.deepEqual(
    await feedback(context),
    committed,
    "lost-reply retry cannot change rows or revisions"
  );
  const changed = await submit(
    context,
    { ...lost, items: [fileItem("Changed same-key payload")] },
    false,
    4
  );
  assert.equal(changed.error.code, "idempotency_conflict");
  await stop(profile);
  const app = await launch();
  assert.deepEqual((await submit(context, lost)).result, replay);
  assert.deepEqual(
    await feedback(context),
    committed,
    "restart retry cannot duplicate or revise findings"
  );

  // Fixture-only expiry injection preserves normal wall-clock behavior and expires
  // precisely this stored context, independently of receipt lookup.
  await app.evaluate(
    async (_, input) => {
      const { DatabaseSync } = process.getBuiltinModule("node:sqlite");
      const db = new DatabaseSync(input.database);
      try {
        const result = db
          .prepare("update agent_review_contexts set expires_at = 0 where id = ?")
          .run(input.contextId);
        if (result.changes !== 1)
          throw new Error("Fixture context expiry did not update one row");
      } finally {
        db.close();
      }
    },
    {
      database: path.join(profile.path, "data", "difftray.sqlite"),
      contextId: context.contextId
    }
  );
  const expired = await cli(
    profile,
    ["review", "feedback", "--context", context.contextId],
    false,
    3
  );
  assert.equal(expired.error.code, "context_expired");
  assert.deepEqual(
    (await submit(context, lost)).result,
    replay,
    "receipt lookup must precede context expiry"
  );
  const fresh = await inspect();
  assert.deepEqual(
    await feedback(fresh),
    committed,
    "expired-context retry cannot duplicate rows or revisions"
  );
  results.push(
    "lost response, exact CLI retry, changed-key conflict, restart and expired-context receipt replay without duplicate rows or revision changes"
  );

  await open(profile, repo.path);
  const gui = await browser(profile);
  const page = await selected(gui, repo.path, path.basename(repo.path));
  const target = { projectId: fresh.projectId, reviewTargetId: fresh.targetId };
  const save = async (body) => {
    const response = await page.evaluate(
      (input) => window.difftray.saveReviewNote(input),
      { ...target, body }
    );
    assert.equal(response.status, "saved");
    return response.reviewNote;
  };
  const rejectNote = async (oldContext, body) => {
    const before = await feedback(oldContext);
    const rejected = await submit(
      oldContext,
      submission([
        fileItem("Must roll back with stale note revision"),
        { kind: "overall", expectedNoteVersion: oldContext.noteVersion, body }
      ]),
      false,
      4
    );
    assert.equal(rejected.error.code, "note_conflict");
    assert.deepEqual(
      await feedback(oldContext),
      before,
      "note conflict must atomically preserve all findings and revisions"
    );
  };
  // Freeze the main-process Date constructor as well as Date.now for two real human
  // IPC edits, so timestamp-based CAS would demonstrably fail this test.
  await app.evaluate(() => {
    const OriginalDate = Date;
    const fixed = OriginalDate.now();
    globalThis.__writeMatrixOriginalDate = OriginalDate;
    globalThis.Date = class extends OriginalDate {
      constructor(...args) {
        super(...(args.length ? args : [fixed]));
      }
      static now() {
        return fixed;
      }
    };
  });
  try {
    const initial = await save("Human note A");
    const readA = await inspect();
    const second = await save("Human note B");
    assert.equal(
      initial.updatedAt,
      second.updatedAt,
      "human edits must share the same millisecond"
    );
    await rejectNote(readA, "Agent must not overwrite same-millisecond edit");
    const beforeDelete = await inspect();
    const deleted = await page.evaluate(
      (input) => window.difftray.deleteReviewNote(input),
      target
    );
    assert.equal(deleted.status, "deleted");
    const recreated = await save("Human note B");
    assert.equal(recreated.body, second.body);
    assert.equal(
      recreated.updatedAt,
      second.updatedAt,
      "ABA recreates identical body and timestamp"
    );
    await rejectNote(beforeDelete, "Agent must not overwrite delete/recreate ABA");
  } finally {
    await app.evaluate(() => {
      globalThis.Date = globalThis.__writeMatrixOriginalDate;
      delete globalThis.__writeMatrixOriginalDate;
    });
  }
  results.push(
    "real human same-millisecond edit and delete/recreate ABA reject atomic agent note writes"
  );

  const beforeSource = await inspect();
  const finalReceipt = (
    await submit(beforeSource, submission([fileItem("Stale after source changes")]))
  ).result;
  await writeFile(path.join(repo.path, "tracked.txt"), "changed after write\n");
  const afterSource = await inspect();
  const retained = await feedback(afterSource, ["--include-inactive"]);
  const staleFinding = retained.items.find((item) => item.id === finalReceipt.itemIds[0]);
  assert.ok(staleFinding, "source change must retain written finding");
  assert.equal(
    staleFinding.active,
    false,
    "finding written immediately before source change must become stale"
  );
  assert.ok(
    !(await feedback(afterSource)).items.some((item) => item.id === staleFinding.id)
  );
  results.push(
    "source change immediately after committed write retains finding as inactive"
  );
}
