import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
const roots: string[] = [];
afterEach(() =>
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }))
);
function fixture(id = "com.prof18.difftray") {
  const root = mkdtempSync(path.join(os.tmpdir(), "launcher test "));
  roots.push(root);
  const app = path.join(root, "Custom Name.app");
  const contents = path.join(app, "Contents");
  const launcher = path.join(contents, "Resources/bin/difftray");
  const executable = path.join(contents, "MacOS/Difftray");
  mkdirSync(path.dirname(launcher), { recursive: true });
  mkdirSync(path.dirname(executable), { recursive: true });
  copyFileSync("resources/bin/difftray", launcher);
  writeFileSync(
    executable,
    '#!/bin/sh\nprintf "%s\\n" "$ELECTRON_RUN_AS_NODE" "$PWD" "$@"\n',
    { mode: 0o755 }
  );
  const plist = path.join(contents, "Info.plist");
  writeFileSync(
    plist,
    JSON.stringify({ CFBundleIdentifier: id, CFBundleExecutable: "Difftray" })
  );
  execFileSync("/usr/bin/plutil", ["-convert", "xml1", plist]);
  const run = (target = launcher) =>
    spawnSync(target, ["doctor", "--json"], {
      cwd: root,
      env: { PATH: "/usr/bin:/bin:/usr/sbin:/sbin" },
      encoding: "utf8"
    });
  return { root, app, launcher, executable, run };
}
it("keeps cwd and argv through spaces, a symlink, and bundle relocation without Node", () => {
  const f = fixture();
  const moved = path.join(f.root, "New Location.app");
  renameSync(f.app, moved);
  const link = path.join(f.root, "terminal link");
  symlinkSync(path.join(moved, "Contents/Resources/bin/difftray"), link);
  const result = f.run(link);
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  expect(result.stdout).toContain(`1\n${f.root.replace(/^\/var\//, "/private/var/")}\n`);
  expect(result.stdout).toContain(
    "New Location.app/Contents/Resources/app.asar/dist/cli/index.cjs\ndoctor\n--json\n"
  );
});
it.each(["com.prof18.difftray", "com.prof18.difftray.dev"])(
  "accepts native channel identity %s",
  (id) => {
    expect(fixture(id).run().status).toBe(0);
  }
);
it("rejects another native application before executing it", () => {
  const result = fixture("com.unrelated.app").run();
  expect(result.status).toBe(3);
  expect(result.stdout).toBe("");
});
it("reports a missing or non-executable bundle binary as unavailable", () => {
  const f = fixture();
  chmodSync(f.executable, 0o644);
  expect(f.run().status).toBe(3);
  rmSync(f.executable);
  expect(f.run().status).toBe(3);
});
