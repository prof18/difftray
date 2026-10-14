import { describe, expect, it } from "vitest";
import { AgentProtocolError } from "../shared/agent-protocol.js";
import { runDoctor } from "./diagnostics.js";
const runtime = {
  executablePath: "/Applications/Renamed.app/Contents/MacOS/Difftray",
  profilePath: "/Users/test/profile",
  appId: "com.prof18.difftray",
  flavor: "production" as const,
  protocolVersion: 1 as const,
  appVersion: "1.2.3"
};
describe("doctor diagnostics", () => {
  it("reports the own bundle, profile, CLI version and verified connection without endpoint secrets", async () => {
    const result = await runDoctor(runtime, async () => ({
      ...runtime,
      instanceId: "instance",
      token: "secret-token",
      socketPath: "/secret/socket"
    }));
    expect(result).toMatchObject({
      ok: true,
      result: {
        bundlePath: "/Applications/Renamed.app",
        profilePath: runtime.profilePath,
        cliVersion: "1.2.3",
        connected: true,
        instanceId: "instance"
      }
    });
    expect(JSON.stringify(result)).not.toContain("secret");
  });
  it("retains selected bundle diagnostics when startup or protocol negotiation fails", async () => {
    const result = await runDoctor(runtime, async () => {
      throw new AgentProtocolError("unsupported_version", "Incompatible protocol");
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "unsupported_version" },
      diagnostics: {
        connected: false,
        bundlePath: "/Applications/Renamed.app",
        profilePath: runtime.profilePath
      }
    });
  });
});
