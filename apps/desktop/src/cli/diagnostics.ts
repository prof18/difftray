import { randomUUID } from "node:crypto";
import path from "node:path";
import { CLI_PROTOCOL_VERSION, type AgentResultMap } from "../shared/agent-protocol.js";
import type { AgentRuntime } from "./agent-runtime.js";
import { cliErrorResponse } from "./output.js";

/** CLI-only diagnostics; endpoint credentials never enter the printable object. */
export async function runDoctor(
  runtime: AgentRuntime,
  handshake: () => Promise<AgentResultMap["hello"]>
) {
  const diagnostics = {
    bundlePath: path.dirname(path.dirname(path.dirname(runtime.executablePath))),
    profilePath: runtime.profilePath,
    executablePath: runtime.executablePath,
    appId: runtime.appId,
    flavor: runtime.flavor,
    cliVersion: runtime.appVersion,
    protocolVersion: runtime.protocolVersion
  };
  try {
    const hello = await handshake();
    return {
      version: CLI_PROTOCOL_VERSION,
      id: randomUUID(),
      ok: true as const,
      result: {
        ...diagnostics,
        appVersion: hello.appVersion,
        instanceId: hello.instanceId,
        connected: true
      }
    };
  } catch (error) {
    return {
      ...cliErrorResponse(error),
      diagnostics: { ...diagnostics, connected: false }
    };
  }
}
