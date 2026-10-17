import assert from "node:assert/strict";
import { execFile, execFileSync, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile
} from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify, parseArgs } from "node:util";
import { chromium, _electron as electron } from "playwright";
import { prepareCliTestBundle } from "../scripts/cli-test-bundle.mjs";
import { runReadMatrix } from "./agent-cli-read-matrix.mjs";
import { runWriteMatrix } from "./agent-cli-write-matrix.mjs";
import { runInvalidationMatrix } from "./agent-cli-invalidation-matrix.mjs";
import { runCompatMatrix } from "./agent-cli-compat-matrix.mjs";

const runFile = promisify(execFile);
const { values } = parseArgs({
  options: { app: { type: "string" }, "skip-build": { type: "boolean", default: false } }
});
const bundle = await prepareCliTestBundle(values.app, {
  skipBuild: values["skip-build"]
});
const fixture = await mkdtemp(path.join(tmpdir(), "difftray agent e2e "));
const evidence = path.resolve(
  import.meta.dirname,
  "../../../artifacts/agent-integration"
);
const browsers = [];
const profiles = [];
const children = [];
const fixtureSockets = [];
const results = [];
const recordResult = results.push.bind(results);
results.push = (...rows) => {
  for (const row of rows) console.log(`PASS: ${row}`);
  return recordResult(...rows);
};
const launcher = path.join(bundle.appPath, "Contents/Resources/bin/difftray");
const bundleExecutable = execFileSync(
  "/usr/bin/plutil",
  [
    "-extract",
    "CFBundleExecutable",
    "raw",
    "-o",
    "-",
    path.join(bundle.appPath, "Contents/Info.plist")
  ],
  { encoding: "utf8" }
).trim();
const executablePath = await realpath(
  path.join(bundle.appPath, "Contents/MacOS", bundleExecutable)
);
const cleanupFailures = [];
const controller = new AbortController();
const pause = () => new Promise((resolve) => setTimeout(resolve, 50));
async function until(check, label, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await pause();
  }
  throw new Error(`Timed out waiting for ${label}`);
}
function processIds(profile) {
  let listing;
  try {
    listing = execFileSync("/bin/ps", ["-axo", "pid=,comm="], {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"]
    });
  } catch {
    throw new Error("Could not inspect process executable names");
  }
  const candidates = listing
    .split("\n")
    .map((line) => /^\s*(\d+)\s+(.+)$/.exec(line))
    .filter((match) => match && match[2] === executablePath)
    .map((match) => Number(match[1]));
  return candidates.filter((pid) => {
    let command;
    try {
      command = execFileSync("/bin/ps", ["eww", "-p", String(pid), "-o", "command="], {
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"]
      });
    } catch {
      // A process may have exited between the executable inventory and this read.
      try {
        process.kill(pid, 0);
      } catch (error) {
        if (error.code === "ESRCH") return false;
      }
      throw new Error("Could not inspect an isolated fixture process");
    }
    return (
      command.includes(`DIFFTRAY_USER_DATA_DIR=${profile.path} `) ||
      command.trimEnd().endsWith(`DIFFTRAY_USER_DATA_DIR=${profile.path}`)
    );
  });
}
async function cleanup(action) {
  try {
    await action();
  } catch {
    cleanupFailures.push("An isolated fixture cleanup action failed");
  }
}

async function stop(profile, signal = "SIGTERM") {
  for (const pid of processIds(profile)) {
    try {
      process.kill(pid, signal);
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
  await until(() => processIds(profile).length === 0, "owned profile shutdown");
}
async function createProfile(name) {
  const profilePath = path.join(fixture, name);
  await mkdir(profilePath);
  const canonical = await realpath(profilePath);
  const digest = createHash("sha256").update(canonical).digest("hex").slice(0, 24);
  const directory = `/tmp/difftray-${process.getuid()}-${digest}`;
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  const env = {
    ...process.env,
    PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
    DIFFTRAY_USER_DATA_DIR: canonical,
    DIFFTRAY_AGENT_SMOKE_DEBUG_PORT: String(port),
    DIFFTRAY_WINDOW_PRESENTATION: "inactive"
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_OPTIONS;
  delete env.DIFFTRAY_BOOT_PROJECT;
  const profile = {
    path: canonical,
    directory,
    endpoint: path.join(directory, "endpoint.json"),
    port,
    env
  };
  profiles.push(profile);
  return profile;
}
async function cli(profile, args, success = true, expectedExitCode) {
  controller.signal.throwIfAborted();
  let output;
  try {
    output = await runFile(launcher, [...args, "--json"], {
      cwd: fixture,
      env: profile.env,
      signal: controller.signal,
      timeout: 150_000,
      maxBuffer: 1024 * 1024
    });
  } catch (error) {
    controller.signal.throwIfAborted();
    if (success) {
      const processes = processIds(profile).map((pid) => {
        let sample;
        try {
          sample = execFileSync("/usr/bin/sample", [String(pid), "1", "1"], {
            encoding: "utf8",
            timeout: 10_000,
            maxBuffer: 4 * 1024 * 1024,
            stdio: ["ignore", "pipe", "ignore"]
          });
        } catch {
          sample = "Owned fixture process exited or could not be sampled";
        }
        return { pid, sample };
      });
      let endpoint;
      try {
        const metadata = JSON.parse(await readFile(profile.endpoint, "utf8"));
        delete metadata.token;
        endpoint = metadata;
      } catch {
        endpoint = "No readable endpoint";
      }
      await writeFile(
        path.join(evidence, `cli-startup-failure-${randomUUID()}.json`),
        JSON.stringify(
          {
            profile: path.basename(profile.path),
            args,
            endpoint,
            processes,
            completed: results
          },
          null,
          2
        )
      );
    }
    assert.equal(success, false, `CLI failed: ${error.stderr}`);
    if (expectedExitCode !== undefined) assert.equal(error.code, expectedExitCode);
    output = error;
  }
  const response = JSON.parse(output.stdout);
  assert.equal(response.version, 1);
  assert.equal(response.ok, success, output.stderr);
  assert.equal(
    output.stdout.trim().split("\n").length,
    1,
    "stdout must contain one JSON envelope"
  );
  if (success)
    assert.equal(output.stderr, "", "successful CLI diagnostics must be quiet");
  return response;
}
async function promptExport(profile, contextId) {
  const output = await runFile(
    launcher,
    ["review", "export", "--context", contextId, "--format", "prompt"],
    {
      cwd: fixture,
      env: profile.env,
      timeout: 150_000,
      maxBuffer: 1024 * 1024
    }
  );
  assert.equal(output.stderr, "", "prompt export must not include startup diagnostics");
  return output.stdout;
}
async function browser(profile) {
  let lastError;
  const connected = await until(async () => {
    try {
      return await chromium.connectOverCDP(`http://127.0.0.1:${profile.port}`);
    } catch (error) {
      lastError = error.message;
      return undefined;
    }
  }, "isolated GUI debugging endpoint").catch(async (error) => {
    const listeners = processIds(profile).map((pid) => {
      try {
        return execFileSync(
          "/usr/sbin/lsof",
          ["-a", "-p", String(pid), "-iTCP", "-sTCP:LISTEN", "-n", "-P"],
          { encoding: "utf8" }
        );
      } catch {
        return "No TCP listener for owned fixture process";
      }
    });
    await writeFile(
      path.join(evidence, "cli-debug-failure.json"),
      JSON.stringify(
        {
          profile: path.basename(profile.path),
          port: profile.port,
          lastError,
          listeners,
          completed: results
        },
        null,
        2
      )
    );
    throw error;
  });
  browsers.push(connected);
  return connected;
}
async function selected(browser, repo, name) {
  const page = await until(
    () =>
      browser
        .contexts()
        .flatMap((context) => context.pages())
        .find((page) => page.url().startsWith("file:")),
    "renderer page"
  );
  await page
    .locator(`[data-project-tab-name=${JSON.stringify(name)}][data-active="true"]`)
    .waitFor({ timeout: 30_000 });
  const selectedPath = await page
    .locator(`[data-project-tab-name=${JSON.stringify(name)}]`)
    .getAttribute("title");
  if (selectedPath)
    assert.ok(
      selectedPath.includes(repo),
      "active worktree tab must describe exact path"
    );
  return page;
}
async function open(profile, repo) {
  const response = await cli(profile, ["open", repo]);
  assert.equal(response.result.repoPath, await realpath(repo));
  assert.equal(response.result.projectId, await realpath(repo));
  assert.equal(response.result.target.projectId, response.result.projectId);
  return response;
}
async function repository(name, before = "before\n", after = "after\n") {
  const repo = path.join(fixture, name);
  await mkdir(repo);
  const git = (args) =>
    execFileSync("/usr/bin/git", ["-C", repo, ...args], { stdio: "pipe" });
  git(["init", "-b", "main"]);
  git(["config", "user.name", "CLI smoke"]);
  git(["config", "user.email", "smoke@example.invalid"]);
  await writeFile(path.join(repo, "tracked.txt"), before);
  git(["add", "."]);
  git(["commit", "-m", "fixture"]);
  await writeFile(path.join(repo, "tracked.txt"), after);
  return { path: await realpath(repo), git };
}
async function runMatrix() {
  await mkdir(evidence, { recursive: true });
  const repo = await repository("repo with 'quotes'");
  const sibling = path.join(fixture, "linked worktree");
  repo.git(["worktree", "add", "-b", "agent-worktree", sibling]);
  await writeFile(path.join(sibling, "tracked.txt"), "worktree\n");
  const nested = path.join(sibling, "nested");
  await mkdir(nested);
  const link = path.join(fixture, "symlinked worktree");
  await symlink(sibling, link);
  const reads = await createProfile("read-only-cold");
  const inspected = await cli(reads, ["review", "inspect", "--repo", repo.path]);
  assert.equal(inspected.result.repoPath, repo.path);
  assert.equal(inspected.result.target.kind, "working_tree");
  assert.equal(inspected.result.fileCount, 1);
  assert.ok(inspected.result.expiresAt > Date.now());
  assert.equal(typeof inspected.result.noteVersion, "string");
  const readGui = await browser(reads);
  assert.equal(
    readGui.contexts().flatMap((context) => context.pages()).length,
    0,
    "cold inspect must not create a window"
  );
  await stop(reads);
  const coldExport = await cli(reads, [
    "review",
    "export",
    "--repo",
    repo.path,
    "--format",
    "json"
  ]);
  assert.equal(coldExport.result.content.target.projectId, repo.path);
  assert.deepEqual(coldExport.result.content.items, []);
  const restartedReadGui = await browser(reads);
  assert.equal(
    restartedReadGui.contexts().flatMap((context) => context.pages()).length,
    0,
    "cold export must not create a window"
  );
  results.push("cold inspect/export remain quiet and windowless with no Node on PATH");

  const quiet = await createProfile("production-like");
  const hello = await cli(quiet, ["doctor"]);
  assert.equal(hello.result.profilePath, quiet.path);
  assert.equal(hello.result.connected, true);
  assert.equal(hello.result.bundlePath, bundle.appPath);
  assert.equal(hello.result.cliVersion, hello.result.appVersion);
  assert.equal("token" in hello.result, false);
  assert.equal("socketPath" in hello.result, false);
  const gui = await browser(quiet);
  assert.equal(
    gui.contexts().flatMap((context) => context.pages()).length,
    0,
    "cold doctor must not create a window"
  );
  await open(quiet, repo.path);
  const page = await selected(gui, repo.path, path.basename(repo.path));
  await page.screenshot({ path: path.join(evidence, "cli-cold-open.png") });
  const nestedResponse = await cli(quiet, ["open", nested]);
  assert.equal(nestedResponse.result.repoPath, await realpath(sibling));
  await selected(gui, await realpath(sibling), path.basename(sibling));
  const symlinkResponse = await cli(quiet, ["open", link]);
  assert.equal(symlinkResponse.result.repoPath, await realpath(sibling));
  const parallel = await Promise.all([open(quiet, repo.path), open(quiet, sibling)]);
  assert.equal(new Set(parallel.map((response) => response.result.projectId)).size, 2);
  assert.equal(
    processIds(quiet).length,
    1,
    "concurrent warm calls must share one GUI process"
  );
  results.push(
    "quiet doctor, cold open, exact nested/symlinked linked worktree, concurrent warm opens"
  );

  const siblingRoot = await realpath(sibling);
  const labelSet = ["worktree", "label", "set", "--repo", siblingRoot, "--label"];
  const labeled = await cli(quiet, [...labelSet, "  Checkout rework 🚀  "]);
  assert.equal(labeled.result.repoPath, siblingRoot);
  assert.equal(labeled.result.worktree.customLabel, "Checkout rework 🚀");
  assert.equal(labeled.result.worktree.displayName, "Checkout rework 🚀");
  assert.equal(labeled.result.worktree.branchName, "agent-worktree");
  assert.deepEqual(
    (await cli(quiet, [...labelSet, "Checkout rework 🚀"])).result,
    labeled.result,
    "setting the same label again is idempotent"
  );
  const viaSymlink = await cli(quiet, [
    "worktree",
    "label",
    "set",
    "--repo",
    link,
    "--label",
    "Checkout rework 🚀"
  ]);
  assert.equal(viaSymlink.result.repoPath, siblingRoot);
  const subdirectory = await cli(
    quiet,
    ["worktree", "label", "set", "--repo", nested, "--label", "Nested"],
    false,
    2
  );
  assert.equal(subdirectory.error.code, "invalid_target");
  const blank = await cli(quiet, [...labelSet, "   "], false, 2);
  assert.equal(blank.error.code, "invalid_request");
  const reset = await cli(quiet, ["worktree", "label", "reset", "--repo", siblingRoot]);
  assert.equal("customLabel" in reset.result.worktree, false);
  assert.equal(reset.result.worktree.displayName, "agent-worktree");
  assert.deepEqual(
    (await cli(quiet, ["worktree", "label", "reset", "--repo", siblingRoot])).result,
    reset.result,
    "resetting twice is idempotent"
  );
  assert.equal(processIds(quiet).length, 1, "labeling must reuse the running GUI");
  assert.equal(
    execFileSync("/usr/bin/git", ["-C", siblingRoot, "branch", "--show-current"], {
      encoding: "utf8"
    }).trim(),
    "agent-worktree",
    "labeling must not rename the branch"
  );
  results.push(
    "worktree label set/reset: exact root, trimmed Unicode, idempotent, subdirectory and blank rejected, branch unchanged"
  );

  await open(quiet, repo.path);
  const reviewPage = await selected(gui, repo.path, path.basename(repo.path));
  const review = (await cli(quiet, ["review", "inspect", "--repo", repo.path])).result;
  const worktreeReview = (await cli(quiet, ["review", "inspect", "--repo", sibling]))
    .result;
  assert.notEqual(review.contextId, worktreeReview.contextId);
  assert.notEqual(review.projectId, worktreeReview.projectId);
  const files = (
    await cli(quiet, ["review", "files", "--context", review.contextId, "--limit", "1"])
  ).result;
  assert.equal(files.total, 1);
  assert.equal(files.nextCursor, null);
  const file = (
    await cli(quiet, [
      "review",
      "file",
      "--context",
      review.contextId,
      "--path",
      files.files[0].path
    ])
  ).result;
  assert.equal(
    file.diffHash,
    files.files[0].diffHash,
    "file reads must use summary identity"
  );
  assert.equal(file.content.kind, "text");
  assert.match(file.content.patch, /after/);
  assert.ok(
    file.selectableRanges.additions.some((range) => range.start <= 1 && range.end >= 1),
    "packaged Node parser must expose source-line anchors"
  );
  const worktreeFile = (
    await cli(quiet, [
      "review",
      "file",
      "--context",
      worktreeReview.contextId,
      "--path",
      "tracked.txt"
    ])
  ).result;
  assert.match(worktreeFile.content.patch, /worktree/);
  assert.doesNotMatch(worktreeFile.content.patch, /after/);
  const commentBody = "Packaged human feedback: Révision 日本語";
  const created = await reviewPage.evaluate(
    async (input) => window.difftray.createReviewComment(input),
    {
      body: commentBody,
      displayedDiffHash: file.diffHash,
      lineStart: 1,
      lineEnd: 1,
      path: "tracked.txt",
      projectId: review.projectId,
      reviewTargetId: review.targetId,
      side: "additions"
    }
  );
  assert.equal(created.status, "created", "human UI API must accept summary diffHash");
  const feedback = (
    await cli(quiet, ["review", "feedback", "--context", review.contextId])
  ).result;
  assert.equal(feedback.total, 1);
  assert.equal(feedback.items[0].id, created.comment.id);
  assert.equal(feedback.items[0].body, commentBody);
  assert.equal(feedback.items[0].active, true);
  assert.equal(feedback.items[0].diffHash, file.diffHash);
  assert.equal(typeof feedback.feedbackVersion, "string");
  assert.equal(typeof feedback.noteVersion, "string");
  const otherFeedback = (
    await cli(quiet, ["review", "feedback", "--context", worktreeReview.contextId])
  ).result;
  assert.equal(
    otherFeedback.total,
    0,
    "feedback must stay isolated between linked worktrees"
  );
  const report = (
    await cli(quiet, [
      "review",
      "export",
      "--context",
      review.contextId,
      "--format",
      "prompt"
    ])
  ).result.content;
  assert.match(report, /Packaged human feedback: Révision 日本語/);
  assert.equal(
    await promptExport(quiet, review.contextId),
    report,
    "redirected prompt stdout must preserve exact report bytes"
  );
  const jsonReport = (
    await cli(quiet, [
      "review",
      "export",
      "--context",
      review.contextId,
      "--format",
      "json"
    ])
  ).result.content;
  assert.equal(jsonReport.contextId, review.contextId);
  assert.equal(jsonReport.items[0].id, created.comment.id);
  await open(quiet, sibling);
  await selected(gui, await realpath(sibling), path.basename(sibling));
  assert.equal(
    await promptExport(quiet, review.contextId),
    report,
    "GUI selection changes must preserve explicit-context export"
  );
  const jsonOnly = await runFile(
    launcher,
    ["review", "export", "--context", review.contextId, "--format", "json"],
    { cwd: fixture, env: quiet.env, timeout: 150_000 }
  );
  assert.equal(jsonOnly.stderr, "");
  assert.equal(JSON.parse(jsonOnly.stdout).result.content.contextId, review.contextId);
  await writeFile(path.join(repo.path, "tracked.txt"), "changed after inspection\n");
  const stale = await cli(
    quiet,
    ["review", "export", "--context", review.contextId, "--format", "json"],
    false,
    4
  );
  assert.equal(stale.error.code, "stale_review");
  assert.equal(
    (
      await cli(quiet, [
        "review",
        "file",
        "--context",
        worktreeReview.contextId,
        "--path",
        "tracked.txt"
      ])
    ).result.content.patch,
    worktreeFile.content.patch,
    "changing one worktree must not stale the other context"
  );
  await writeFile(path.join(repo.path, "tracked.txt"), "after\n");
  results.push(
    "packaged parser/read identities, human comment export, UTF-8 redirected stdout, linked-worktree isolation, GUI target independence, explicit stale-context failure"
  );

  const writeRepo = await repository(
    "agent writes",
    "old one\nold two\nold three\n",
    "new one\nnew two\nnew three\n"
  );
  const writes = await createProfile("full-scope-writes");
  const writeContext = (
    await cli(writes, ["review", "inspect", "--repo", writeRepo.path])
  ).result;
  const writeFileView = (
    await cli(writes, [
      "review",
      "file",
      "--context",
      writeContext.contextId,
      "--path",
      "tracked.txt"
    ])
  ).result;
  const actor = { name: "Packaged reviewer", runId: randomUUID() };
  const submission = {
    actor,
    requestId: randomUUID(),
    items: [
      {
        kind: "line",
        path: "tracked.txt",
        diffHash: writeFileView.diffHash,
        side: "additions",
        lineStart: 1,
        lineEnd: 1,
        body: "Single-line agent finding"
      },
      {
        kind: "line",
        path: "tracked.txt",
        diffHash: writeFileView.diffHash,
        side: "deletions",
        lineStart: 1,
        lineEnd: 2,
        body: "Multi-line agent finding"
      },
      {
        kind: "file",
        path: "tracked.txt",
        diffHash: writeFileView.diffHash,
        body: "File agent finding"
      },
      {
        kind: "overall",
        expectedNoteVersion: writeContext.noteVersion,
        body: "Overall agent finding"
      }
    ]
  };
  const inputPath = path.join(fixture, "full-scope-feedback.json");
  await writeFile(inputPath, JSON.stringify(submission));
  const submit = (success = true, expectedExitCode) =>
    cli(
      writes,
      ["feedback", "submit", "--context", writeContext.contextId, "--input", inputPath],
      success,
      expectedExitCode
    );
  await stop(writes);
  const receipt = (await submit()).result;
  assert.equal(receipt.deduplicated, false);
  assert.equal(receipt.itemIds.length, 4);
  const writesGui = await browser(writes);
  assert.equal(
    writesGui.contexts().flatMap((context) => context.pages()).length,
    0,
    "cold feedback submit must launch quietly without a GUI window"
  );
  const written = (
    await cli(writes, ["review", "feedback", "--context", writeContext.contextId])
  ).result;
  assert.equal(written.total, 4);
  assert.equal(new Set(written.items.map((item) => item.id)).size, 4);
  for (const item of written.items) {
    assert.equal(item.active, true);
    assert.deepEqual(item.lastEditedBy, { kind: "agent", ...actor });
    if (item.kind !== "overall")
      assert.deepEqual(item.createdBy, { kind: "agent", ...actor });
  }
  const writtenReport = await promptExport(writes, writeContext.contextId);
  for (const item of submission.items) assert.ok(writtenReport.includes(item.body));
  assert.ok(
    writtenReport.includes(actor.name),
    "prompt report must include agent display labels"
  );
  await open(writes, writeRepo.path);
  const attributedPage = await selected(
    writesGui,
    writeRepo.path,
    path.basename(writeRepo.path)
  );
  await attributedPage.locator('button[data-file-path="tracked.txt"]').click();
  await attributedPage.getByText("Single-line agent finding", { exact: true }).waitFor();
  await attributedPage.getByText("Multi-line agent finding", { exact: true }).waitFor();
  await attributedPage
    .getByRole("group", { name: "File comments" })
    .getByText(`Agent: ${actor.name}`, { exact: true })
    .waitFor();
  await attributedPage
    .getByText(`Last edited by agent: ${actor.name}`, { exact: true })
    .waitFor();
  await until(
    async () =>
      (await attributedPage
        .getByText(`Agent: ${actor.name}`, { exact: true })
        .count()) === 3,
    "desktop line, range and file creator labels"
  );
  await attributedPage.screenshot({
    path: path.join(evidence, "cli-attributed-feedback.png")
  });
  const verifyReplay = async () => {
    assert.deepEqual((await submit()).result, { ...receipt, deduplicated: true });
    const afterRetry = (
      await cli(writes, ["review", "feedback", "--context", writeContext.contextId])
    ).result;
    assert.deepEqual(
      afterRetry,
      written,
      "receipt replay must not duplicate rows or bump note/feedback revisions"
    );
  };
  await verifyReplay();
  await stop(writes);
  await verifyReplay();
  await writeFile(
    path.join(writeRepo.path, "tracked.txt"),
    "source changed after successful submission\n"
  );
  assert.deepEqual(
    (await submit()).result,
    { ...receipt, deduplicated: true },
    "committed retry must precede code freshness checks"
  );
  await writeFile(inputPath, JSON.stringify({ ...submission, requestId: randomUUID() }));
  assert.equal((await submit(false, 4)).error.code, "stale_review");
  await writeFile(
    inputPath,
    JSON.stringify({
      ...submission,
      items: submission.items.map((item, index) =>
        index === 0 ? { ...item, body: "Different payload under same key" } : item
      )
    })
  );
  assert.equal(
    (await submit(false, 4)).error.code,
    "idempotency_conflict",
    "same-key payload conflict must precede stale context checks"
  );
  await writeFile(inputPath, JSON.stringify(submission));
  const refreshed = (await cli(writes, ["review", "inspect", "--repo", writeRepo.path]))
    .result;
  const retained = (
    await cli(writes, [
      "review",
      "feedback",
      "--context",
      refreshed.contextId,
      "--include-inactive"
    ])
  ).result;
  assert.equal(retained.total, 4, "stale writes must retain existing findings");
  const freshFile = (
    await cli(writes, [
      "review",
      "file",
      "--context",
      refreshed.contextId,
      "--path",
      "tracked.txt"
    ])
  ).result;
  const independent = {
    actor: { ...actor, runId: randomUUID() },
    requestId: submission.requestId,
    items: [
      {
        kind: "file",
        path: "tracked.txt",
        diffHash: freshFile.diffHash,
        body: "Independent run finding"
      }
    ]
  };
  const independentPath = path.join(fixture, "independent-run.json");
  await writeFile(independentPath, JSON.stringify(independent));
  const independentReceipt = (
    await cli(writes, [
      "feedback",
      "submit",
      "--context",
      refreshed.contextId,
      "--input",
      independentPath
    ])
  ).result;
  assert.equal(independentReceipt.deduplicated, false);
  assert.ok(!receipt.itemIds.includes(independentReceipt.itemIds[0]));
  await open(writes, writeRepo.path);
  const editGui = await browser(writes);
  const editPage = await selected(editGui, writeRepo.path, path.basename(writeRepo.path));
  const humanNote = await editPage.evaluate(
    (input) => window.difftray.saveReviewNote(input),
    {
      projectId: refreshed.projectId,
      reviewTargetId: refreshed.targetId,
      body: "Human note edited after agent inspection"
    }
  );
  assert.equal(humanNote.status, "saved");
  const beforeCas = (
    await cli(writes, [
      "review",
      "feedback",
      "--context",
      refreshed.contextId,
      "--include-inactive"
    ])
  ).result;
  const casPath = path.join(fixture, "note-cas-conflict.json");
  await writeFile(
    casPath,
    JSON.stringify({
      actor,
      requestId: randomUUID(),
      items: [
        {
          kind: "file",
          path: "tracked.txt",
          diffHash: freshFile.diffHash,
          body: "Must roll back with note conflict"
        },
        {
          kind: "overall",
          expectedNoteVersion: refreshed.noteVersion,
          body: "Must not overwrite human note"
        }
      ]
    })
  );
  const conflict = await cli(
    writes,
    ["feedback", "submit", "--context", refreshed.contextId, "--input", casPath],
    false,
    4
  );
  assert.equal(conflict.error.code, "note_conflict");
  const afterCas = (
    await cli(writes, [
      "review",
      "feedback",
      "--context",
      refreshed.contextId,
      "--include-inactive"
    ])
  ).result;
  assert.deepEqual(
    afterCas,
    beforeCas,
    "note CAS failure must roll back the entire batch and revisions"
  );
  assert.ok(
    (await promptExport(writes, refreshed.contextId)).includes(
      "Human note edited after agent inspection"
    )
  );
  results.push(
    "cold full-scope attributed writes, exact replay without revision changes, persisted restart receipts, replay before stale checks, independent runs, atomic human note CAS conflict"
  );

  for (let round = 0; round < 5; round += 1) {
    const concurrent = await createProfile(`cold-contention-${round}`);
    const replies = await Promise.all(
      Array.from({ length: 3 }, () => cli(concurrent, ["doctor"]))
    );
    assert.equal(new Set(replies.map((reply) => reply.result.instanceId)).size, 1);
    assert.equal(processIds(concurrent).length, 1);
    await stop(concurrent);
  }
  results.push("five repeated three-caller cold starts share exactly one GUI process");
  const alpha = await createProfile("alpha-like");
  const cold = await Promise.all([
    cli(alpha, ["doctor"]),
    cli(alpha, ["doctor"]),
    open(alpha, sibling)
  ]);
  assert.equal(
    new Set(cold.slice(0, 2).map((response) => response.result.instanceId)).size,
    1
  );
  assert.equal(
    processIds(alpha).length,
    1,
    "concurrent cold callers must share one GUI process"
  );
  assert.notEqual(cold[0].result.instanceId, hello.result.instanceId);
  const alphaGui = await browser(alpha);
  await selected(alphaGui, await realpath(sibling), path.basename(sibling));
  results.push(
    "concurrent cold launch and independent production-like/alpha-like profiles (same unsigned bundle)"
  );

  const oldMetadata = await readFile(alpha.endpoint, "utf8");
  await stop(alpha, "SIGKILL");
  assert.equal(
    await readFile(alpha.endpoint, "utf8"),
    oldMetadata,
    "crash must retain stale generation metadata"
  );
  // A controlled old-generation listener holds the caller after it has cached the
  // retained metadata. Publish a real replacement before releasing unauthorized.
  const oldEndpoint = JSON.parse(oldMetadata);
  await rm(oldEndpoint.socketPath, { force: true });
  let releaseOldHello;
  const cachedHello = new Promise((resolve) => {
    releaseOldHello = resolve;
  });
  const staleServer = net.createServer((socket) => {
    fixtureSockets.push(socket);
    socket.once("data", (data) =>
      releaseOldHello({ socket, request: JSON.parse(data.toString("utf8")) })
    );
  });
  fixtureSockets.push(staleServer);
  await new Promise((resolve) => staleServer.listen(oldEndpoint.socketPath, resolve));
  await chmod(oldEndpoint.socketPath, 0o600);
  const recovering = cli(alpha, ["doctor"]);
  const cached = await Promise.race([
    cachedHello,
    recovering.then(() => {
      throw new Error("Recovery skipped controlled old-generation listener");
    })
  ]);
  assert.equal(
    cached.request.token,
    oldEndpoint.token,
    "caller must cache the old generation"
  );
  staleServer.close();
  await rm(oldEndpoint.socketPath, { force: true });
  const replacement = spawn(executablePath, ["--agent-background"], {
    cwd: fixture,
    env: alpha.env,
    stdio: "ignore"
  });
  children.push({
    close: async () => {
      if (replacement.exitCode === null) replacement.kill("SIGTERM");
    }
  });
  const published = await until(async () => {
    try {
      const endpoint = JSON.parse(await readFile(alpha.endpoint, "utf8"));
      return endpoint.instanceId !== oldEndpoint.instanceId && endpoint;
    } catch {
      return undefined;
    }
  }, "replacement generation publication");
  await new Promise((resolve, reject) => {
    const probe = net.createConnection(published.socketPath);
    probe.once("connect", () => {
      probe.destroy();
      resolve();
    });
    probe.once("error", reject);
  });
  cached.socket.end(
    `${JSON.stringify({ version: 1, id: cached.request.id, ok: false, error: { code: "unauthorized", message: "Old fixture generation", retryable: false } })}\n`
  );
  const recovered = await recovering;
  assert.equal(recovered.result.instanceId, published.instanceId);
  assert.equal(processIds(alpha).length, 1);
  results.push(
    "deterministic crash recovery: cached old generation, replacement listener before publication, one refresh and one profile process"
  );

  const current = JSON.parse(await readFile(alpha.endpoint, "utf8"));
  const original = JSON.stringify(current);
  await writeFile(alpha.endpoint, JSON.stringify({ ...current, token: "f".repeat(64) }));
  await chmod(alpha.endpoint, 0o600);
  try {
    const pids = processIds(alpha);
    const deniedAt = Date.now();
    const denied = await cli(alpha, ["doctor"], false);
    assert.ok(
      Date.now() - deniedAt < 5_000,
      "stable invalid token must terminate promptly"
    );
    assert.equal(denied.error.code, "unauthorized");
    assert.deepEqual(processIds(alpha), pids, "invalid token must not relaunch the GUI");
  } finally {
    await writeFile(alpha.endpoint, original);
    await chmod(alpha.endpoint, 0o600);
  }
  results.push("stable invalid token fails without relaunch");

  await stop(quiet);
  const warm = await electron.launch({
    executablePath,
    env: quiet.env,
    cwd: fixture,
    args: ["--agent-background"]
  });
  children.push(warm);
  await open(quiet, repo.path);
  const focused = await warm.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    return { visible: window?.isVisible(), focused: window?.isFocused() };
  });
  assert.deepEqual(
    focused,
    { visible: true, focused: true },
    "open must foreground the requested repository"
  );
  results.push("clean shutdown/restart and foreground focus");
  const matrix = {
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
    until,
    launcher
  };
  await runReadMatrix(matrix);
  await runWriteMatrix(matrix);
  await runInvalidationMatrix(matrix);
  await runCompatMatrix(matrix);
  await writeFile(
    path.join(evidence, "cli-e2e.json"),
    JSON.stringify({ result: "passed", scenarios: results }, null, 2)
  );
  console.log(JSON.stringify({ result: "passed", scenarios: results }, null, 2));
}
let deadline;
try {
  await Promise.race([
    runMatrix(),
    new Promise((_, reject) => {
      deadline = setTimeout(() => {
        const error = new Error("CLI process acceptance exceeded its 10-minute deadline");
        controller.abort(error);
        reject(error);
      }, 600_000);
    })
  ]);
} finally {
  clearTimeout(deadline);
  for (const socket of fixtureSockets) {
    if (typeof socket.destroy === "function") socket.destroy();
    else
      socket.close((error) => {
        if (error && error.code !== "ERR_SERVER_NOT_RUNNING")
          cleanupFailures.push("Fixture listener cleanup failed");
      });
  }
  for (const child of children) await cleanup(() => child.close());
  for (const profile of profiles) await cleanup(() => stop(profile));
  for (const connected of browsers) await cleanup(() => connected.close());
  for (const profile of profiles) {
    await cleanup(async () => {
      if (!processIds(profile).length)
        await rm(profile.directory, { recursive: true, force: true });
    });
  }
  await cleanup(() => rm(fixture, { recursive: true, force: true }));
  await cleanup(() => bundle.cleanup());
}
if (cleanupFailures.length) throw new Error(cleanupFailures.join("; "));
