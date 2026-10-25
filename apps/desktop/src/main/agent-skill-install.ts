import { randomUUID } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
  type Stats
} from "node:fs";
import path from "node:path";
import type {
  AgentSetupInfo,
  AgentSkillStatus,
  AgentSkillTarget
} from "../shared/agent-setup-types.js";
import { agentSkillNames } from "../shared/agent-skill-names.js";

type Receipt = { version: 1; records: Record<string, string[]>; otherDirectory?: string };
const labels: Record<AgentSkillTarget, string> = {
  claude: "Claude Code",
  codex: "Codex",
  pi: "Pi",
  other: "Other agents"
};
const targets = Object.keys(labels) as AgentSkillTarget[];
type SkillKind = Exclude<AgentSkillStatus["kind"], "unavailable">;

function stat(file: string): Stats | null {
  try {
    return lstatSync(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export function createAgentSkillInstaller(options: {
  home: string;
  resourcesPath: string;
  packaged: boolean;
  profileOverride: boolean;
  uid: number;
}) {
  const sourceOf = (name: string): string =>
    path.resolve(options.resourcesPath, "skills", name);
  const source = sourceOf("difftray");
  const receiptDirectory = path.join(options.home, ".difftray");
  const receiptPath = path.join(receiptDirectory, "skill-install-receipts.json");
  const errors = new Map<AgentSkillTarget, string>();
  const parents: Record<Exclude<AgentSkillTarget, "other">, string[]> = {
    claude: [
      options.home,
      path.join(options.home, ".claude"),
      path.join(options.home, ".claude/skills")
    ],
    codex: [
      options.home,
      path.join(options.home, ".agents"),
      path.join(options.home, ".agents/skills")
    ],
    pi: [
      options.home,
      path.join(options.home, ".pi"),
      path.join(options.home, ".pi/agent"),
      path.join(options.home, ".pi/agent/skills")
    ]
  };

  function checkDirectory(directory: string): void {
    const entry = stat(directory);
    if (!entry) return;
    if (entry.uid !== options.uid)
      throw new Error(`Non-user-owned skill directory: ${directory}`);
    const canonical = realpathSync(directory);
    const value = entry.isSymbolicLink() ? lstatSync(canonical) : entry;
    if (
      !value.isDirectory() ||
      value.uid !== options.uid ||
      !(value.mode & 0o200) ||
      !(value.mode & 0o100) ||
      (value.mode & 0o022) !== 0
    ) {
      throw new Error(`Unsafe or non-writable skill directory: ${directory}`);
    }
    const appPath = path.resolve(options.resourcesPath, "../..");
    const bundle = stat(appPath) ? realpathSync(appPath) : appPath;
    if (canonical === bundle || canonical.startsWith(`${bundle}${path.sep}`)) {
      throw new Error("Choose a skills directory outside the app bundle.");
    }
  }
  const receiptKey = (destination: string): string =>
    path.join(realpathSync(path.dirname(destination)), path.basename(destination));
  const linkedSource = (destination: string): string =>
    path.resolve(realpathSync(path.dirname(destination)), readlinkSync(destination));
  function readReceipt(): Receipt {
    checkDirectory(options.home);
    checkDirectory(receiptDirectory);
    const value = stat(receiptPath);
    if (!value) return { version: 1, records: {} };
    if (
      !value.isFile() ||
      value.isSymbolicLink() ||
      value.uid !== options.uid ||
      (value.mode & 0o777) !== 0o600 ||
      value.size > 65_536
    ) {
      throw new Error("The skill installation receipt is unsafe.");
    }
    const parsed: unknown = JSON.parse(readFileSync(receiptPath, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error("Invalid skill installation receipt.");
    const record = parsed as Record<string, unknown>;
    if (
      record.version !== 1 ||
      !record.records ||
      typeof record.records !== "object" ||
      Array.isArray(record.records) ||
      (record.otherDirectory !== undefined &&
        (typeof record.otherDirectory !== "string" ||
          !path.isAbsolute(record.otherDirectory)))
    ) {
      throw new Error("Invalid skill installation receipt.");
    }
    for (const [destination, sources] of Object.entries(record.records)) {
      if (
        !path.isAbsolute(destination) ||
        !(agentSkillNames as readonly string[]).includes(path.basename(destination)) ||
        !Array.isArray(sources) ||
        sources.length > 2 ||
        !sources.length ||
        !sources.every(
          (item: unknown) =>
            typeof item === "string" &&
            path.isAbsolute(item) &&
            item.endsWith(`/Contents/Resources/skills/${path.basename(destination)}`)
        )
      ) {
        throw new Error("Invalid skill installation receipt.");
      }
    }
    return parsed as Receipt;
  }
  function writeReceipt(receipt: Receipt): void {
    readReceipt();
    if (!stat(receiptDirectory)) mkdirSync(receiptDirectory, { mode: 0o700 });
    checkDirectory(receiptDirectory);
    const temporary = `${receiptPath}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify(receipt), { flag: "wx", mode: 0o600 });
      renameSync(temporary, receiptPath);
    } finally {
      try {
        unlinkSync(temporary);
      } catch {
        /* renamed or not created */
      }
    }
  }
  function completeSource(): boolean {
    const launcher = stat(path.join(source, "scripts/difftray"));
    return Boolean(
      agentSkillNames.every((name) =>
        stat(path.join(sourceOf(name), "SKILL.md"))?.isFile()
      ) &&
      stat(path.join(source, "references/commands.md"))?.isFile() &&
      launcher?.isFile() &&
      launcher.mode & 0o111
    );
  }
  function inspectLink(
    name: string,
    destination: string,
    receipt: Receipt
  ): { kind: SkillKind; reason: string | null } {
    const existing = stat(destination);
    if (!existing) return { kind: "absent", reason: null };
    if (!existing.isSymbolicLink() || existing.uid !== options.uid)
      return {
        kind: "blocked",
        reason: `Another file or folder already exists at ${destination}.`
      };
    const linked = linkedSource(destination);
    if (linked === sourceOf(name)) return { kind: "installed", reason: null };
    if (receipt.records[receiptKey(destination)]?.includes(linked))
      return {
        kind: "repairable",
        reason: "The skill link points to a previous app location."
      };
    return {
      kind: "blocked",
      reason: `Another skill link already exists at ${destination}.`
    };
  }
  function inspect(
    target: AgentSkillTarget,
    receipt: Receipt,
    directory?: string
  ): AgentSkillStatus {
    const chosen =
      target === "other" ? (directory ?? receipt.otherDirectory) : parents[target].at(-1);
    const destination = chosen ? path.join(chosen, "difftray") : null;
    const result = (
      kind: AgentSkillStatus["kind"],
      reason: string | null = null
    ): AgentSkillStatus => ({ target, label: labels[target], destination, kind, reason });
    if (options.profileOverride)
      return result(
        "unavailable",
        "Skill installation is unavailable with an isolated profile."
      );
    if (!completeSource())
      return result("unavailable", "The bundled skill is missing or incomplete.");
    for (const parent of target === "other" ? (chosen ? [chosen] : []) : parents[target])
      checkDirectory(parent);
    if (!chosen || !destination) return result("absent");
    const links = agentSkillNames.map((name) =>
      inspectLink(name, path.join(chosen, name), receipt)
    );
    const blocked = links.find((link) => link.kind === "blocked");
    if (blocked) return result("blocked", blocked.reason);
    if (links.every((link) => link.kind === "installed")) return result("installed");
    if (links.every((link) => link.kind === "absent")) return result("absent");
    return result(
      "repairable",
      links.find((link) => link.kind === "repairable")?.reason ??
        "Some Difftray command skills are missing."
    );
  }
  function getSetup(): AgentSetupInfo {
    if (!options.packaged) return { available: false };
    return {
      available: true,
      skills: targets.map((target): AgentSkillStatus => {
        try {
          const receipt = options.profileOverride
            ? { version: 1 as const, records: {} }
            : readReceipt();
          const result = inspect(target, receipt);
          const error = errors.get(target);
          return error !== undefined
            ? { ...result, kind: "blocked", reason: error }
            : result;
        } catch (error) {
          return {
            target,
            label: labels[target],
            destination: null,
            kind: "blocked",
            reason: error instanceof Error ? error.message : String(error)
          };
        }
      })
    };
  }
  function install(target: AgentSkillTarget, directory?: string): AgentSetupInfo {
    errors.delete(target);
    if (!options.packaged || options.profileOverride) return getSetup();
    try {
      let receipt = readReceipt();
      const chosen =
        target === "other" && directory ? realpathSync(directory) : undefined;
      const initial = inspect(target, receipt, chosen);
      if (
        initial.kind === "installed" &&
        target === "other" &&
        chosen &&
        initial.destination
      ) {
        for (const name of agentSkillNames)
          receipt.records[receiptKey(path.join(chosen, name))] = [sourceOf(name)];
        receipt.otherDirectory = chosen;
        writeReceipt(receipt);
        return getSetup();
      }
      if (initial.kind !== "absent" && initial.kind !== "repairable") {
        if (target === "other" && initial.reason) errors.set(target, initial.reason);
        const result = getSetup();
        errors.clear();
        return result;
      }
      if (!initial.destination) return getSetup();
      for (const parent of target === "other"
        ? [path.dirname(initial.destination)]
        : parents[target]) {
        if (!stat(parent)) mkdirSync(parent, { mode: 0o700 });
        checkDirectory(parent);
      }
      receipt = readReceipt();
      const current = inspect(target, receipt, chosen);
      if (current.kind !== "absent" && current.kind !== "repairable") return getSetup();
      const parent = path.dirname(initial.destination);
      const pending = agentSkillNames.flatMap((name) => {
        const destination = path.join(parent, name);
        const link = inspectLink(name, destination, receipt);
        if (link.kind === "installed") return [];
        const previous =
          link.kind === "repairable" ? linkedSource(destination) : undefined;
        return [{ name, destination, previous }];
      });
      // Record both exact sources before replacing our links, so a failed repair remains repairable.
      for (const { name, destination, previous } of pending)
        receipt.records[receiptKey(destination)] = previous
          ? [sourceOf(name), previous]
          : [sourceOf(name)];
      if (target === "other") receipt.otherDirectory = parent;
      writeReceipt(receipt);
      for (const { name, destination, previous } of pending) {
        if (previous) {
          const value = stat(destination);
          if (
            !value?.isSymbolicLink() ||
            value.uid !== options.uid ||
            linkedSource(destination) !== previous
          ) {
            throw new Error("The skill destination changed during repair. Try again.");
          }
          unlinkSync(destination);
        }
        // symlink creation fails if another file appeared; never overwrite that file.
        symlinkSync(sourceOf(name), destination);
      }
    } catch (error) {
      errors.set(target, error instanceof Error ? error.message : String(error));
    }
    const result = getSetup();
    errors.clear();
    return result;
  }
  return { getSetup, install };
}
