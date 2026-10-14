import { mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createAgentWindowEnsurer,
  acquireAgentProfile,
  isBackgroundAgentLaunch,
  optionalAgentServiceFailure
} from "./agent-app-lifecycle.js";

describe("agent profile lifecycle", () => {
  it("canonicalizes the override and sets Electron's profile before acquiring its lock", () => {
    const root = mkdtempSync(path.join(tmpdir(), "agent-profile-"));
    try {
      symlinkSync(root, `${root}-link`);
      const calls: string[] = [];
      const app = {
        setPath: (_name: string, value: string) => calls.push(value),
        requestSingleInstanceLock: (data: unknown) => {
          calls.push(JSON.stringify(data));
          return true;
        },
        quit: vi.fn()
      };
      expect(acquireAgentProfile(app, `${root}-link/child`, true)).toBe(true);
      expect(calls).toEqual([
        realpathSync(path.join(root, "child")),
        JSON.stringify({ agentBackground: true })
      ]);
      expect(app.quit).not.toHaveBeenCalled();
    } finally {
      rmSync(`${root}-link`, { force: true });
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("quits the losing process and recognizes only a structured background hint", () => {
    const root = mkdtempSync(path.join(tmpdir(), "agent-profile-"));
    try {
      const app = {
        setPath: vi.fn(),
        requestSingleInstanceLock: vi.fn(() => false),
        quit: vi.fn()
      };
      expect(acquireAgentProfile(app, root, false)).toBe(false);
      expect(app.quit).toHaveBeenCalledOnce();
      expect(isBackgroundAgentLaunch({ agentBackground: true })).toBe(true);
      for (const input of [
        null,
        [],
        "--agent-background",
        { agentBackground: "true" },
        {}
      ])
        expect(isBackgroundAgentLaunch(input)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("startup window serialization", () => {
  it("waits for initialization and collapses startup with a concurrent normal relaunch", async () => {
    let initialized!: () => void;
    const ready = new Promise<void>((resolve) => {
      initialized = resolve;
    });
    let finishWindow!: () => void;
    let exists = false;
    const createWindow = vi.fn(async () => {
      await new Promise<void>((resolve) => {
        finishWindow = resolve;
      });
      exists = true;
    });
    const ensure = createAgentWindowEnsurer({
      ready: () => ready,
      hasWindow: () => exists,
      createWindow
    });
    const normalRelaunch = ensure();
    const startup = ensure();
    expect(createWindow).not.toHaveBeenCalled();
    initialized();
    await Promise.resolve();
    await Promise.resolve();
    expect(createWindow).toHaveBeenCalledOnce();
    finishWindow();
    await Promise.all([normalRelaunch, startup]);
    await ensure();
    expect(createWindow).toHaveBeenCalledOnce();
    exists = false;
    const reopen = ensure();
    await Promise.resolve();
    finishWindow();
    await reopen;
    expect(createWindow).toHaveBeenCalledTimes(2);
  });
});

describe("optional agent service", () => {
  it("keeps the window app running when the agent service cannot start", async () => {
    const log = vi.fn();
    const failure = new Error("unsafe agent directory");
    await expect(
      Promise.reject(failure).catch(
        optionalAgentServiceFailure({ background: false, log })
      )
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(failure);
  });
  it("stays fatal for a quiet CLI launch that exists only to serve agents", async () => {
    const log = vi.fn();
    await expect(
      Promise.reject(new Error("busy")).catch(
        optionalAgentServiceFailure({ background: true, log })
      )
    ).rejects.toThrow("busy");
    expect(log).not.toHaveBeenCalled();
  });
});
