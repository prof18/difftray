import { describe, expect, it, vi } from "vitest";

import { initialUpdatePhase, nextUpdatePhase, UpdateState } from "./update-state.js";

describe("UpdateState", () => {
  it("starts idle", () => {
    expect(new UpdateState().phase).toEqual(initialUpdatePhase);
  });

  it("tracks the update lifecycle", () => {
    let phase = nextUpdatePhase(initialUpdatePhase, { kind: "checking" });
    expect(phase).toEqual({ kind: "checking" });

    phase = nextUpdatePhase(phase, { kind: "available", version: "0.1.0" });
    expect(phase).toEqual({ kind: "available", version: "0.1.0" });

    phase = nextUpdatePhase(phase, { kind: "progress", percent: 42 });
    expect(phase).toEqual({ kind: "downloading", percent: 42, version: "0.1.0" });

    phase = nextUpdatePhase(phase, { kind: "downloaded", version: "0.1.0" });
    expect(phase).toEqual({ kind: "downloaded", version: "0.1.0" });
  });

  it("returns to idle when no update is available", () => {
    expect(nextUpdatePhase({ kind: "checking" }, { kind: "not-available" })).toEqual({
      kind: "idle"
    });
  });

  it("keeps a downloaded update ready across later check events", () => {
    const downloaded = { kind: "downloaded", version: "0.1.0" } as const;

    expect(nextUpdatePhase(downloaded, { kind: "checking" })).toEqual(downloaded);
    expect(nextUpdatePhase(downloaded, { kind: "not-available" })).toEqual(downloaded);
    expect(nextUpdatePhase(downloaded, { kind: "error", message: "offline" })).toEqual(
      downloaded
    );
  });

  it("surfaces errors and can recover on a later check", () => {
    let phase = nextUpdatePhase(
      { kind: "checking" },
      { kind: "error", message: "offline" }
    );
    expect(phase).toEqual({ kind: "error", message: "offline" });

    phase = nextUpdatePhase(phase, { kind: "checking" });
    expect(phase).toEqual({ kind: "checking" });
  });

  it("notifies and unsubscribes listeners", () => {
    const state = new UpdateState();
    const listener = vi.fn();
    const unsubscribe = state.subscribe(listener);

    state.handleEvent({ kind: "checking" });
    unsubscribe();
    state.handleEvent({ kind: "available", version: "0.1.0" });

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({ kind: "checking" });
  });
});
