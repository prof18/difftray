import type { SpawnOptions } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { AgentProtocolError, type AgentResponse } from "../shared/agent-protocol.js";
import type { AgentEndpoint } from "../shared/agent-endpoint.js";
import { connectAgent, launchAgentApp } from "./agent-connection.js";
const identity = {
  profilePath: "/profile",
  appId: "app",
  flavor: "alpha" as const,
  executablePath: "/bundle/executable",
  protocolVersion: 1 as const
};
const endpoint: AgentEndpoint = {
  ...identity,
  instanceId: "first",
  appVersion: "1",
  token: "a".repeat(64),
  socketPath: "/socket"
};
const success = (value = endpoint): AgentResponse<"hello"> => ({
  version: 1,
  id: "hello",
  ok: true,
  result: value
});
function harness(records: (AgentEndpoint | null)[] = [endpoint]) {
  let time = 0;
  const readEndpoint = vi.fn(async () =>
    records.length > 1 ? (records.shift() ?? null) : (records[0] ?? null)
  );
  const hello = vi.fn(async () => success());
  const launch = vi.fn(async () => undefined);
  return {
    readEndpoint,
    hello,
    launch,
    sleep: vi.fn(async (ms: number) => {
      time += ms;
    }),
    now: () => time
  };
}
describe("agent startup connection", () => {
  it("uses a running matching instance without launching", async () => {
    const deps = harness();
    expect(await connectAgent(identity, deps)).toEqual(endpoint);
    expect(deps.launch).not.toHaveBeenCalled();
  });
  it("launches once for missing and refused endpoints", async () => {
    const deps = harness([null, endpoint, endpoint]);
    deps.hello.mockRejectedValueOnce(
      new AgentProtocolError("app_unavailable", "refused")
    );
    await connectAgent(identity, deps);
    expect(deps.launch).toHaveBeenCalledExactlyOnceWith(identity);
  });
  it.each(["busy", "unsupported_version", "unauthorized"] as const)(
    "never launches for %s",
    async (code) => {
      const deps = harness();
      deps.hello.mockRejectedValue(new AgentProtocolError(code, "terminal"));
      await expect(connectAgent(identity, deps)).rejects.toMatchObject({ code });
      expect(deps.launch).not.toHaveBeenCalled();
      expect(deps.hello).toHaveBeenCalledTimes(1);
    }
  );
  it("recovers one retired generation without launching", async () => {
    const next = { ...endpoint, instanceId: "second", token: "b".repeat(64) };
    const deps = harness([endpoint, null, null, next]);
    deps.hello
      .mockRejectedValueOnce(new AgentProtocolError("unauthorized", "old token"))
      .mockResolvedValueOnce(success(next));
    expect(await connectAgent(identity, deps)).toEqual(next);
    expect(deps.launch).not.toHaveBeenCalled();
    expect(deps.hello).toHaveBeenCalledTimes(2);
  });
  it("rejects changed identity before hello or launch", async () => {
    const deps = harness([{ ...endpoint, flavor: "production" }]);
    await expect(connectAgent(identity, deps)).rejects.toMatchObject({
      code: "profile_mismatch"
    });
    expect(deps.hello).not.toHaveBeenCalled();
  });
  it("rejects further generation churn", async () => {
    const next = { ...endpoint, instanceId: "second" };
    const deps = harness([endpoint, next]);
    deps.hello
      .mockRejectedValueOnce(new AgentProtocolError("unauthorized", "old"))
      .mockResolvedValueOnce(success({ ...next, instanceId: "third" }));
    await expect(connectAgent(identity, deps)).rejects.toMatchObject({ code: "busy" });
  });
  it("retains the original startup deadline during replacement", async () => {
    const deps = harness([endpoint, null]);
    deps.hello.mockRejectedValueOnce(new AgentProtocolError("unauthorized", "old"));
    await expect(connectAgent(identity, deps)).rejects.toMatchObject({
      code: "app_unavailable",
      message: expect.stringContaining("startup timeout")
    });
    expect(deps.now()).toBe(30_000);
    expect(deps.launch).not.toHaveBeenCalled();
  });
  it("rejects a second authentication failure without another refresh", async () => {
    const next = { ...endpoint, instanceId: "second" };
    const deps = harness([endpoint, next]);
    deps.hello.mockRejectedValue(new AgentProtocolError("unauthorized", "bad"));
    await expect(connectAgent(identity, deps)).rejects.toMatchObject({
      code: "unauthorized"
    });
    expect(deps.readEndpoint).toHaveBeenCalledTimes(2);
    expect(deps.hello).toHaveBeenCalledTimes(2);
    expect(deps.launch).not.toHaveBeenCalled();
  });
  it("rejects unsafe replacement metadata without launching", async () => {
    const deps = harness();
    deps.readEndpoint
      .mockResolvedValueOnce(endpoint)
      .mockRejectedValueOnce(new AgentProtocolError("unauthorized", "unsafe"));
    deps.hello.mockRejectedValueOnce(new AgentProtocolError("unauthorized", "old"));
    await expect(connectAgent(identity, deps)).rejects.toMatchObject({
      code: "unauthorized"
    });
    expect(deps.hello).toHaveBeenCalledTimes(1);
    expect(deps.launch).not.toHaveBeenCalled();
  });
  it("requires hello to match bundle identity", async () => {
    const deps = harness();
    deps.hello.mockResolvedValueOnce(success({ ...endpoint, executablePath: "/other" }));
    await expect(connectAgent(identity, deps)).rejects.toMatchObject({
      code: "profile_mismatch"
    });
    expect(deps.launch).not.toHaveBeenCalled();
  });
  it("fails cold-start timeout after at most one launch", async () => {
    const deps = harness([null]);
    await expect(connectAgent(identity, deps)).rejects.toMatchObject({
      code: "app_unavailable"
    });
    expect(deps.launch).toHaveBeenCalledTimes(1);
    expect(deps.now()).toBe(30_000);
  });
  it("omits the profile override for the own-bundle default", async () => {
    const child = { once: vi.fn(), unref: vi.fn() };
    child.once.mockImplementation((event: string, callback: () => void) => {
      if (event === "spawn") callback();
      return child;
    });
    const spawn = vi.fn<
      (executable: string, args: string[], options: SpawnOptions) => typeof child
    >(() => child);
    await launchAgentApp(
      { ...identity, profileOverride: false },
      {
        spawn,
        env: { DIFFTRAY_USER_DATA_DIR: "/stale", KEEP: "yes" }
      }
    );
    expect(spawn.mock.calls[0]?.[2].env).toEqual({
      KEEP: "yes",
      DIFFTRAY_APP_VARIANT: "alpha"
    });
  });
  it("preserves a whitespace-containing explicit profile override", async () => {
    const child = { once: vi.fn(), unref: vi.fn() };
    child.once.mockImplementation((event: string, callback: () => void) => {
      if (event === "spawn") callback();
      return child;
    });
    const spawn = vi.fn<
      (executable: string, args: string[], options: SpawnOptions) => typeof child
    >(() => child);
    await launchAgentApp(
      { ...identity, profilePath: "/profile with spaces ", profileOverride: true },
      {
        spawn,
        env: { DIFFTRAY_USER_DATA_DIR: "/other" }
      }
    );
    expect(spawn.mock.calls[0]?.[2].env?.DIFFTRAY_USER_DATA_DIR).toBe(
      "/profile with spaces "
    );
  });
  it("sanitizes child environment and preserves cwd", async () => {
    const child = { once: vi.fn(), unref: vi.fn() };
    child.once.mockImplementation((event: string, callback: () => void) => {
      if (event === "spawn") callback();
      return child;
    });
    const spawn = vi.fn(() => child);
    await launchAgentApp(identity, {
      spawn,
      cwd: "/real/cwd",
      env: {
        ELECTRON_RUN_AS_NODE: "1",
        ELECTRON_NO_ASAR: "1",
        NODE_OPTIONS: "bad",
        DIFFTRAY_APP_VARIANT: "production",
        KEEP: "yes"
      }
    });
    expect(spawn).toHaveBeenCalledWith(identity.executablePath, ["--agent-background"], {
      cwd: "/real/cwd",
      env: {
        KEEP: "yes",
        DIFFTRAY_USER_DATA_DIR: "/profile",
        DIFFTRAY_APP_VARIANT: "alpha"
      },
      detached: true,
      stdio: "ignore"
    });
    expect(child.unref).toHaveBeenCalledOnce();
  });
});
