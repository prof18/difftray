import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  symlink
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { prepareCliTestBundle } from "./cli-test-bundle.mjs";

const { values } = parseArgs({ options: { app: { type: "string" } } });
const bundle = await prepareCliTestBundle(values.app);
const suppliedApp = values.app ? path.resolve(values.app) : undefined;
const isInstalledApp = (candidate) =>
  candidate?.startsWith("/Applications/") ||
  candidate?.startsWith(path.join(process.env.HOME ?? "", "Applications") + path.sep);
if (values.app && (isInstalledApp(suppliedApp) || isInstalledApp(bundle.appPath))) {
  throw new Error("--app must be a test bundle, not an installed Applications app.");
}
const fixture = await mkdtemp(path.join(tmpdir(), "difftray cli smoke "));
let mountedDmg = false;
try {
  const launcher = path.join(bundle.appPath, "Contents/Resources/bin/difftray");
  assert.ok((await stat(launcher)).mode & 0o111, "Launcher must be executable");
  const rootRequire = createRequire(new URL("../../../package.json", import.meta.url));
  const builderRequire = createRequire(rootRequire.resolve("electron-builder"));
  const appBuilderRequire = createRequire(builderRequire.resolve("app-builder-lib"));
  const { getCurrentFuseWire, FuseV1Options } = appBuilderRequire("@electron/fuses");
  const { FuseState } = appBuilderRequire("@electron/fuses/dist/constants.js");
  const fuseWire = await getCurrentFuseWire(bundle.appPath);
  assert.equal(fuseWire[FuseV1Options.RunAsNode], FuseState.ENABLE);
  const env = {
    ...process.env,
    PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
    DIFFTRAY_USER_DATA_DIR: path.join(fixture, "profile")
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_OPTIONS;
  const run = (command, args) =>
    execFileSync(command, args, {
      cwd: fixture,
      env,
      encoding: "utf8",
      timeout: 10_000,
      stdio: ["ignore", "pipe", "pipe"]
    });
  const checkLauncher = async (appPath) => {
    const checkedLauncher = path.join(appPath, "Contents/Resources/bin/difftray");
    assert.ok((await stat(checkedLauncher)).mode & 0o111, "Launcher must be executable");
    const checkedVersion = JSON.parse(run(checkedLauncher, ["--version", "--json"]));
    assert.equal(checkedVersion.protocolVersion, 1);
    assert.equal(checkedVersion.bundlePath, await realpath(appPath));
    assert.equal(checkedVersion.cliVersion, checkedVersion.appVersion);
    assert.match(checkedVersion.appVersion, /^\d+\.\d+\.\d+/);
    assert.equal(checkedVersion.cwd, await realpath(fixture));
    assert.ok(checkedVersion.runtime.electron);
    assert.ok(checkedVersion.runtime.node);
    assert.equal(
      run(checkedLauncher, ["--version"]),
      `Difftray ${checkedVersion.appVersion} (CLI protocol 1)\n`
    );
    return checkedVersion;
  };
  const version = await checkLauncher(bundle.appPath);
  const link = path.join(fixture, "difftray link");
  await symlink(launcher, link);
  assert.deepEqual(JSON.parse(run(link, ["--version", "--json"])), version);
  assert.match(run(launcher, ["--help"]), /Difftray/);
  assert.throws(() => run(launcher, ["--version", "$(touch unexpected)"]));

  // All copies and archives below are made from the explicit test bundle.
  const ownedApp = path.join(fixture, "owned with spaces/Difftray.app");
  await mkdir(path.dirname(ownedApp), { recursive: true });
  await cp(bundle.appPath, ownedApp, { recursive: true, verbatimSymlinks: true });
  assert.ok(
    (
      await realpath(
        path.join(
          ownedApp,
          "Contents/Frameworks/Electron Framework.framework/Electron Framework"
        )
      )
    ).startsWith(await realpath(ownedApp)),
    "Copied framework symlinks must remain inside the owned bundle"
  );
  await checkLauncher(ownedApp);
  const movedApp = path.join(fixture, "moved app/Difftray.app");
  await mkdir(path.dirname(movedApp), { recursive: true });
  await rename(ownedApp, movedApp);
  await checkLauncher(movedApp);
  const staleLink = path.join(fixture, "old terminal link");
  await symlink(path.join(ownedApp, "Contents/Resources/bin/difftray"), staleLink);
  assert.throws(
    () => run(staleLink, ["--version"]),
    "Moved app leaves an old fixed-target link stale"
  );
  await rm(staleLink);
  await symlink(path.join(movedApp, "Contents/Resources/bin/difftray"), staleLink);
  assert.equal(
    JSON.parse(run(staleLink, ["--version", "--json"])).bundlePath,
    await realpath(movedApp)
  );

  const oldGeneration = path.join(fixture, "old generation/Difftray.app");
  await mkdir(path.dirname(oldGeneration), { recursive: true });
  await rename(movedApp, oldGeneration);
  await cp(bundle.appPath, movedApp, { recursive: true, verbatimSymlinks: true });
  assert.notEqual((await stat(oldGeneration)).ino, (await stat(movedApp)).ino);
  assert.equal(
    JSON.parse(run(staleLink, ["--version", "--json"])).bundlePath,
    await realpath(movedApp)
  );
  await checkLauncher(movedApp);

  const publicRoot = path.resolve(import.meta.dirname, "../../..");
  const archiveOutput = path.join(fixture, "archive output");
  const archiveEnv = {
    ...process.env,
    CSC_IDENTITY_AUTO_DISCOVERY: "false",
    DIFFTRAY_RELEASE_CHANNEL: "production",
    DIFFTRAY_SKIP_NOTARIZE: "1"
  };
  execFileSync(
    "pnpm",
    [
      "exec",
      "electron-builder",
      "--config",
      "electron-builder.config.cjs",
      "--prepackaged",
      movedApp,
      "--mac",
      "zip",
      "dmg",
      `--${process.arch}`,
      "--publish",
      "never",
      "--config.mac.identity=null",
      `--config.directories.output=${archiveOutput}`
    ],
    { cwd: publicRoot, env: archiveEnv, stdio: "inherit", timeout: 300_000 }
  );
  const artifacts = await readdir(archiveOutput);
  const artifact = (extension) => {
    const matches = artifacts.filter((entry) => entry.endsWith(extension));
    assert.equal(
      matches.length,
      1,
      `Expected one ${extension} artifact, got ${matches.join(", ")}`
    );
    return path.join(archiveOutput, matches[0]);
  };
  const zip = artifact(".zip");
  const dmg = artifact(".dmg");
  const extracted = path.join(fixture, "zip contents");
  await rm(extracted, { recursive: true, force: true });
  execFileSync("/usr/bin/ditto", ["-x", "-k", zip, extracted], { timeout: 120_000 });
  const zipApp = path.join(extracted, "Difftray.app");
  await checkLauncher(zipApp);
  const relocatedZipApp = path.join(fixture, "relocated zip/Difftray.app");
  await mkdir(path.dirname(relocatedZipApp), { recursive: true });
  await rename(zipApp, relocatedZipApp);
  await checkLauncher(relocatedZipApp);

  const mountPoint = path.join(fixture, "dmg mount");
  await mkdir(mountPoint);
  try {
    execFileSync(
      "/usr/bin/hdiutil",
      ["attach", "-readonly", "-nobrowse", "-noverify", "-mountpoint", mountPoint, dmg],
      {
        timeout: 120_000,
        stdio: ["ignore", "pipe", "pipe"]
      }
    );
    mountedDmg = true;
    await checkLauncher(path.join(mountPoint, "Difftray.app"));
  } finally {
    if (mountedDmg) {
      execFileSync("/usr/bin/hdiutil", ["detach", mountPoint], {
        timeout: 120_000,
        stdio: ["ignore", "pipe", "pipe"]
      });
      mountedDmg = false;
    }
  }
  console.log(
    JSON.stringify(
      { app: bundle.appPath, result: "passed", runtime: version.runtime },
      null,
      2
    )
  );
} finally {
  try {
    if (!mountedDmg) await rm(fixture, { recursive: true, force: true });
    else console.error(`Mounted test DMG retained for manual detach: ${fixture}`);
  } finally {
    await bundle.cleanup();
  }
}
