import { randomUUID } from "node:crypto";
import {
  accessSync,
  constants,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { join, sep } from "node:path";

type CliChannel = "production" | "alpha" | "dev";

export type CliInstallStatus = {
  readonly kind: "absent" | "installed" | "repairable" | "blocked" | "unavailable";
  readonly command: "difftray" | "difftray-alpha";
  readonly destination: string;
  readonly invocation: string;
  readonly onPath: boolean;
  readonly pathInstruction: string | null;
  readonly reason: string | null;
};

export type CliInstallOptions = {
  readonly home: string;
  readonly resourcesPath: string;
  readonly profilePath: string;
  readonly variant: CliChannel;
  readonly packaged: boolean;
  readonly profileOverride: boolean;
  readonly pathValue: string;
  readonly uid: number;
};

function statOrNull(file: string): ReturnType<typeof lstatSync> | null {
  try {
    return lstatSync(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export function createCliInstaller(options: CliInstallOptions): {
  getStatus: () => CliInstallStatus;
  install: () => CliInstallStatus;
} {
  const directory = join(options.home, ".local", "bin");
  const command = options.variant === "alpha" ? "difftray-alpha" : "difftray";
  const destination = join(directory, command);
  const invocation = join(options.resourcesPath, "bin", "difftray");
  const receiptPath = join(options.profilePath, "cli-install-receipt.json");
  const onPath = options.pathValue.split(sep === "/" ? ":" : ";").includes(directory);
  const pathInstruction = onPath
    ? null
    : `export PATH='${directory.replaceAll("'", "'\"'\"'")}':"$PATH"`;
  const result = (
    kind: CliInstallStatus["kind"],
    reason: string | null = null
  ): CliInstallStatus => ({
    kind,
    command,
    destination,
    invocation,
    onPath,
    pathInstruction,
    reason
  });

  function checkParents(): CliInstallStatus | null {
    for (const parent of [options.home, join(options.home, ".local"), directory]) {
      const stat = statOrNull(parent);
      if (!stat) continue;
      if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== options.uid) {
        return result("blocked", `Unsafe or non-user-owned directory: ${parent}`);
      }
      if (!(Number(stat.mode) & 0o200) || !(Number(stat.mode) & 0o100)) {
        return result("blocked", `Directory is not writable: ${parent}`);
      }
    }
    return null;
  }

  function readReceipt(): { version: 1; channel: string; launcher: string } | null {
    const parent = statOrNull(options.profilePath);
    if (
      !parent?.isDirectory() ||
      parent.isSymbolicLink() ||
      parent.uid !== options.uid ||
      !(Number(parent.mode) & 0o200) ||
      !(Number(parent.mode) & 0o100) ||
      (Number(parent.mode) & 0o022) !== 0
    ) {
      throw new Error("The Difftray profile directory is unsafe for CLI installation.");
    }
    const stat = statOrNull(receiptPath);
    if (!stat) return null;
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.uid !== options.uid ||
      (Number(stat.mode) & 0o777) !== 0o600 ||
      Number(stat.size) > 4096
    ) {
      throw new Error("The CLI installation receipt is unsafe.");
    }
    const value: unknown = JSON.parse(readFileSync(receiptPath, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("The CLI installation receipt is invalid.");
    const record = value as Record<string, unknown>;
    if (
      Object.keys(record).sort().join(",") !== "channel,launcher,version" ||
      record.version !== 1 ||
      record.channel !== options.variant ||
      typeof record.launcher !== "string" ||
      !record.launcher.startsWith("/") ||
      !record.launcher.endsWith("/Contents/Resources/bin/difftray")
    ) {
      throw new Error("The CLI installation receipt is invalid.");
    }
    return { version: 1, channel: options.variant, launcher: record.launcher };
  }

  function writeReceipt(): void {
    // The receipt is private and records only the exact launcher we installed.
    readReceipt();
    const temporary = `${receiptPath}.${randomUUID()}.tmp`;
    try {
      writeFileSync(
        temporary,
        JSON.stringify({ version: 1, channel: options.variant, launcher: invocation }),
        { flag: "wx", mode: 0o600 }
      );
      renameSync(temporary, receiptPath);
    } catch (error) {
      try {
        unlinkSync(temporary);
      } catch {
        /* No temporary file to remove. */
      }
      throw error;
    }
  }

  function getStatus(): CliInstallStatus {
    if (!options.packaged || options.profileOverride || options.variant === "dev") {
      return result(
        "unavailable",
        "Terminal installation is available in packaged Difftray and Difftray Alpha without a profile override."
      );
    }
    try {
      const parentProblem = checkParents();
      if (parentProblem) return parentProblem;
      const receipt = readReceipt();
      const launcher = statOrNull(invocation);
      if (!launcher?.isFile())
        return result("unavailable", "Bundled command-line launcher is missing.");
      if (!(Number(launcher.mode) & 0o111))
        return result("unavailable", "Bundled command-line launcher is not executable.");
      try {
        accessSync(invocation, constants.X_OK);
      } catch {
        return result("unavailable", "Bundled command-line launcher is not executable.");
      }
      const existing = statOrNull(destination);
      if (!existing) return result("absent");
      if (!existing.isSymbolicLink() || existing.uid !== options.uid) {
        return result("blocked", `Another file already exists at ${destination}.`);
      }
      const target = readlinkSync(destination);
      if (target === invocation) return result("installed");
      const expectedBundle =
        options.variant === "alpha" ? "Difftray Alpha.app" : "Difftray.app";
      if (
        target.startsWith("/") &&
        (target.endsWith(`/${expectedBundle}/Contents/Resources/bin/difftray`) ||
          target === receipt?.launcher)
      ) {
        return result(
          "repairable",
          "The installed command points to a previous app location."
        );
      }
      return result("blocked", `Another command already exists at ${destination}.`);
    } catch (error) {
      return result("blocked", (error as Error).message);
    }
  }

  function install(): CliInstallStatus {
    const initial = getStatus();
    if (initial.kind !== "absent" && initial.kind !== "repairable") return initial;
    try {
      for (const parent of [join(options.home, ".local"), directory]) {
        if (!statOrNull(parent)) mkdirSync(parent, { mode: 0o700 });
        const stat = lstatSync(parent);
        if (
          !stat.isDirectory() ||
          stat.isSymbolicLink() ||
          stat.uid !== options.uid ||
          !(stat.mode & 0o200)
        ) {
          return result("blocked", `Unsafe or non-writable directory: ${parent}`);
        }
      }
      const current = getStatus();
      if (current.kind === "repairable") {
        // Never replace a regular file or an unrelated link, even after a prior status check.
        unlinkSync(destination);
      } else if (current.kind !== "absent") return current;
      symlinkSync(invocation, destination);
      writeReceipt();
      return getStatus();
    } catch (error) {
      return result("blocked", (error as Error).message);
    }
  }
  return { getStatus, install };
}
