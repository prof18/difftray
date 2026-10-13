import { constants } from "node:fs";
import { access, mkdir, readFile, realpath, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveAppRuntimeConfig } from "../shared/app-runtime.js";
import {
  AgentProtocolError,
  CLI_PROTOCOL_VERSION,
  PROFILE_OVERRIDE_ENV
} from "../shared/agent-protocol.js";
import type { AgentConnectionIdentity } from "./agent-connection.js";

export type AgentRuntime = AgentConnectionIdentity & { readonly appVersion: string };
export type AgentRuntimeOptions = {
  readonly executablePath?: string;
  readonly homeDirectory?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
};
function unavailable(): AgentProtocolError {
  return new AgentProtocolError(
    "app_unavailable",
    "Run the CLI from its own valid Difftray application bundle."
  );
}
/** Resolve only this launcher’s bundle; never search for or select another installation. */
export async function resolveAgentRuntime(
  options: AgentRuntimeOptions = {}
): Promise<AgentRuntime> {
  if ((options.platform ?? process.platform) !== "darwin") throw unavailable();
  try {
    // The bundled launcher execs its own Electron binary in runAsNode mode.
    const executablePath = await realpath(options.executablePath ?? process.execPath);
    if (!(await stat(executablePath)).isFile()) throw unavailable();
    await access(executablePath, constants.X_OK);
    const macos = path.dirname(executablePath);
    const contents = path.dirname(macos);
    if (
      path.basename(macos) !== "MacOS" ||
      path.basename(contents) !== "Contents" ||
      !path.dirname(contents).endsWith(".app")
    )
      throw unavailable();
    const metadata: unknown = JSON.parse(
      await readFile(path.join(contents, "Resources/app.asar/package.json"), "utf8")
    );
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
      throw unavailable();
    const record = metadata as Record<string, unknown>;
    if (
      typeof record.version !== "string" ||
      !record.version.trim() ||
      typeof record.productName !== "string" ||
      !["Difftray", "Difftray Alpha", "Difftray Dev"].includes(record.productName)
    )
      throw unavailable();
    // Product metadata remains authoritative when the user renames their .app folder.
    const runtime = resolveAppRuntimeConfig({
      isPackaged: true,
      productName: record.productName
    });
    const env = options.env ?? process.env;
    const profile =
      env[PROFILE_OVERRIDE_ENV] ??
      path.join(
        options.homeDirectory ?? os.homedir(),
        "Library/Application Support",
        runtime.userDataDirectoryName
      );
    await mkdir(profile, { recursive: true });
    const profilePath = await realpath(profile);
    return {
      profilePath,
      executablePath,
      appId: runtime.appId,
      flavor: runtime.flavor,
      protocolVersion: CLI_PROTOCOL_VERSION,
      appVersion: record.version
    };
  } catch (error) {
    if (error instanceof AgentProtocolError) throw error;
    throw unavailable();
  }
}
