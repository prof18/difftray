import { describe, expect, it, vi } from "vitest";
import { checkAgentConnection } from "./agent-setup.js";

describe("agent connection check", () => {
  const base = {
    resourcesPath: "/Apps/Difftray Alpha.app/Contents/Resources",
    profilePath: "/profiles/alpha",
    profileOverride: true,
    env: { PATH: "/bin", HOME: "/users/test", DIFFTRAY_USER_DATA_DIR: "/stale" }
  };
  it("checks the bundled CLI with a timeout and the current overridden profile", async () => {
    const execFile = vi
      .fn()
      .mockResolvedValue({ stdout: '{"ok":true,"result":{"connected":true}}' });
    expect(await checkAgentConnection({ ...base, execFile })).toEqual({
      status: "connected"
    });
    expect(execFile).toHaveBeenCalledWith(
      `/Apps/Difftray Alpha.app/Contents/Resources/bin/difftray`,
      ["doctor", "--json"],
      {
        timeout: 20_000,
        env: {
          PATH: "/bin",
          HOME: "/users/test",
          DIFFTRAY_USER_DATA_DIR: "/profiles/alpha"
        }
      }
    );
    expect(base.env.DIFFTRAY_USER_DATA_DIR).toBe("/stale");
    await checkAgentConnection({ ...base, profileOverride: false, execFile });
    expect(execFile.mock.calls[1]?.[2].env).toEqual({
      PATH: "/bin",
      HOME: "/users/test"
    });
  });
  it("reads CLI JSON errors even when the CLI exits unsuccessfully", async () => {
    const stdout = '{"ok":false,"error":{"message":"Desktop startup timeout"}}';
    for (const execFile of [
      vi.fn().mockResolvedValue({ stdout }),
      vi.fn().mockRejectedValue(Object.assign(new Error("exit 1"), { stdout }))
    ]) {
      expect(await checkAgentConnection({ ...base, execFile })).toEqual({
        status: "failed",
        message: "Desktop startup timeout"
      });
    }
  });
  it("reports execution and malformed response failures", async () => {
    expect(
      await checkAgentConnection({
        ...base,
        execFile: vi.fn().mockRejectedValue(new Error("timed out"))
      })
    ).toEqual({ status: "failed", message: "timed out" });
    for (const stdout of ["not json", "{}", '{"ok":true,"result":{"connected":false}}']) {
      expect(
        await checkAgentConnection({
          ...base,
          execFile: vi.fn().mockResolvedValue({ stdout })
        })
      ).toMatchObject({ status: "failed", message: expect.any(String) });
    }
  });
});
