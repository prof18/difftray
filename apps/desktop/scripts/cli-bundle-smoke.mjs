import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, realpath, rm, stat, symlink } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { prepareCliTestBundle } from "./cli-test-bundle.mjs";

const { values } = parseArgs({ options: { app: { type: "string" } } });
const bundle = await prepareCliTestBundle(values.app);
const fixture = await mkdtemp(path.join(tmpdir(), "difftray cli smoke "));
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
  const version = JSON.parse(run(launcher, ["--version", "--json"]));
  assert.equal(version.protocolVersion, 1);
  assert.match(version.appVersion, /^\d+\.\d+\.\d+/);
  assert.equal(version.cwd, await realpath(fixture));
  assert.ok(version.runtime.electron);
  assert.ok(version.runtime.node);
  assert.equal(
    run(launcher, ["--version"]),
    `Difftray ${version.appVersion} (CLI protocol 1)\n`
  );
  const link = path.join(fixture, "difftray link");
  await symlink(launcher, link);
  assert.deepEqual(JSON.parse(run(link, ["--version", "--json"])), version);
  assert.match(run(launcher, ["--help"]), /Difftray/);
  assert.throws(() => run(launcher, ["--version", "$(touch unexpected)"]));
  console.log(
    JSON.stringify(
      { app: bundle.appPath, result: "passed", runtime: version.runtime },
      null,
      2
    )
  );
} finally {
  await rm(fixture, { recursive: true, force: true });
  await bundle.cleanup();
}
