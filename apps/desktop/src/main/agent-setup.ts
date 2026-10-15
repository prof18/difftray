import path from "node:path";
import { CHECK_TIMEOUT_MS } from "../shared/agent-setup-copy.js";
import { PROFILE_OVERRIDE_ENV } from "../shared/agent-protocol.js";
import type { AgentCheckResult } from "../shared/agent-setup-types.js";

export async function checkAgentConnection(input: {
  resourcesPath: string;
  profilePath: string;
  profileOverride: boolean;
  env: NodeJS.ProcessEnv;
  execFile: (
    file: string,
    args: string[],
    options: { timeout: number; env: NodeJS.ProcessEnv }
  ) => Promise<{ stdout: string }>;
}): Promise<AgentCheckResult> {
  const env = { ...input.env };
  if (input.profileOverride) env[PROFILE_OVERRIDE_ENV] = input.profilePath;
  else delete env.DIFFTRAY_USER_DATA_DIR;
  let stdout: string;
  try {
    ({ stdout } = await input.execFile(
      path.join(input.resourcesPath, "bin/difftray"),
      ["doctor", "--json"],
      { timeout: CHECK_TIMEOUT_MS, env }
    ));
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "stdout" in error &&
      typeof error.stdout === "string" &&
      error.stdout.trim()
    ) {
      stdout = error.stdout;
    } else {
      return {
        status: "failed",
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }
  try {
    const response: unknown = JSON.parse(stdout);
    if (response && typeof response === "object" && "ok" in response) {
      if (
        response.ok === true &&
        "result" in response &&
        response.result &&
        typeof response.result === "object" &&
        "connected" in response.result &&
        response.result.connected === true
      ) {
        return { status: "connected" };
      }
      if (
        response.ok === false &&
        "error" in response &&
        response.error &&
        typeof response.error === "object" &&
        "message" in response.error &&
        typeof response.error.message === "string"
      ) {
        return { status: "failed", message: response.error.message };
      }
    }
  } catch {
    // CLI output can contain private paths; never log or display the raw response.
  }
  return {
    status: "failed",
    message: "The bundled CLI did not report a connected desktop."
  };
}
