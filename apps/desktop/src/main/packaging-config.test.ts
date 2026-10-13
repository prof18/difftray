import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

type MacPackagingConfig = {
  readonly electronFuses: { readonly runAsNode: boolean };
  readonly extraResources: readonly { readonly from: string; readonly to: string }[];
  readonly afterPack: (context: {
    readonly appOutDir: string;
    readonly electronPlatformName: string;
  }) => Promise<void>;
  readonly mac: {
    readonly extendInfo: Record<string, unknown>;
    readonly icon: string;
  };
  readonly productName: string;
};

const require = createRequire(import.meta.url);
const packagingConfig =
  require("../../../../electron-builder.config.cjs") as MacPackagingConfig;
const temporaryDirectories: string[] = [];

describe("macOS packaging configuration", () => {
  it("bundles an executable CLI with an independent CJS build and Node mode enabled", () => {
    const root = path.resolve(import.meta.dirname, "../../../..");
    const desktopPackage = JSON.parse(
      readFileSync(path.join(root, "apps/desktop/package.json"), "utf8")
    );
    expect(packagingConfig.electronFuses).toMatchObject({ runAsNode: true });
    expect(packagingConfig.extraResources).toContainEqual({
      from: "apps/desktop/resources/bin/difftray",
      to: "bin/difftray"
    });
    expect(desktopPackage.scripts.build).toContain(
      "vite build --config vite.cli.config.ts"
    );
    expect(desktopPackage.scripts.typecheck).toContain("tsconfig.cli.json");
    expect(desktopPackage.scripts["test:cli:bundle"]).toBe(
      "node scripts/cli-bundle-smoke.mjs"
    );
    expect(
      statSync(path.join(root, "apps/desktop/resources/bin/difftray")).mode & 0o111
    ).not.toBe(0);
  });
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

  it("uses a visually distinct icon for Alpha-channel builds", () => {
    const alphaIcon = execFileSync(
      process.execPath,
      ["-e", "process.stdout.write(require('./electron-builder.config.cjs').mac.icon)"],
      {
        cwd: path.resolve(import.meta.dirname, "../../../.."),
        encoding: "utf8",
        env: { ...process.env, DIFFTRAY_RELEASE_CHANNEL: "alpha" }
      }
    );

    expect(packagingConfig.mac.icon).toBe("resources/icon.icns");
    expect(alphaIcon).toBe("resources/icon-dev.icns");
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
