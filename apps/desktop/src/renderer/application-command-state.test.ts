import { describe, expect, it, vi } from "vitest";

import {
  canRunApplicationCommand,
  runApplicationCommandIfAllowed
} from "./application-command-state.js";

describe("application command state", () => {
  it("blocks repository and view commands while a project is loading", () => {
    expect(canRunApplicationCommand("loading")).toBe(false);
    expect(canRunApplicationCommand("idle")).toBe(true);
  });

  it("blocks commands while the settings draft is open", () => {
    expect(canRunApplicationCommand("idle", true)).toBe(false);
    expect(canRunApplicationCommand("loading", true)).toBe(false);
  });

  it("does not invoke a native application command while a project is loading", () => {
    const command = vi.fn();

    runApplicationCommandIfAllowed("loading", command);

    expect(command).not.toHaveBeenCalled();
  });

  it("invokes a native application command when the workspace is idle", () => {
    const command = vi.fn();

    runApplicationCommandIfAllowed("idle", command);

    expect(command).toHaveBeenCalledOnce();
  });

  it("does not invoke a native application command while settings are open", () => {
    const command = vi.fn();

    runApplicationCommandIfAllowed("idle", command, true);

    expect(command).not.toHaveBeenCalled();
  });
});
