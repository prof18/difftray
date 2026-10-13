import assert from "node:assert/strict";
import { execFile, execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
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

const runFile = promisify(execFile);
const { values } = parseArgs({ options: { app: { type: "string" } } });
const bundle = await prepareCliTestBundle(values.app);
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
async function cli(profile, args, success = true) {
  let output;
  try {
    output = await runFile(launcher, [...args, "--json"], {
      cwd: fixture,
      env: profile.env,
      timeout: 150_000,
      maxBuffer: 1024 * 1024
    });
  } catch (error) {
    assert.equal(success, false, `CLI failed: ${error.stderr}`);
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
async function browser(profile) {
  const connected = await until(async () => {
    try {
      return await chromium.connectOverCDP(`http://127.0.0.1:${profile.port}`);
    } catch {
      return undefined;
    }
  }, "isolated GUI debugging endpoint");
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
async function repository(name) {
  const repo = path.join(fixture, name);
  await mkdir(repo);
  const git = (args) =>
    execFileSync("/usr/bin/git", ["-C", repo, ...args], { stdio: "pipe" });
  git(["init", "-b", "main"]);
  git(["config", "user.name", "CLI smoke"]);
  git(["config", "user.email", "smoke@example.invalid"]);
  await writeFile(path.join(repo, "tracked.txt"), "before\n");
  git(["add", "."]);
  git(["commit", "-m", "fixture"]);
  await writeFile(path.join(repo, "tracked.txt"), "after\n");
  return { path: await realpath(repo), git };
}
try {
  await mkdir(evidence, { recursive: true });
  const repo = await repository("repo with 'quotes'");
  const sibling = path.join(fixture, "linked worktree");
  repo.git(["worktree", "add", "-b", "agent-worktree", sibling]);
  await writeFile(path.join(sibling, "tracked.txt"), "worktree\n");
  const nested = path.join(sibling, "nested");
  await mkdir(nested);
  const link = path.join(fixture, "symlinked worktree");
  await symlink(sibling, link);
  const quiet = await createProfile("production-like");
  const hello = await cli(quiet, ["doctor"]);
  assert.equal(hello.result.profilePath, quiet.path);
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
  await writeFile(
    path.join(evidence, "cli-e2e.json"),
    JSON.stringify({ result: "passed", scenarios: results }, null, 2)
  );
  console.log(JSON.stringify({ result: "passed", scenarios: results }, null, 2));
} finally {
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
