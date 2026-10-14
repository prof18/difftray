import {
  chmodSync,
  lstatSync,
  readFileSync,
  mkdirSync,
  mkdtempSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCliInstaller } from "./agent-cli-install.js";

let root: string;
let home: string;
let resourcesPath: string;
let profilePath: string;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "difftray-cli-install-"));
  home = path.join(root, "home");
  mkdirSync(home);
  profilePath = path.join(root, "profile");
  mkdirSync(profilePath, { mode: 0o700 });
  resourcesPath = path.join(root, "Difftray.app", "Contents", "Resources");
  mkdirSync(path.join(resourcesPath, "bin"), { recursive: true });
  writeFileSync(path.join(resourcesPath, "bin", "difftray"), "launcher", { mode: 0o755 });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function installer(
  variant: "production" | "alpha" = "production",
  packaged = true,
  profileOverride = false,
  pathValue = ""
) {
  return createCliInstaller({
    home,
    resourcesPath,
    profilePath,
    variant,
    packaged,
    profileOverride,
    pathValue,
    uid: process.getuid?.() ?? -1
  });
}

describe("optional CLI installation", () => {
  it("reads absent state without creating folders, then installs into the user directory", () => {
    const cli = installer();
    expect(cli.getStatus().kind).toBe("absent");
    expect(() => lstatSync(path.join(home, ".local"))).toThrow();
    const installed = cli.install();
    if (installed.kind !== "installed")
      throw new Error(installed.reason ?? installed.kind);
    expect(readlinkSync(path.join(home, ".local/bin/difftray"))).toBe(
      path.join(resourcesPath, "bin/difftray")
    );
    expect(cli.getStatus()).toMatchObject({
      kind: "installed",
      onPath: false,
      command: "difftray"
    });
  });
  it("uses the Alpha command without colliding with production", () => {
    expect(installer("alpha").install()).toMatchObject({
      kind: "installed",
      command: "difftray-alpha"
    });
  });
  it("repairs only a stale owned link to the same channel's fixed bundled launcher", () => {
    const bin = path.join(home, ".local/bin");
    mkdirSync(bin, { recursive: true });
    symlinkSync(
      path.join(root, "Old/Difftray.app/Contents/Resources/bin/difftray"),
      path.join(bin, "difftray")
    );
    expect(installer().getStatus().kind).toBe("repairable");
    expect(installer().install().kind).toBe("installed");
    expect(readlinkSync(path.join(bin, "difftray"))).toBe(
      path.join(resourcesPath, "bin/difftray")
    );
  });
  it("repairs an exact previously installed launcher after a custom-named bundle moves", () => {
    resourcesPath = path.join(root, "Original Custom.app/Contents/Resources");
    mkdirSync(path.join(resourcesPath, "bin"), { recursive: true });
    writeFileSync(path.join(resourcesPath, "bin/difftray"), "launcher", { mode: 0o755 });
    const first = installer();
    expect(first.install().kind).toBe("installed");
    const receipt = path.join(profilePath, "cli-install-receipt.json");
    expect(lstatSync(receipt).mode & 0o777).toBe(0o600);
    const receiptBeforeView = readFileSync(receipt, "utf8");
    first.getStatus();
    expect(readFileSync(receipt, "utf8")).toBe(receiptBeforeView);
    const oldTarget = path.join(resourcesPath, "bin/difftray");
    const nextResources = path.join(root, "Moved Custom.app/Contents/Resources");
    mkdirSync(path.join(nextResources, "bin"), { recursive: true });
    writeFileSync(path.join(nextResources, "bin/difftray"), "launcher", { mode: 0o755 });
    const moved = createCliInstaller({
      home,
      resourcesPath: nextResources,
      profilePath,
      variant: "production",
      packaged: true,
      profileOverride: false,
      pathValue: "",
      uid: process.getuid?.() ?? -1
    });
    expect(moved.getStatus().kind).toBe("repairable");
    expect(readlinkSync(path.join(home, ".local/bin/difftray"))).toBe(oldTarget);
    expect(moved.install().kind).toBe("installed");
    expect(readlinkSync(path.join(home, ".local/bin/difftray"))).toBe(
      path.join(nextResources, "bin/difftray")
    );
  });
  it("rejects forged or unsafe receipts and never trusts a generic app suffix", () => {
    const bin = path.join(home, ".local/bin");
    mkdirSync(bin, { recursive: true });
    symlinkSync(
      path.join(root, "Unrelated.app/Contents/Resources/bin/difftray"),
      path.join(bin, "difftray")
    );
    expect(installer().getStatus().kind).toBe("blocked");
    const receipt = path.join(profilePath, "cli-install-receipt.json");
    symlinkSync(path.join(root, "other"), receipt);
    expect(installer().getStatus().kind).toBe("blocked");
    rmSync(receipt);
    writeFileSync(
      receipt,
      JSON.stringify({
        version: 1,
        channel: "production",
        launcher: readlinkSync(path.join(bin, "difftray"))
      }),
      { mode: 0o644 }
    );
    expect(installer().getStatus().kind).toBe("blocked");
  });
  it("refuses unrelated files and links", () => {
    const bin = path.join(home, ".local/bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(path.join(bin, "difftray"), "other");
    expect(installer().install().kind).toBe("blocked");
    expect(lstatSync(path.join(bin, "difftray")).isFile()).toBe(true);
    rmSync(path.join(bin, "difftray"));
    symlinkSync("/tmp/unrelated", path.join(bin, "difftray"));
    expect(installer().install().kind).toBe("blocked");
  });
  it("refuses symlink parents and unwritable directories", () => {
    symlinkSync(root, path.join(home, ".local"));
    expect(installer().install().kind).toBe("blocked");
    rmSync(path.join(home, ".local"));
    mkdirSync(path.join(home, ".local/bin"), { recursive: true });
    chmodSync(path.join(home, ".local/bin"), 0o500);
    expect(installer().install().kind).toBe("blocked");
  });
  it("quotes shell-significant installation paths in the PATH guidance", () => {
    const specialHome = path.join(root, "user's $money `command` home");
    mkdirSync(specialHome);
    const status = createCliInstaller({
      home: specialHome,
      resourcesPath,
      profilePath,
      variant: "production",
      packaged: true,
      profileOverride: false,
      pathValue: "",
      uid: process.getuid?.() ?? -1
    }).getStatus();
    const directory = path.join(specialHome, ".local/bin");
    expect(status.pathInstruction).toBe(
      `export PATH='${directory.replaceAll("'", "'\"'\"'")}':"$PATH"`
    );
    expect(status.kind).toBe("absent");
    expect(() => lstatSync(path.join(specialHome, ".local"))).toThrow();
  });
  it("does not offer installation when the bundled launcher cannot execute", () => {
    chmodSync(path.join(resourcesPath, "bin", "difftray"), 0o644);
    expect(installer().getStatus()).toMatchObject({ kind: "unavailable" });
    expect(installer().install().kind).toBe("unavailable");
    expect(() => lstatSync(path.join(home, ".local"))).toThrow();
  });
  it("does not create the command if the private receipt directory is unwritable", () => {
    chmodSync(profilePath, 0o500);
    expect(installer().getStatus().kind).toBe("blocked");
    expect(installer().install().kind).toBe("blocked");
    expect(() => lstatSync(path.join(home, ".local"))).toThrow();
  });
  it("disables unpackaged and profile override runs", () => {
    expect(installer("production", false).install().kind).toBe("unavailable");
    expect(installer("production", true, true).install().kind).toBe("unavailable");
    expect(() => lstatSync(path.join(home, ".local"))).toThrow();
  });
});
