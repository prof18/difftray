import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const runFile = promisify(execFile);

// Learn report and learn mark through the packaged CLI: feedback from two
// worktrees of one repository lands in one private report, the cursor moves
// it to the earlier section, and --all lists it as new again. All paths and
// profiles belong to the caller's disposable smoke fixture.
export async function runLearnMatrix({
  cli,
  createProfile,
  repository,
  stop,
  fixture,
  results,
  launcher,
  evidence
}) {
  const profile = await createProfile("learn-matrix");
  const repo = await repository(
    "learn matrix",
    "base one\nbase two\nbase three\n",
    "main one\nmain two\nbase three\n"
  );
  const git = (cwd, ...args) =>
    execFileSync("/usr/bin/git", ["-C", cwd, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10_000
    }).trim();
  const siblingPath = path.join(fixture, "learn matrix sibling");
  git(repo.path, "worktree", "add", "-b", "learn-branch", siblingPath);
  const sibling = await realpath(siblingPath);
  await writeFile(
    path.join(sibling, "tracked.txt"),
    "sibling one\nbase two\nbase three\n"
  );

  const input = async (value) => {
    const filename = path.join(fixture, `learn-matrix-${randomUUID()}.json`);
    await writeFile(filename, JSON.stringify(value));
    return filename;
  };
  const comment = async (root, body) => {
    const context = (
      await cli(profile, [
        "review",
        "inspect",
        "--repo",
        root,
        "--target",
        "working-tree"
      ])
    ).result;
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
    await cli(profile, [
      "feedback",
      "submit",
      "--context",
      context.contextId,
      "--input",
      await input({
        actor: { name: "Learn matrix reviewer", runId: randomUUID() },
        requestId: randomUUID(),
        items: [
          {
            kind: "line",
            path: file.path,
            diffHash: file.diffHash,
            side: "additions",
            lineStart: 1,
            lineEnd: 1,
            body
          }
        ]
      })
    ]);
  };
  const mainBody = "Learn matrix main: prefer early returns over nested ifs.";
  const siblingBody = "Learn matrix sibling: name the magic number.";
  await comment(repo.path, mainBody);
  await comment(sibling, siblingBody);

  const report = async (...extra) =>
    (await cli(profile, ["learn", "report", "--repo", repo.path, ...extra])).result;

  // Both worktrees share one report; the file is private and holds both bodies.
  const first = await report("--format", "json");
  assert.equal(first.format, "json");
  assert.equal(first.newCount, 2);
  assert.equal(first.earlierCount, 0);
  assert.equal(first.lastLearnedAt, null);
  assert.equal(first.authors.agent, 2);
  assert.ok(first.excerpts.saved >= 1, "agent feedback stores its excerpt on save");
  assert.ok(first.cursor, "a report with new items has a cursor");
  assert.equal((await stat(first.path)).mode & 0o777, 0o600);
  const firstContent = await readFile(first.path, "utf8");
  assert.ok(firstContent.includes(mainBody) && firstContent.includes(siblingBody));
  const parsed = JSON.parse(firstContent);
  assert.equal(parsed.newItems.length, 2);

  // The CLI never prints the endpoint token.
  const { token } = JSON.parse(await readFile(profile.endpoint, "utf8"));
  const text = await runFile(launcher, ["learn", "report", "--repo", sibling], {
    cwd: fixture,
    env: profile.env,
    timeout: 150_000,
    maxBuffer: 1024 * 1024
  });
  const [textPath, counts, ...rest] = text.stdout.split("\n");
  assert.deepEqual(rest, [""]);
  assert.equal((await stat(textPath)).mode & 0o777, 0o600);
  assert.match(counts, /^New: 2 · Earlier: 0 · Cursor: \d{4}-\d{2}-\d{2}T/);
  assert.equal(text.stderr, "");
  assert.equal(text.stdout.includes(token), false, "token must never be printed");

  // Usage errors and a future cursor fail without touching the cursor.
  await cli(profile, ["learn", "report", "--since", first.cursor, "--all"], false, 2);
  await cli(
    profile,
    ["learn", "mark", "--repo", repo.path, "--cursor", "2999-01-01T00:00:00.000Z"],
    false,
    2
  );

  // Marking moves the cursor once; the items then show up as earlier.
  const marked = (
    await cli(profile, ["learn", "mark", "--repo", sibling, "--cursor", first.cursor])
  ).result;
  assert.deepEqual(marked, { cursor: first.cursor, moved: true });
  const unchanged = (
    await cli(profile, ["learn", "mark", "--repo", repo.path, "--cursor", first.cursor])
  ).result;
  assert.deepEqual(unchanged, { cursor: first.cursor, moved: false });

  const second = await report();
  assert.equal(second.format, "markdown");
  assert.equal(second.newCount, 0);
  assert.equal(second.earlierCount, 2);
  assert.equal(second.lastLearnedAt, first.cursor);
  assert.equal((await stat(second.path)).mode & 0o777, 0o600);
  const secondContent = await readFile(second.path, "utf8");
  assert.ok(secondContent.includes(mainBody) && secondContent.includes(siblingBody));

  const all = await report("--all");
  assert.equal(all.newCount, 2);
  assert.equal(all.earlierCount, 0);

  await writeFile(
    path.join(evidence, "cli-learn-lifecycle.json"),
    JSON.stringify(
      {
        fixture: path.basename(repo.path),
        first: { ...first, path: path.basename(first.path) },
        marked,
        second: { ...second, path: path.basename(second.path) },
        all: { ...all, path: path.basename(all.path) }
      },
      null,
      2
    )
  );
  await stop(profile);
  results.push(
    "learn report/mark: two worktrees in one private 0600 report with saved excerpts, text output without token, usage and future cursor rejected, cursor moves once, items become earlier, --all lists them again"
  );
}
