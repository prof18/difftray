import { execFileSync } from "node:child_process";
import os from "node:os";

type CompanionServerNameDependencies = {
  readonly hostname: () => string;
  readonly platform: NodeJS.Platform;
  readonly readMacComputerName: () => string;
};

const resolvedNames = new WeakMap<CompanionServerNameDependencies, string>();

export function resolveCompanionServerName(
  dependencies: CompanionServerNameDependencies = defaultDependencies
): string {
  const cachedName = resolvedNames.get(dependencies);

  if (cachedName !== undefined) {
    return cachedName;
  }

  let resolvedName: string;

  if (dependencies.platform === "darwin") {
    try {
      const computerName = dependencies.readMacComputerName().trim();

      if (computerName.length > 0) {
        resolvedName = computerName;
        resolvedNames.set(dependencies, resolvedName);
        return resolvedName;
      }
    } catch {
      // Fall back to the network hostname when System Configuration is unavailable.
    }
  }

  resolvedName = dependencies.hostname();
  resolvedNames.set(dependencies, resolvedName);
  return resolvedName;
}

const defaultDependencies: CompanionServerNameDependencies = {
  hostname: os.hostname,
  platform: process.platform,
  readMacComputerName: () =>
    execFileSync("/usr/sbin/scutil", ["--get", "ComputerName"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 1_000
    })
};
