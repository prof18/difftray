import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

type MacPackagingConfig = {
  readonly afterPack: (context: {
    readonly appOutDir: string;
    readonly electronPlatformName: string;
  }) => Promise<void>;
  readonly mac: {
    readonly extendInfo: Record<string, unknown>;
  };
  readonly productName: string;
};

const require = createRequire(import.meta.url);
const packagingConfig =
  require("../../../../electron-builder.config.cjs") as MacPackagingConfig;
const temporaryDirectories: string[] = [];

describe("macOS packaging configuration", () => {
  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it("declares the local-network permission and companion Bonjour service", () => {
    expect(packagingConfig.mac.extendInfo).toMatchObject({
      NSBonjourServices: ["_difftray._tcp"],
      NSLocalNetworkUsageDescription:
        "Difftray uses your local network to connect to your review workspace."
    });
  });

  it.skipIf(process.platform !== "darwin")(
    "attributes the Electron networking framework to Difftray",
    async () => {
      const appOutDir = mkdtempSync(path.join(tmpdir(), "difftray-after-pack-"));
      temporaryDirectories.push(appOutDir);
      const frameworkInfoPlist = path.join(
        appOutDir,
        `${packagingConfig.productName}.app`,
        "Contents",
        "Frameworks",
        "Electron Framework.framework",
        "Resources",
        "Info.plist"
      );

      mkdirSync(path.dirname(frameworkInfoPlist), { recursive: true });
      writeFileSync(
        frameworkInfoPlist,
        readFileSync(path.join(import.meta.dirname, "../fixtures/minimal-info.plist"))
      );

      await packagingConfig.afterPack({
        appOutDir,
        electronPlatformName: "darwin"
      });

      expect(readPlistString(frameworkInfoPlist, "CFBundleDisplayName")).toBe(
        packagingConfig.productName
      );
      expect(readPlistString(frameworkInfoPlist, "CFBundleName")).toBe(
        packagingConfig.productName
      );
    }
  );
});

function readPlistString(plistPath: string, key: string): string {
  return execFileSync("plutil", ["-extract", key, "raw", plistPath], {
    encoding: "utf8"
  }).trim();
}
