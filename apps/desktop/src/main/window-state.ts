import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

export type WindowBounds = {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
};

export type WindowState = {
  readonly bounds: WindowBounds;
  readonly isFullScreen: boolean;
  readonly isMaximized: boolean;
};

type PersistedWindowState = {
  readonly bounds: WindowBounds;
  readonly isFullScreen: boolean;
  readonly isMaximized: boolean;
  readonly version: 2;
};

const minimumVisibleLength = 100;

export function loadWindowState(
  statePath: string,
  displayWorkAreas: readonly WindowBounds[]
): WindowState | undefined {
  try {
    const state = parseWindowState(readFileSync(statePath, "utf8"));

    if (!state || !isReachable(state.bounds, displayWorkAreas)) {
      return undefined;
    }

    return state;
  } catch {
    return undefined;
  }
}

export function saveWindowState(statePath: string, state: WindowState): boolean {
  if (!isWindowState(state)) {
    return false;
  }

  const temporaryPath = `${statePath}.${String(process.pid)}.tmp`;
  const persistedState: PersistedWindowState = { ...state, version: 2 };

  try {
    mkdirSync(path.dirname(statePath), { recursive: true });
    writeFileSync(temporaryPath, `${JSON.stringify(persistedState)}\n`, "utf8");
    renameSync(temporaryPath, statePath);
    return true;
  } catch {
    try {
      rmSync(temporaryPath, { force: true });
    } catch {
      // The original write failure is already represented by the return value.
    }
    return false;
  }
}

function parseWindowState(value: string): WindowState | undefined {
  const parsed: unknown = JSON.parse(value);

  if (!isRecord(parsed) || !isWindowBounds(parsed.bounds)) {
    return undefined;
  }

  if (parsed.version === 1) {
    return {
      bounds: parsed.bounds,
      isFullScreen: false,
      isMaximized: false
    };
  }

  if (
    parsed.version !== 2 ||
    typeof parsed.isFullScreen !== "boolean" ||
    typeof parsed.isMaximized !== "boolean"
  ) {
    return undefined;
  }

  return {
    bounds: parsed.bounds,
    isFullScreen: parsed.isFullScreen,
    isMaximized: parsed.isMaximized
  };
}

function isWindowState(value: unknown): value is WindowState {
  return (
    isRecord(value) &&
    isWindowBounds(value.bounds) &&
    typeof value.isFullScreen === "boolean" &&
    typeof value.isMaximized === "boolean"
  );
}

function isReachable(
  bounds: WindowBounds,
  displayWorkAreas: readonly WindowBounds[]
): boolean {
  return displayWorkAreas.some((workArea) => {
    if (!isWindowBounds(workArea)) {
      return false;
    }

    const visibleWidth =
      Math.min(bounds.x + bounds.width, workArea.x + workArea.width) -
      Math.max(bounds.x, workArea.x);
    const visibleHeight =
      Math.min(bounds.y + bounds.height, workArea.y + workArea.height) -
      Math.max(bounds.y, workArea.y);

    return visibleWidth >= minimumVisibleLength && visibleHeight >= minimumVisibleLength;
  });
}

function isWindowBounds(value: unknown): value is WindowBounds {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isSafeInteger(value.height) &&
    value.height > 0 &&
    isSafeInteger(value.width) &&
    value.width > 0 &&
    isSafeInteger(value.x) &&
    isSafeInteger(value.y)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}
