import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

// All paths/profiles are owned by the caller's disposable smoke fixture. The
// caller also owns process cleanup and CLI envelope/exit-code validation.
export async function runReadMatrix({
  cli,
  createProfile,
  repository,
  stop,
  browser,
  selected,
  fixture,
  results
}) {
  const profile = await createProfile("read-matrix");
  const repo = await repository("read matrix", "base line\n", "committed line\n");
  const git = (...args) =>
    execFileSync("/usr/bin/git", ["-C", repo.path, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10_000
    }).trim();
  git("branch", "matrix-base");
  git("add", ".");
  git("commit", "-m", "committed review change");
  const commit = git("rev-parse", "HEAD");
  await writeFile(path.join(repo.path, "tracked.txt"), "working line\n");
  const inspect = async (selector = []) =>
    (await cli(profile, ["review", "inspect", "--repo", repo.path, ...selector])).result;
  const read = async (command, context, extra = []) =>
    (await cli(profile, ["review", command, "--context", context.contextId, ...extra]))
      .result;
  const working = await inspect(["--target", "working-tree"]);
  const branch = await inspect(["--target", "branch", "--base", "matrix-base"]);
  const single = await inspect(["--target", "commit", "--commit", commit]);
  assert.equal(new Set([working.targetId, branch.targetId, single.targetId]).size, 3);
  const workingFile = await read("file", working, ["--path", "tracked.txt"]);
  const branchFile = await read("file", branch, ["--path", "tracked.txt"]);
  const commitFile = await read("file", single, ["--path", "tracked.txt"]);
  assert.match(workingFile.content.patch, /working line/);
  assert.match(branchFile.content.patch, /committed line/);
  assert.doesNotMatch(branchFile.content.patch, /working line/);
  assert.equal(branchFile.content.patch, commitFile.content.patch);

  for (const [command, extra] of [
    ["files", ["--limit", "1"]],
    ["file", ["--path", "tracked.txt"]],
    ["feedback", ["--limit", "1"]],
    ["export", ["--format", "json"]]
  ]) {
    const before = await read(command, working, extra);
    await stop(profile);
    assert.deepEqual(await read(command, working, extra), before);
    const quiet = await browser(profile);
    assert.equal(
      quiet.contexts().flatMap((context) => context.pages()).length,
      0,
      `cold review ${command} must remain windowless`
    );
  }
  results.push(
    "cold persisted files/file/feedback/export each stay quiet and windowless"
  );

  for (const selector of [
    ["--target", "branch", "--base", "matrix-base"],
    ["--target", "commit", "--commit", commit],
    ["--target", "working-tree"]
  ]) {
    const opened = (await cli(profile, ["open", repo.path, ...selector])).result;
    await selected(await browser(profile), repo.path, path.basename(repo.path));
    const visible = await inspect(["--target", "selected"]);
    assert.deepEqual(visible.target, opened.target);
    assert.deepEqual(await read("file", working, ["--path", "tracked.txt"]), workingFile);
    assert.deepEqual(await read("file", branch, ["--path", "tracked.txt"]), branchFile);
    assert.deepEqual(await read("file", single, ["--path", "tracked.txt"]), commitFile);
  }
  git("checkout", "--detach", commit);
  const detached = await inspect(["--target", "working-tree"]);
  assert.equal(detached.projectId, working.projectId);
  const detachedFile = await read("file", detached, ["--path", "tracked.txt"]);
  assert.deepEqual(detachedFile.content, workingFile.content);
  assert.deepEqual(detachedFile.selectableRanges, workingFile.selectableRanges);
  assert.notEqual(detached.targetId, working.targetId);
  assert.notEqual(detachedFile.diffHash, workingFile.diffHash);
  git("branch", "-f", "matrix-base", commit);
  assert.equal(
    (await cli(profile, ["review", "files", "--context", branch.contextId], false, 4))
      .error.code,
    "stale_review",
    "moving a branch selector ref must invalidate its persisted context"
  );
  assert.deepEqual(await read("file", single, ["--path", "tracked.txt"]), commitFile);
  results.push(
    "explicit branch/commit/working-tree, GUI target independence, detached HEAD, ref movement rejection"
  );

  // Real file and feedback pages, including cursor binding to command/filter.
  for (const name of ["page-a.txt", "page-b.txt"])
    await writeFile(path.join(repo.path, name), `${name}\n`);
  const paged = await inspect(["--target", "working-tree"]);
  const first = await read("files", paged, ["--limit", "1"]);
  assert.equal(first.total, 3);
  assert.equal(first.files.length, 1);
  assert.equal(typeof first.nextCursor, "string");
  const second = await read("files", paged, [
    "--limit",
    "1",
    "--cursor",
    first.nextCursor
  ]);
  const third = await read("files", paged, [
    "--limit",
    "1",
    "--cursor",
    second.nextCursor
  ]);
  assert.equal(third.nextCursor, null);
  assert.equal(
    new Set([...first.files, ...second.files, ...third.files].map((file) => file.path))
      .size,
    3
  );
  const page = await selected(
    await browser(profile),
    repo.path,
    path.basename(repo.path)
  );
  const file = await read("file", paged, ["--path", "tracked.txt"]);
  const ids = [];
  for (const body of [
    "Read pagination human one",
    "Read pagination human two",
    "Read pagination human three"
  ]) {
    const created = await page.evaluate(
      (input) => window.difftray.createReviewComment(input),
      {
        body,
        displayedDiffHash: file.diffHash,
        lineStart: 1,
        lineEnd: 1,
        path: "tracked.txt",
        projectId: paged.projectId,
        reviewTargetId: paged.targetId,
        side: "additions"
      }
    );
    assert.equal(created.status, "created");
    ids.push(created.comment.id);
  }
  const feedback = await read("feedback", paged, ["--limit", "1"]);
  assert.equal(feedback.total, 3);
  const feedback2 = await read("feedback", paged, [
    "--limit",
    "1",
    "--cursor",
    feedback.nextCursor
  ]);
  const feedback3 = await read("feedback", paged, [
    "--limit",
    "1",
    "--cursor",
    feedback2.nextCursor
  ]);
  assert.equal(feedback3.nextCursor, null);
  assert.deepEqual(
    new Set(
      [...feedback.items, ...feedback2.items, ...feedback3.items].map((item) => item.id)
    ),
    new Set(ids)
  );
  for (const args of [
    ["feedback", "--cursor", first.nextCursor],
    ["feedback", "--cursor", feedback.nextCursor, "--include-inactive"],
    ["files", "--limit", "501"]
  ]) {
    const [command, ...options] = args;
    assert.equal(
      (
        await cli(
          profile,
          ["review", command, "--context", paged.contextId, ...options],
          false,
          2
        )
      ).error.code,
      "invalid_request"
    );
  }
  results.push(
    "real three-page files and human feedback, terminal cursors, command/filter binding and explicit page bounds"
  );

  await stop(profile);
  const backup = path.join(fixture, "read matrix original identity");
  await rename(repo.path, backup);
  assert.equal(
    (await cli(profile, ["review", "files", "--context", paged.contextId], false, 3))
      .error.code,
    "repository_missing"
  );
  // Recreate identical contents at the exact old path, retaining the original so
  // inode reuse cannot accidentally make this identity test nondeterministic.
  await mkdir(repo.path);
  execFileSync("/usr/bin/git", ["clone", backup, repo.path], {
    stdio: "pipe",
    timeout: 10_000
  });
  await writeFile(path.join(repo.path, "tracked.txt"), "working line\n");
  for (const name of ["page-a.txt", "page-b.txt"])
    await writeFile(path.join(repo.path, name), `${name}\n`);
  assert.equal(
    (await cli(profile, ["review", "files", "--context", paged.contextId], false, 4))
      .error.code,
    "stale_review"
  );
  const recreated = await inspect(["--target", "working-tree"]);
  assert.equal(recreated.repoPath, repo.path);
  assert.notEqual(recreated.contextId, paged.contextId);
  assert.equal(recreated.fileCount, 3);
  results.push(
    "missing exact worktree fails repository_missing; recreated identical path fails stale_review until reinspection"
  );
}
