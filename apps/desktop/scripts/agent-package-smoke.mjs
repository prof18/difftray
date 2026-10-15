import assert from "node:assert/strict";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  chmodSync,
  statSync,
  symlinkSync,
  rmSync,
  existsSync,
  realpathSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const source = path.join(root, "integrations/agents/difftray/skills/difftray");
const temporary = mkdtempSync(path.join(tmpdir(), "difftray-agent-package-"));
const inside = (parent, relative) => {
  const resolved = path.resolve(parent, relative);
  assert.ok(resolved.startsWith(`${parent}${path.sep}`), `${relative} escapes ${parent}`);
  assert.ok(existsSync(resolved), `Missing ${resolved}`);
  return resolved;
};

try {
  const copiedRoot = path.join(temporary, "checkout");
  const skill = path.join(copiedRoot, "skills/difftray");
  cpSync(source, skill, { recursive: true });
  for (const file of ["SKILL.md", "scripts/difftray", "references/commands.md"])
    inside(skill, file);
  const skillSource = readFileSync(path.join(skill, "SKILL.md"), "utf8");
  assert.match(skillSource, /Difftray/);
  assert.match(skillSource, /\[commands\.md\]\(references\/commands\.md\)/);
  assert.notEqual(statSync(path.join(skill, "scripts/difftray")).mode & 0o111, 0);

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
  const resolver = path.join(skill, "scripts/difftray");
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

  const linkedAgent = path.join(temporary, "agent");
  const firstPackagedApp = path.join(temporary, "first", "Difftray Alpha.app");
  const linkedSkill = path.join(firstPackagedApp, "Contents/Resources/skills/difftray");
  const linkedCapture = path.join(temporary, "linked-args.json");
  const makeAlphaApp = (appPath, capturePath) => {
    const appContents = path.join(appPath, "Contents");
    mkdirSync(path.join(appContents, "Resources/bin"), { recursive: true });
    mkdirSync(path.join(appContents, "MacOS"), { recursive: true });
    mkdirSync(path.join(appContents, "Resources/skills"), { recursive: true });
    writeFileSync(
      path.join(appContents, "Info.plist"),
      `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.prof18.difftray.dev</string><key>CFBundleExecutable</key><string>Difftray Alpha</string></dict></plist>`
    );
    writeFileSync(path.join(appContents, "MacOS/Difftray Alpha"), "#!/bin/sh\nexit 99\n");
    chmodSync(path.join(appContents, "MacOS/Difftray Alpha"), 0o755);
    writeFileSync(
      path.join(appContents, "Resources/bin/difftray"),
      `#!/bin/sh\nprintf '%s\\0' "$PWD" "$@" > "${capturePath}"\n`
    );
    chmodSync(path.join(appContents, "Resources/bin/difftray"), 0o755);
    writeFileSync(path.join(appContents, "Resources/app.asar"), "stub");
    cpSync(source, path.join(appContents, "Resources/skills/difftray"), {
      recursive: true
    });
  };
  makeAlphaApp(firstPackagedApp, linkedCapture);
  mkdirSync(path.join(linkedAgent, "skills"), { recursive: true });
  let externalSkillLink = path.join(linkedAgent, "skills/difftray");
  symlinkSync(linkedSkill, externalSkillLink, "dir");
  const linkedResolver = path.join(externalSkillLink, "scripts/difftray");
  const linkedArgs = ["--json", "from link", "quote'", "*?[x]"];
  const withoutAppOverride = { ...process.env };
  delete withoutAppOverride.DIFFTRAY_APP_PATH;
  const linkedSuccess = spawnSync(linkedResolver, linkedArgs, {
    cwd,
    env: withoutAppOverride,
    encoding: "utf8"
  });
  assert.equal(linkedSuccess.status, 0, linkedSuccess.stderr);
  assert.deepEqual(readFileSync(linkedCapture, "utf8").split("\0").slice(0, -1), [
    realpathSync(cwd),
    ...linkedArgs
  ]);

  const relocatedApp = path.join(temporary, "relocated", "Difftray Alpha.app");
  const relocatedCapture = path.join(temporary, "relocated-args.json");
  makeAlphaApp(relocatedApp, relocatedCapture);
  rmSync(externalSkillLink);
  externalSkillLink = path.join(linkedAgent, "skills/difftray");
  symlinkSync(
    path.join(relocatedApp, "Contents/Resources/skills/difftray"),
    externalSkillLink,
    "dir"
  );
  const relocatedSuccess = spawnSync(
    path.join(externalSkillLink, "scripts/difftray"),
    linkedArgs,
    { cwd, env: withoutAppOverride, encoding: "utf8" }
  );
  assert.equal(relocatedSuccess.status, 0, relocatedSuccess.stderr);
  assert.deepEqual(readFileSync(relocatedCapture, "utf8").split("\0").slice(0, -1), [
    realpathSync(cwd),
    ...linkedArgs
  ]);

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
