import { mkdtemp, mkdir, realpath, writeFile, symlink, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveAgentRuntime } from "./agent-runtime.js";
const fixtureRoots: string[] = [];
afterEach(async () => {
  await Promise.all(
    fixtureRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});
async function fixture(productName = "Difftray") {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-runtime-"));
  fixtureRoots.push(root);
  const bundle = path.join(root, "Renamed Application.app");
  const executablePath = path.join(bundle, "Contents/MacOS", productName);
  const metadataPath = path.join(bundle, "Contents/Resources/app.asar/package.json");
  await mkdir(path.dirname(executablePath), { recursive: true });
  await mkdir(path.dirname(metadataPath), { recursive: true });
  await writeFile(executablePath, "fixture", { mode: 0o700 });
  await writeFile(metadataPath, JSON.stringify({ productName, version: "1.2.3" }));
  return {
    root,
    bundle,
    executablePath,
    metadataPath,
    options: { executablePath, homeDirectory: root, env: {}, platform: "darwin" as const }
  };
}
describe("CLI own-bundle runtime", () => {
  it("creates and canonicalizes the default production profile", async () => {
    const f = await fixture();
    const runtime = await resolveAgentRuntime(f.options);
    expect(runtime).toMatchObject({
      appId: "com.prof18.difftray",
      flavor: "production",
      protocolVersion: 1,
      appVersion: "1.2.3",
      executablePath: await realpath(f.executablePath),
      profilePath: await realpath(
        path.join(f.root, "Library/Application Support/Difftray")
      )
    });
  });
  it("uses packaged metadata to identify Alpha even when bundle renamed", async () => {
    const f = await fixture("Difftray Alpha");
    const runtime = await resolveAgentRuntime(f.options);
    expect(runtime.flavor).toBe("alpha");
    expect(runtime.appId).toBe("com.prof18.difftray.dev");
    expect(runtime.profilePath).toBe(
      await realpath(path.join(f.root, "Library/Application Support/Difftray Dev"))
    );
  });
  it("canonicalizes a symlinked override before endpoint identity", async () => {
    const f = await fixture();
    await mkdir(path.join(f.root, "actual"));
    await symlink(path.join(f.root, "actual"), path.join(f.root, "link"));
    const runtime = await resolveAgentRuntime({
      ...f.options,
      env: { DIFFTRAY_USER_DATA_DIR: path.join(f.root, "link/new") }
    });
    expect(runtime.profilePath).toBe(await realpath(path.join(f.root, "actual/new")));
  });
  it("preserves profile override path whitespace exactly like the GUI", async () => {
    const f = await fixture();
    const override = path.join(f.root, " profile with spaces ");
    const runtime = await resolveAgentRuntime({
      ...f.options,
      env: { DIFFTRAY_USER_DATA_DIR: override }
    });
    expect(runtime.profilePath).toBe(await realpath(override));
  });
  it("resolves the own executable symlink and ignores bundle switching env", async () => {
    const f = await fixture();
    const link = path.join(f.root, "own-executable");
    await symlink(f.executablePath, link);
    const runtime = await resolveAgentRuntime({
      ...f.options,
      executablePath: link,
      env: { DIFFTRAY_APP_PATH: "/Applications/Other.app", DIFFTRAY_APP_VARIANT: "alpha" }
    });
    expect(runtime.executablePath).toBe(await realpath(f.executablePath));
    expect(runtime.flavor).toBe("production");
  });
  it("rejects arbitrary standalone Node executables without app discovery", async () => {
    const f = await fixture();
    const executablePath = path.join(f.root, "node");
    await writeFile(executablePath, "fixture", { mode: 0o700 });
    await expect(
      resolveAgentRuntime({ ...f.options, executablePath })
    ).rejects.toMatchObject({ code: "app_unavailable" });
  });
  it("rejects malformed own-bundle metadata", async () => {
    const f = await fixture();
    await writeFile(
      f.metadataPath,
      JSON.stringify({ productName: "Other", version: "1" })
    );
    await expect(resolveAgentRuntime(f.options)).rejects.toMatchObject({
      code: "app_unavailable"
    });
  });
});
