import assert from "node:assert/strict";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  chmodSync,
  rmSync,
  existsSync,
  realpathSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const source = path.join(root, "integrations/agents");
const temporary = mkdtempSync(path.join(tmpdir(), "difftray-agent-package-"));
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const inside = (parent, relative) => {
  const resolved = path.resolve(parent, relative);
  assert.ok(resolved.startsWith(`${parent}${path.sep}`), `${relative} escapes ${parent}`);
  assert.ok(existsSync(resolved), `Missing ${resolved}`);
  return resolved;
};

try {
  const copiedRoot = path.join(temporary, "checkout");
  const agents = path.join(copiedRoot, "integrations/agents");
  mkdirSync(path.join(copiedRoot, ".agents/plugins"), { recursive: true });
  cpSync(
    path.join(root, ".agents/plugins/marketplace.json"),
    path.join(copiedRoot, ".agents/plugins/marketplace.json")
  );
  cpSync(source, agents, { recursive: true });
  const plugin = path.join(agents, "difftray");
  const codex = readJson(path.join(plugin, ".codex-plugin/plugin.json"));
  const claude = readJson(path.join(plugin, ".claude-plugin/plugin.json"));
  const pi = readJson(path.join(plugin, "package.json"));
  assert.equal(codex.name, "difftray");
  assert.equal(codex.version, "0.1.0");
  assert.equal(codex.skills, "./skills/");
  assert.equal(inside(plugin, codex.skills), path.join(plugin, "skills"));
  assert.equal(claude.name, "difftray");
  assert.equal(claude.version, "0.1.0");
  assert.deepEqual(pi.pi.skills, ["./skills"]);
  assert.equal(inside(plugin, pi.pi.skills[0]), path.join(plugin, "skills"));
  for (const file of ["SKILL.md", "scripts/difftray", "references/commands.md"])
    inside(path.join(plugin, "skills/difftray"), file);
  const claudeCatalog = readJson(path.join(agents, ".claude-plugin/marketplace.json"));
  assert.equal(claudeCatalog.name, "difftray-local");
  assert.equal(inside(agents, claudeCatalog.plugins[0].source), plugin);
  const codexCatalog = readJson(
    path.join(copiedRoot, ".agents/plugins/marketplace.json")
  );
  assert.equal(codexCatalog.name, "difftray-local");
  assert.equal(inside(copiedRoot, codexCatalog.plugins[0].source.path), plugin);

  const app = path.join(temporary, "Custom $`' app.app");
  const contents = path.join(app, "Contents");
  mkdirSync(path.join(contents, "Resources/bin"), { recursive: true });
  mkdirSync(path.join(contents, "MacOS"), { recursive: true });
  writeFileSync(
    path.join(contents, "Info.plist"),
    `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.prof18.difftray</string><key>CFBundleExecutable</key><string>Difftray</string></dict></plist>`
  );
  const capture = path.join(temporary, "args.json");
  writeFileSync(
    path.join(contents, "Resources/bin/difftray"),
    `#!/bin/sh\nprintf '%s\\0' "$PWD" "$@" > "${capture}"\n`
  );
  chmodSync(path.join(contents, "Resources/bin/difftray"), 0o755);
  writeFileSync(path.join(contents, "MacOS/Difftray"), "#!/bin/sh\nexit 99\n");
  chmodSync(path.join(contents, "MacOS/Difftray"), 0o755);
  writeFileSync(path.join(contents, "Resources/app.asar"), "stub");
  const resolver = path.join(plugin, "skills/difftray/scripts/difftray");
  const argv = [
    "--json",
    "a b",
    "quote'",
    "dollar$()",
    "semi;colon",
    "line\nbreak",
    "*?[x]"
  ];
  const cwd = temporary;
  const success = spawnSync(resolver, argv, {
    cwd,
    env: { ...process.env, DIFFTRAY_APP_PATH: app },
    encoding: "utf8"
  });
  assert.equal(success.status, 0, success.stderr);
  assert.deepEqual(readFileSync(capture, "utf8").split("\0").slice(0, -1), [
    realpathSync(cwd),
    ...argv
  ]);
  const invalid = spawnSync(resolver, ["doctor"], {
    cwd,
    env: { ...process.env, DIFFTRAY_APP_PATH: path.join(temporary, "missing.app") },
    encoding: "utf8"
  });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /Difftray app|bundle/i);
  const fakePath = path.join(temporary, "fake-path");
  mkdirSync(fakePath);
  writeFileSync(path.join(fakePath, "difftray"), "#!/bin/sh\nexit 77\n");
  chmodSync(path.join(fakePath, "difftray"), 0o755);
  const noPathShadow = spawnSync(resolver, ["--version"], {
    cwd,
    env: { ...process.env, PATH: fakePath, DIFFTRAY_APP_PATH: app },
    encoding: "utf8"
  });
  assert.equal(noPathShadow.status, 0, noPathShadow.stderr);
  writeFileSync(
    path.join(contents, "Info.plist"),
    `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>other.app</string><key>CFBundleExecutable</key><string>Difftray</string></dict></plist>`
  );
  const wrongId = spawnSync(resolver, ["--version"], {
    cwd,
    env: { ...process.env, DIFFTRAY_APP_PATH: app },
    encoding: "utf8"
  });
  assert.notEqual(wrongId.status, 0);
  assert.match(wrongId.stderr, /bundle identifier/);
  writeFileSync(
    path.join(contents, "Info.plist"),
    `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.prof18.difftray.dev</string><key>CFBundleExecutable</key><string>Difftray</string></dict></plist>`
  );
  const alphaOverride = spawnSync(resolver, ["--version"], {
    cwd,
    env: { ...process.env, DIFFTRAY_APP_PATH: app },
    encoding: "utf8"
  });
  assert.equal(alphaOverride.status, 0, alphaOverride.stderr);
  rmSync(path.join(contents, "MacOS/Difftray"));
  const missingExecutable = spawnSync(resolver, ["--version"], {
    cwd,
    env: { ...process.env, DIFFTRAY_APP_PATH: app },
    encoding: "utf8"
  });
  assert.notEqual(missingExecutable.status, 0);
  assert.match(missingExecutable.stderr, /bundle executable/);

  // Only the fixed discovery roots are rewritten in a copied script, never in the
  // production resolver. This keeps the test isolated from installed applications.
  const isolatedResolver = path.join(temporary, "resolver-defaults");
  const systemApp = path.join(temporary, "system/Difftray.app");
  const userApp = path.join(temporary, "home/Applications/Difftray.app");
  mkdirSync(path.dirname(systemApp), { recursive: true });
  mkdirSync(path.dirname(userApp), { recursive: true });
  cpSync(app, systemApp, { recursive: true });
  cpSync(app, userApp, { recursive: true });
  for (const candidate of [systemApp, userApp]) {
    writeFileSync(
      path.join(candidate, "Contents/MacOS/Difftray"),
      "#!/bin/sh\nexit 99\n"
    );
    chmodSync(path.join(candidate, "Contents/MacOS/Difftray"), 0o755);
  }
  const systemCapture = path.join(temporary, "system-selection");
  const userCapture = path.join(temporary, "user-selection");
  writeFileSync(
    path.join(systemApp, "Contents/Resources/bin/difftray"),
    `#!/bin/sh\necho system > "${systemCapture}"\n`
  );
  writeFileSync(
    path.join(userApp, "Contents/Resources/bin/difftray"),
    `#!/bin/sh\necho user > "${userCapture}"\n`
  );
  let copiedSource = readFileSync(resolver, "utf8");
  copiedSource = copiedSource
    .replaceAll("$HOME/Applications/Difftray.app", "__USER_APP_ROOT__")
    .replaceAll("/Applications/Difftray.app", systemApp)
    .replaceAll("__USER_APP_ROOT__", userApp);
  writeFileSync(isolatedResolver, copiedSource);
  chmodSync(isolatedResolver, 0o755);
  const withoutOverride = { ...process.env };
  delete withoutOverride.DIFFTRAY_APP_PATH;
  const discoveredAlphaSystem = spawnSync(isolatedResolver, [], {
    cwd,
    env: withoutOverride,
    encoding: "utf8"
  });
  assert.notEqual(
    discoveredAlphaSystem.status,
    0,
    "Alpha must not be discovered from the system default"
  );
  assert.match(discoveredAlphaSystem.stderr, /bundle identifier|Alpha|explicit/i);
  assert.ok(!existsSync(systemCapture));
  rmSync(systemApp, { recursive: true });
  const discoveredAlphaUser = spawnSync(isolatedResolver, [], {
    cwd,
    env: withoutOverride,
    encoding: "utf8"
  });
  assert.notEqual(
    discoveredAlphaUser.status,
    0,
    "Alpha must not be discovered from the user default"
  );
  assert.match(discoveredAlphaUser.stderr, /bundle identifier|Alpha|explicit/i);
  assert.ok(!existsSync(userCapture));
  cpSync(userApp, systemApp, { recursive: true });
  writeFileSync(
    path.join(systemApp, "Contents/Resources/bin/difftray"),
    `#!/bin/sh\necho system > "${systemCapture}"\n`
  );
  for (const candidate of [systemApp, userApp]) {
    writeFileSync(
      path.join(candidate, "Contents/Info.plist"),
      `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.prof18.difftray</string><key>CFBundleExecutable</key><string>Difftray</string></dict></plist>`
    );
  }
  const defaultSystem = spawnSync(isolatedResolver, [], {
    cwd,
    env: withoutOverride,
    encoding: "utf8"
  });
  assert.equal(defaultSystem.status, 0, defaultSystem.stderr);
  assert.ok(existsSync(systemCapture));
  assert.ok(!existsSync(userCapture));
  rmSync(systemApp, { recursive: true });
  const defaultUser = spawnSync(isolatedResolver, [], {
    cwd,
    env: withoutOverride,
    encoding: "utf8"
  });
  assert.equal(defaultUser.status, 0, defaultUser.stderr);
  assert.ok(existsSync(userCapture));
  console.log("Agent package smoke passed");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
