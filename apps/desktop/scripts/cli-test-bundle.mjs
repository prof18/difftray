import { execFileSync } from "node:child_process";
import { access, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const publicRoot = path.resolve(import.meta.dirname, "../../..");

export async function prepareCliTestBundle(appPath, { skipBuild = false } = {}) {
  if (process.platform !== "darwin") {
    throw new Error("The CLI bundle smoke requires macOS.");
  }
  if (appPath) {
    const canonicalApp = await realpath(appPath);
    await access(path.join(canonicalApp, "Contents/Info.plist"));
    return { appPath: canonicalApp, cleanup: () => Promise.resolve() };
  }
  const root = await mkdtemp(path.join(tmpdir(), "difftray cli bundle "));
  try {
    const env = {
      ...process.env,
      CSC_IDENTITY_AUTO_DISCOVERY: "false",
      DIFFTRAY_RELEASE_CHANNEL: "production",
      DIFFTRAY_SKIP_NOTARIZE: "1"
    };
    if (!skipBuild)
      execFileSync("pnpm", ["build"], {
        cwd: publicRoot,
        env,
        stdio: "inherit",
        timeout: 300_000
      });
    execFileSync(
      "pnpm",
      [
        "exec",
        "electron-builder",
        "--config",
        "electron-builder.config.cjs",
        "--mac",
        "--dir",
        `--${process.arch}`,
        "--publish",
        "never",
        "--config.mac.identity=null",
        `--config.directories.output=${root}`
      ],
      {
        cwd: publicRoot,
        env,
        stdio: "inherit",
        timeout: 300_000
      }
    );
    const packagedApp = path.join(
      root,
      process.arch === "arm64" ? "mac-arm64" : "mac",
      "Difftray.app"
    );
    await access(path.join(packagedApp, "Contents/Info.plist"));
    return {
      appPath: await realpath(packagedApp),
      cleanup: () => rm(root, { recursive: true, force: true })
    };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}
