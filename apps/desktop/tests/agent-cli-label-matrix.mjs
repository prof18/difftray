import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { realpath, writeFile } from "node:fs/promises";
import path from "node:path";

// Worktree display labels through the packaged CLI: metadata only, persistent
// across restart, and never a Git, selection or review change. All paths and
// profiles belong to the caller's disposable smoke fixture.
export async function runLabelMatrix({
  cli,
  createProfile,
  repository,
  stop,
  browser,
  selected,
  open,
  fixture,
  results,
  evidence
}) {
  const profile = await createProfile("label-matrix");
  const repo = await repository("label matrix", "base\n", "changed\n");
  const git = (cwd, ...args) =>
    execFileSync("/usr/bin/git", ["-C", cwd, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10_000
    }).trim();
  const branchPath = path.join(fixture, "label branch sibling");
  const detachedPath = path.join(fixture, "label detached sibling");
  git(repo.path, "worktree", "add", "-b", "label-branch", branchPath);
  git(repo.path, "worktree", "add", "--detach", detachedPath);
  const branchRoot = await realpath(branchPath);
  const detachedRoot = await realpath(detachedPath);
  const gitState = () =>
    [repo.path, branchRoot, detachedRoot].map((root) => ({
      branch: git(root, "branch", "--show-current"),
      head: git(root, "rev-parse", "HEAD"),
      root: git(root, "rev-parse", "--show-toplevel")
    }));
  const set = async (root, label) =>
    (await cli(profile, ["worktree", "label", "set", "--repo", root, "--label", label]))
      .result;
  const reset = async (root) =>
    (await cli(profile, ["worktree", "label", "reset", "--repo", root])).result;

  await open(profile, repo.path);
  const gui = await browser(profile);
  await selected(gui, repo.path, path.basename(repo.path));
  const before = gitState();
  const reviewBefore = (await cli(profile, ["review", "inspect", "--repo", repo.path]))
    .result;

  // A closed sibling is labeled without opening it.
  const closed = await set(branchRoot, "Closed sibling");
  assert.equal(closed.repoPath, branchRoot);
  assert.equal(closed.worktree.state, "available");
  assert.equal(closed.worktree.branchName, "label-branch");
  assert.equal(closed.worktree.displayName, "Closed sibling");

  // A detached worktree falls back to its short hash after reset.
  const detached = await set(detachedRoot, "Detached work");
  const detachedReset = await reset(detachedRoot);
  assert.equal(detachedReset.worktree.id, detached.worktree.id);
  assert.equal(
    detachedReset.worktree.displayName,
    `Detached @ ${git(detachedRoot, "rev-parse", "--short=7", "HEAD")}`
  );
  assert.equal("customLabel" in detachedReset.worktree, false);

  // Shell metacharacters stay literal text.
  // The CLI runs with the fixture as its working directory.
  const marker = path.join(fixture, "dt-mark");
  const hostile = "$(touch dt-mark); `touch dt-mark` | & \"q\" 's' > dt-mark";
  const literal = await set(repo.path, hostile);
  assert.equal(literal.worktree.customLabel, hostile);
  assert.equal(existsSync(marker), false, "labels must never be executed");

  // The main checkout keeps its label across a desktop restart.
  const main = await set(repo.path, "Main checkout ✨");
  assert.equal(main.worktree.state, "open", "the CLI reports Difftray tab state");
  const reviewAfter = (await cli(profile, ["review", "inspect", "--repo", repo.path]))
    .result;
  assert.equal(reviewAfter.targetId, reviewBefore.targetId);
  assert.equal(reviewAfter.snapshotHash, reviewBefore.snapshotHash);
  assert.deepEqual(gitState(), before, "labels must not change branch, HEAD or root");
  await gui.close();
  await stop(profile);

  await open(profile, repo.path);
  const restarted = await browser(profile);
  const page = await selected(restarted, repo.path, path.basename(repo.path));
  await page
    .locator(
      `[data-project-tab-name=${JSON.stringify(path.basename(repo.path))}] [data-tab-worktree-name="true"]`
    )
    .filter({ hasText: "Main checkout ✨" })
    .waitFor({ timeout: 30_000 });
  await page.screenshot({ path: path.join(evidence, "cli-label-after-restart.png") });
  const again = await set(repo.path, "Main checkout ✨");
  assert.equal(again.worktree.id, main.worktree.id, "identity survives restart");
  const mainReset = await reset(repo.path);
  assert.equal(mainReset.worktree.id, main.worktree.id);
  assert.equal("customLabel" in mainReset.worktree, false);
  const closedReset = await reset(branchRoot);
  assert.equal(closedReset.worktree.displayName, "label-branch");
  assert.deepEqual(gitState(), before, "reset must not change branch, HEAD or root");
  await writeFile(
    path.join(evidence, "cli-label-lifecycle.json"),
    JSON.stringify(
      {
        fixture: path.basename(repo.path),
        projectId: again.repoPath,
        worktreeId: main.worktree.id,
        set: again,
        reset: mainReset
      },
      null,
      2
    )
  );
  await restarted.close();
  await stop(profile);
  results.push(
    "worktree labels: closed sibling, detached fallback, literal shell text, main checkout, restart persistence, identity, unchanged Git and review"
  );
}
