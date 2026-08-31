import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  loadWindowState,
  saveWindowState,
  type WindowBounds,
  type WindowState
} from "./window-state.js";

const workAreas = [{ height: 900, width: 1_440, x: 0, y: 0 }];
const temporaryDirectories: string[] = [];

function createStatePath(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "difftray-window-state-"));
  temporaryDirectories.push(directory);
  const statePath = path.join(directory, "nested", "window-state.json");
  mkdirSync(path.dirname(statePath), { recursive: true });
  return statePath;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("window bounds persistence", () => {
  it("round-trips the last normal window bounds and presentation mode", () => {
    const statePath = createStatePath();
    const bounds: WindowBounds = {
      height: 720,
      width: 1_100,
      x: 120,
      y: 80
    };
    const state: WindowState = {
      bounds,
      isFullScreen: false,
      isMaximized: true
    };

    saveWindowState(statePath, state);

    expect(loadWindowState(statePath, workAreas)).toEqual(state);
    expect(JSON.parse(readFileSync(statePath, "utf8"))).toEqual({
      bounds,
      isFullScreen: false,
      isMaximized: true,
      version: 2
    });
  });

  it("loads legacy bounds as a normal window", () => {
    const statePath = createStatePath();
    const bounds: WindowBounds = { height: 720, width: 1_100, x: 120, y: 80 };
    writeFileSync(statePath, JSON.stringify({ bounds, version: 1 }), "utf8");

    expect(loadWindowState(statePath, workAreas)).toEqual({
      bounds,
      isFullScreen: false,
      isMaximized: false
    });
  });

  it("replaces an existing state file with the latest window state", () => {
    const statePath = createStatePath();
    saveWindowState(statePath, {
      bounds: { height: 720, width: 1_100, x: 120, y: 80 },
      isFullScreen: false,
      isMaximized: false
    });
    const latestState: WindowState = {
      bounds: { height: 800, width: 1_300, x: 40, y: 20 },
      isFullScreen: true,
      isMaximized: false
    };

    saveWindowState(statePath, latestState);

    expect(loadWindowState(statePath, workAreas)).toEqual(latestState);
  });

  it("restores bounds on a secondary display with negative coordinates", () => {
    const statePath = createStatePath();
    const bounds: WindowBounds = {
      height: 700,
      width: 1_000,
      x: -1_100,
      y: 40
    };
    saveWindowState(statePath, {
      bounds,
      isFullScreen: false,
      isMaximized: false
    });

    expect(
      loadWindowState(statePath, [
        { height: 900, width: 1_440, x: 0, y: 0 },
        { height: 1_080, width: 1_920, x: -1_920, y: 0 }
      ])
    ).toEqual({ bounds, isFullScreen: false, isMaximized: false });
  });

  it("ignores bounds that are no longer reachable on a connected display", () => {
    const statePath = createStatePath();
    saveWindowState(statePath, {
      bounds: { height: 700, width: 1_000, x: 2_000, y: 200 },
      isFullScreen: false,
      isMaximized: false
    });

    expect(loadWindowState(statePath, workAreas)).toBeUndefined();
  });

  it("requires a useful portion of the window to remain reachable", () => {
    const statePath = createStatePath();
    saveWindowState(statePath, {
      bounds: { height: 700, width: 1_000, x: 1_390, y: 850 },
      isFullScreen: false,
      isMaximized: false
    });

    expect(loadWindowState(statePath, workAreas)).toBeUndefined();
  });

  it("ignores undersized bounds that cannot expose a useful visible area", () => {
    const statePath = createStatePath();
    writeFileSync(
      statePath,
      JSON.stringify({
        bounds: { height: 1, width: 1, x: 100, y: 100 },
        version: 1
      }),
      "utf8"
    );

    expect(loadWindowState(statePath, workAreas)).toBeUndefined();
  });

  it("ignores malformed and unsupported state files", () => {
    const malformedPath = createStatePath();
    writeFileSync(malformedPath, "not json", "utf8");
    const unsupportedPath = createStatePath();
    writeFileSync(
      unsupportedPath,
      JSON.stringify({
        bounds: { height: 720, width: 1_100, x: 120, y: 80 },
        version: 2
      }),
      "utf8"
    );

    expect(loadWindowState(malformedPath, workAreas)).toBeUndefined();
    expect(loadWindowState(unsupportedPath, workAreas)).toBeUndefined();
  });

  it("ignores non-finite and non-positive bounds", () => {
    const statePath = createStatePath();
    writeFileSync(
      statePath,
      JSON.stringify({
        bounds: { height: 720, width: 0, x: 120, y: 80 },
        version: 1
      }),
      "utf8"
    );

    expect(loadWindowState(statePath, workAreas)).toBeUndefined();
  });
});
