const packageJson = require("./package.json");
const desktopPackageJson = require("./apps/desktop/package.json");
const { execFileSync } = require("node:child_process");
const { join } = require("node:path");

const releaseChannel = process.env.DIFFTRAY_RELEASE_CHANNEL ?? "production";

if (releaseChannel === "dev") {
  throw new Error(
    'Unknown DIFFTRAY_RELEASE_CHANNEL "dev": the dev channel was renamed to "alpha"'
  );
}

if (releaseChannel !== "production" && releaseChannel !== "alpha") {
  throw new Error(`Unknown DIFFTRAY_RELEASE_CHANNEL "${releaseChannel}"`);
}

const isAlphaChannel = releaseChannel === "alpha";
const electronVersion = desktopPackageJson.devDependencies.electron.replace(
  /^[^\d]*/,
  ""
);
const productName = isAlphaChannel ? "Difftray Alpha" : "Difftray";
const executableName = isAlphaChannel ? "Difftray Alpha" : "Difftray";
const artifactPrefix = isAlphaChannel ? "Difftray-Alpha" : "Difftray";
const appId = isAlphaChannel ? "com.prof18.difftray.dev" : "com.prof18.difftray";
const releaseDirectory = `release/${packageJson.version}${isAlphaChannel ? "-alpha" : ""}`;
const macArchitectures = isAlphaChannel ? ["arm64"] : ["arm64", "x64"];

module.exports = {
  appId,
  productName,
  copyright: "Copyright (c) 2026 Marco Gomiero",
  directories: {
    app: "apps/desktop",
    buildResources: "resources",
    output: releaseDirectory
  },
  executableName,
  electronVersion,
  afterPack: async (context) => {
    if (context.electronPlatformName !== "darwin") {
      return;
    }

    const frameworkInfoPlist = join(
      context.appOutDir,
      `${productName}.app`,
      "Contents",
      "Frameworks",
      "Electron Framework.framework",
      "Resources",
      "Info.plist"
    );

    for (const key of ["CFBundleDisplayName", "CFBundleName"]) {
      execFileSync("plutil", [
        "-replace",
        key,
        "-string",
        productName,
        frameworkInfoPlist
      ]);
    }
  },
  extraMetadata: {
    main: "dist/main/index.cjs",
    name: "difftray",
    productName,
    version: packageJson.version
  },
  files: ["dist/**/*", "!dist/**/*.map", "!dist/**/*.tsbuildinfo", "package.json"],
  asar: true,
  npmRebuild: false,
  mac: {
    category: "public.app-category.developer-tools",
    icon: isAlphaChannel ? "resources/icon-dev.icns" : "resources/icon.icns",
    target: [
      {
        target: "dmg",
        arch: macArchitectures
      },
      {
        target: "zip",
        arch: macArchitectures
      }
    ],
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: "resources/entitlements.mac.plist",
    entitlementsInherit: "resources/entitlements.mac.plist",
    notarize: process.env.DIFFTRAY_SKIP_NOTARIZE === "1" ? false : true,
    extendInfo: {
      CFBundleDisplayName: productName,
      CFBundleName: productName,
      LSApplicationCategoryType: "public.app-category.developer-tools",
      NSBonjourServices: ["_difftray._tcp"],
      NSLocalNetworkUsageDescription:
        "Difftray uses your local network to connect to your review workspace."
    }
  },
  dmg: {
    title: productName,
    artifactName: `${artifactPrefix}-${"${arch}"}.${"${ext}"}`
  },
  publish: {
    provider: "github",
    owner: "prof18",
    repo: "difftray",
    releaseType: "release"
  }
};
