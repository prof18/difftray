import { spawn as spawnChild, type SpawnOptions } from "node:child_process";
import { readAgentEndpoint, type AgentEndpoint } from "../shared/agent-endpoint.js";
import {
  AgentProtocolError,
  CONNECT_RETRY_MS,
  GUI_BACKGROUND_ARGUMENT,
  PROFILE_OVERRIDE_ENV,
  STARTUP_TIMEOUT_MS,
  type AgentResponse,
  type AgentResultMap
} from "../shared/agent-protocol.js";
import { sendAgentRequest } from "./agent-client.js";

export type AgentConnectionIdentity = Pick<
  AgentResultMap["hello"],
  "profilePath" | "appId" | "flavor" | "executablePath"
> & {
  readonly protocolVersion: number;
  /** Local launch hint only; never part of hello or endpoint identity. */
  readonly profileOverride?: boolean;
};
type LaunchChild = {
  once(event: "spawn" | "error", callback: (...args: never[]) => void): unknown;
  unref(): void;
};
export async function launchAgentApp(
  identity: AgentConnectionIdentity,
  options: {
    readonly env?: NodeJS.ProcessEnv;
    readonly cwd?: string;
    readonly spawn?: (
      executable: string,
      args: string[],
      options: SpawnOptions
    ) => LaunchChild;
  } = {}
): Promise<void> {
  const env: NodeJS.ProcessEnv = {
    ...(options.env ?? process.env),
    DIFFTRAY_APP_VARIANT: identity.flavor
  };
  if (identity.profileOverride === false) delete env.DIFFTRAY_USER_DATA_DIR;
  else env[PROFILE_OVERRIDE_ENV] = identity.profilePath;
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_NO_ASAR;
  delete env.NODE_OPTIONS;
  await new Promise<void>((resolve, reject) => {
    const child = (options.spawn ?? spawnChild)(
      identity.executablePath,
      [GUI_BACKGROUND_ARGUMENT],
      {
        cwd: options.cwd ?? process.cwd(),
        env,
        detached: true,
        stdio: "ignore"
      }
    );
    child.once("error", () =>
      reject(
        new AgentProtocolError(
          "app_unavailable",
          "Could not start the CLI's desktop bundle."
        )
      )
    );
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}
export type AgentConnectionDependencies = {
  readonly readEndpoint?: (profilePath: string) => Promise<AgentEndpoint | null>;
  readonly hello?: (
    endpoint: AgentEndpoint,
    timeoutMs: number
  ) => Promise<AgentResponse<"hello">>;
  readonly launch?: (identity: AgentConnectionIdentity) => Promise<void>;
  readonly now?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
};
function verifyIdentity(
  value: AgentConnectionIdentity,
  expected: AgentConnectionIdentity
): void {
  if (value.protocolVersion !== expected.protocolVersion)
    throw new AgentProtocolError(
      "unsupported_version",
      "Desktop protocol is incompatible; quit and restart the correct desktop bundle."
    );
  if (
    ["profilePath", "appId", "flavor", "executablePath"].some(
      (key) =>
        value[key as keyof AgentConnectionIdentity] !==
        expected[key as keyof AgentConnectionIdentity]
    )
  )
    throw new AgentProtocolError(
      "profile_mismatch",
      "Desktop identity differs from this CLI; quit and restart the correct desktop bundle."
    );
}
/** Returns an authenticated endpoint before any operation is dispatched. */
export async function connectAgent(
  identity: AgentConnectionIdentity,
  dependencies: AgentConnectionDependencies = {}
): Promise<AgentEndpoint> {
  const now = dependencies.now ?? Date.now;
  const deadline = now() + STARTUP_TIMEOUT_MS;
  const read =
    dependencies.readEndpoint ??
    ((profile) => readAgentEndpoint(profile, { requireSocket: false }));
  const hello =
    dependencies.hello ??
    ((endpoint, timeoutMs) => sendAgentRequest(endpoint, "hello", {}, { timeoutMs }));
  const launch = dependencies.launch ?? launchAgentApp;
  const sleep =
    dependencies.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const timeout = () =>
    new AgentProtocolError(
      "app_unavailable",
      "Desktop startup timeout; quit and restart the correct desktop bundle."
    );
  const remaining = () => {
    const ms = deadline - now();
    if (ms <= 0) throw timeout();
    return ms;
  };
  async function bounded<T>(operation: () => Promise<T>): Promise<T> {
    const ms = remaining();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(timeout()), ms);
        })
      ]);
      remaining();
      return result;
    } finally {
      clearTimeout(timer);
    }
  }
  const pause = () => sleep(Math.min(CONNECT_RETRY_MS, remaining()));
  let launched = false;
  let refreshing = false;
  let oldInstance: string | undefined;
  let endpoint = await bounded(() => read(identity.profilePath));
  for (;;) {
    remaining();
    if (!endpoint) {
      if (!refreshing && !launched) {
        launched = true;
        await bounded(() => launch(identity));
      }
      await pause();
      endpoint = await bounded(() => read(identity.profilePath));
      continue;
    }
    verifyIdentity(endpoint, identity);
    if (refreshing && endpoint.instanceId === oldInstance)
      throw new AgentProtocolError(
        "busy",
        "Desktop endpoint generation changed repeatedly; retry later."
      );
    try {
      const selectedEndpoint = endpoint;
      const response = await bounded(() => hello(selectedEndpoint, remaining()));
      if (!response.ok)
        throw new AgentProtocolError(response.error.code, response.error.message);
      verifyIdentity(response.result, identity);
      if (response.result.instanceId !== endpoint.instanceId)
        throw new AgentProtocolError(
          "busy",
          "Desktop endpoint generation changed during hello; retry later."
        );
      return endpoint;
    } catch (error) {
      if (!(error instanceof AgentProtocolError)) throw error;
      if (error.code === "unauthorized" && !refreshing) {
        const replacement = await bounded(() => read(identity.profilePath));
        if (replacement) {
          verifyIdentity(replacement, identity);
          if (replacement.instanceId === endpoint.instanceId) throw error;
        }
        refreshing = true;
        oldInstance = endpoint.instanceId;
        endpoint = replacement;
        continue;
      }
      if (error.code !== "app_unavailable" || refreshing) throw error;
      if (!launched) {
        launched = true;
        await bounded(() => launch(identity));
      }
      await pause();
      endpoint = await bounded(() => read(identity.profilePath));
    }
  }
}
