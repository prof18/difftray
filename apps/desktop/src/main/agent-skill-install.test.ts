import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAgentSkillInstaller } from "./agent-skill-install.js";
import { agentSkillNames } from "../shared/agent-skill-names.js";
import type { AgentSkillTarget } from "../shared/agent-setup-types.js";

let root: string;
let home: string;
let resourcesPath: string;
beforeEach(() => {
  root = realpathSync(mkdtempSync(path.join(tmpdir(), "difftray-skill-install-")));
  home = path.join(root, "home");
  mkdirSync(home);
  resourcesPath = path.join(root, "Difftray Alpha.app/Contents/Resources");
  const source = path.join(resourcesPath, "skills/difftray");
  mkdirSync(path.join(source, "scripts"), { recursive: true });
  mkdirSync(path.join(source, "references"));
  writeFileSync(path.join(source, "SKILL.md"), "skill");
  writeFileSync(path.join(source, "scripts/difftray"), "#!/bin/sh\n", { mode: 0o755 });
  writeFileSync(path.join(source, "references/commands.md"), "commands");
  for (const name of agentSkillNames.filter((item) => item !== "difftray")) {
    mkdirSync(path.join(resourcesPath, "skills", name));
    writeFileSync(path.join(resourcesPath, "skills", name, "SKILL.md"), name);
  }
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
const installer = (
  overrides: Partial<Parameters<typeof createAgentSkillInstaller>[0]> = {}
) =>
  createAgentSkillInstaller({
    home,
    resourcesPath,
    packaged: true,
    profileOverride: false,
    uid: process.getuid?.() ?? -1,
    ...overrides
  });
function status(target: AgentSkillTarget, instance = installer()) {
  const setup = instance.getSetup();
  if (!setup.available) throw new Error("Setup unavailable");
  const result = setup.skills.find((item) => item.target === target);
  if (!result) throw new Error("Missing target");
  return result;
}
function unlinkCommandSkills(parent: string): void {
  for (const name of agentSkillNames.filter((item) => item !== "difftray"))
    unlinkSync(path.join(parent, name));
}
function installedDestination(target: AgentSkillTarget): string {
  const destination = status(target).destination;
  if (!destination) throw new Error("Missing installed skill destination");
  return destination;
}

describe("agent skill installation", () => {
  it("reads status without creating agent folders, then links the complete skill for each host", () => {
    const paths = {
      claude: ".claude/skills/difftray",
      codex: ".agents/skills/difftray",
      pi: ".pi/agent/skills/difftray"
    } as const;
    for (const [target, relative] of Object.entries(paths)) {
      expect(status(target as AgentSkillTarget).kind).toBe("absent");
      expect(existsSync(path.join(home, relative))).toBe(false);
    }
    expect(existsSync(path.join(home, ".difftray"))).toBe(false);
    for (const [target, relative] of Object.entries(paths)) {
      const instance = installer();
      instance.install(target as AgentSkillTarget);
      expect(status(target as AgentSkillTarget, instance).kind).toBe("installed");
      expect(readlinkSync(path.join(home, relative))).toBe(
        path.join(resourcesPath, "skills/difftray")
      );
      expect(
        readFileSync(path.join(home, relative, "references/commands.md"), "utf8")
      ).toBe("commands");
    }
  });
  it("links every command skill beside the main skill", () => {
    installer().install("claude");
    expect(status("claude").kind).toBe("installed");
    for (const name of agentSkillNames) {
      expect(readlinkSync(path.join(home, ".claude/skills", name))).toBe(
        path.join(resourcesPath, "skills", name)
      );
    }
    expect(agentSkillNames).toEqual([
      "difftray",
      "difftray-open",
      "difftray-read",
      "difftray-fix",
      "difftray-review",
      "difftray-label"
    ]);
  });
  it("offers repair when command skills are missing and adds them without touching the main link", () => {
    installer().install("codex");
    const parent = path.join(home, ".agents/skills");
    const main = lstatSync(path.join(parent, "difftray")).ino;
    unlinkCommandSkills(parent);
    expect(status("codex")).toMatchObject({
      kind: "repairable",
      reason: expect.stringContaining("missing")
    });
    installer().install("codex");
    expect(status("codex").kind).toBe("installed");
    expect(lstatSync(path.join(parent, "difftray")).ino).toBe(main);
    expect(readlinkSync(path.join(parent, "difftray-read"))).toBe(
      path.join(resourcesPath, "skills/difftray-read")
    );
  });
  it("blocks the whole host and links nothing when one command destination is taken", () => {
    const parent = path.join(home, ".claude/skills");
    mkdirSync(parent, { recursive: true });
    writeFileSync(path.join(parent, "difftray-open"), "keep");
    installer().install("claude");
    expect(status("claude")).toMatchObject({
      kind: "blocked",
      reason: expect.stringContaining("difftray-open")
    });
    expect(readFileSync(path.join(parent, "difftray-open"), "utf8")).toBe("keep");
    expect(existsSync(path.join(parent, "difftray"))).toBe(false);
  });
  it("reports the bundle as incomplete when a command skill is missing", () => {
    rmSync(path.join(resourcesPath, "skills/difftray-fix/SKILL.md"));
    expect(status("pi").kind).toBe("unavailable");
  });
  it("repairs a link after a custom-named app moves, using its installation receipt", () => {
    const first = installer();
    first.install("claude");
    const destination = installedDestination("claude");
    const oldSource = readlinkSync(destination);
    const movedApp = path.join(root, "Moved Custom.app");
    renameSync(path.join(root, "Difftray Alpha.app"), movedApp);
    const moved = installer({ resourcesPath: path.join(movedApp, "Contents/Resources") });
    expect(status("claude", moved).kind).toBe("repairable");
    expect(readlinkSync(destination)).toBe(oldSource);
    moved.install("claude");
    expect(status("claude", moved).kind).toBe("installed");
    expect(readlinkSync(destination)).toBe(
      path.join(movedApp, "Contents/Resources/skills/difftray")
    );
    expect(readlinkSync(path.join(path.dirname(destination), "difftray-review"))).toBe(
      path.join(movedApp, "Contents/Resources/skills/difftray-review")
    );
  });
  it("links a chosen folder and remembers it for status and repair", () => {
    const directory = path.join(home, "custom-skills");
    mkdirSync(directory);
    expect(status("other").destination).toBeNull();
    installer().install("other", directory);
    expect(status("other")).toMatchObject({
      kind: "installed",
      destination: path.join(directory, "difftray")
    });
  });
  it("reports a custom folder conflict and still allows selecting another folder", () => {
    const occupied = path.join(home, "occupied");
    const available = path.join(home, "available");
    mkdirSync(occupied);
    mkdirSync(available);
    writeFileSync(path.join(occupied, "difftray"), "keep");
    const instance = installer();
    const result = instance.install("other", occupied);
    expect(
      result.available && result.skills.find((item) => item.target === "other")
    ).toMatchObject({
      kind: "blocked",
      reason: expect.stringContaining("already exists")
    });
    expect(readFileSync(path.join(occupied, "difftray"), "utf8")).toBe("keep");
    instance.install("other", available);
    expect(status("other", instance)).toMatchObject({
      kind: "installed",
      destination: path.join(available, "difftray")
    });
  });
  it("does not disturb an owned link when its receipt cannot be safely updated", () => {
    installer().install("codex");
    const destination = installedDestination("codex");
    const previous = readlinkSync(destination);
    const receipt = path.join(home, ".difftray/skill-install-receipts.json");
    chmodSync(receipt, 0o644);
    installer().install("codex");
    expect(status("codex").kind).toBe("blocked");
    expect(readlinkSync(destination)).toBe(previous);
  });
  it("refuses a custom directory inside the app bundle without modifying the bundled skill", () => {
    const source = path.join(resourcesPath, "skills/difftray");
    const result = installer().install("other", source);
    expect(
      result.available && result.skills.find((item) => item.target === "other")
    ).toMatchObject({
      kind: "blocked",
      reason: expect.stringContaining("outside the app bundle")
    });
    expect(existsSync(path.join(source, "difftray"))).toBe(false);
    expect(existsSync(path.join(home, ".difftray"))).toBe(false);
  });
  it("preserves regular folders, files and unrelated or broken symlinks", () => {
    const parent = path.join(home, ".claude/skills");
    mkdirSync(parent, { recursive: true });
    const destination = path.join(parent, "difftray");
    mkdirSync(destination);
    writeFileSync(path.join(destination, "mine"), "keep");
    installer().install("claude");
    expect(status("claude").kind).toBe("blocked");
    expect(readFileSync(path.join(destination, "mine"), "utf8")).toBe("keep");
    rmSync(destination, { recursive: true });
    writeFileSync(destination, "keep");
    installer().install("claude");
    expect(readFileSync(destination, "utf8")).toBe("keep");
    rmSync(destination);
    symlinkSync(
      path.join(root, "unrelated.app/Contents/Resources/skills/difftray"),
      destination
    );
    const before = readlinkSync(destination);
    installer().install("claude");
    expect(status("claude").kind).toBe("blocked");
    expect(readlinkSync(destination)).toBe(before);
  });
  it("refuses symlinked or direct unwritable agent directories", () => {
    const denied = path.join(root, "denied");
    mkdirSync(denied, { mode: 0o500 });
    symlinkSync(denied, path.join(home, ".claude"));
    installer().install("claude");
    expect(status("claude").kind).toBe("blocked");
    expect(existsSync(path.join(root, "skills"))).toBe(false);
    mkdirSync(path.join(home, ".agents"));
    chmodSync(path.join(home, ".agents"), 0o500);
    installer().install("codex");
    expect(status("codex").kind).toBe("blocked");
  });
  it("supports user-owned symlinked skill directories and repairs through either alias", () => {
    const shared = path.join(home, ".agents/skills");
    mkdirSync(shared, { recursive: true });
    mkdirSync(path.join(home, ".claude"));
    symlinkSync(shared, path.join(home, ".claude/skills"));
    installer().install("claude");
    expect(status("claude").kind).toBe("installed");
    expect(status("codex").kind).toBe("installed");
    const movedApp = path.join(root, "Moved.app");
    renameSync(path.join(root, "Difftray Alpha.app"), movedApp);
    const moved = installer({ resourcesPath: path.join(movedApp, "Contents/Resources") });
    expect(status("claude", moved).kind).toBe("repairable");
    expect(status("codex", moved).kind).toBe("repairable");
    moved.install("codex");
    expect(status("claude", moved).kind).toBe("installed");
    expect(status("codex", moved).kind).toBe("installed");
  });
  it("rejects unsafe receipts and does not replace a link based only on an app-like suffix", () => {
    const parent = path.join(home, ".claude/skills");
    mkdirSync(parent, { recursive: true });
    const destination = path.join(parent, "difftray");
    const previous = path.join(
      root,
      "Old/Difftray.app/Contents/Resources/skills/difftray"
    );
    symlinkSync(previous, destination);
    expect(status("claude").kind).toBe("blocked");
    mkdirSync(path.join(home, ".difftray"), { mode: 0o700 });
    symlinkSync(
      path.join(root, "missing-receipt"),
      path.join(home, ".difftray/skill-install-receipts.json")
    );
    installer().install("claude");
    expect(status("claude").kind).toBe("blocked");
    expect(readlinkSync(destination)).toBe(previous);
  });
  it("does not install in unpackaged, isolated-profile, or incomplete-bundle runs", () => {
    expect(installer({ packaged: false }).getSetup()).toEqual({ available: false });
    const isolated = installer({ profileOverride: true });
    isolated.install("claude");
    expect(status("claude", isolated).kind).toBe("unavailable");
    rmSync(path.join(resourcesPath, "skills/difftray/scripts/difftray"));
    installer().install("claude");
    expect(status("claude").kind).toBe("unavailable");
    expect(existsSync(path.join(home, ".claude"))).toBe(false);
    expect(existsSync(path.join(home, ".difftray"))).toBe(false);
  });
  it("leaves an installed link unchanged when the bundled skill content updates", () => {
    installer().install("pi");
    const destination = installedDestination("pi");
    const before = lstatSync(destination).ino;
    writeFileSync(path.join(resourcesPath, "skills/difftray/SKILL.md"), "new skill");
    expect(status("pi").kind).toBe("installed");
    expect(lstatSync(destination).ino).toBe(before);
    expect(readFileSync(path.join(destination, "SKILL.md"), "utf8")).toBe("new skill");
  });
});
