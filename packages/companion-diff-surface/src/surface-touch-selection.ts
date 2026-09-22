import type { SelectedLineRange } from "@pierre/diffs";
import type { TouchLineTarget } from "./surface-touch-target.js";

export const LONG_PRESS_MS = 500;
export const MOVE_SLOP_PX = 10;
type Controller = {
  down(pointerId: number, target: TouchLineTarget, x: number, y: number): void;
  move(pointerId: number, x: number, y: number): void;
  up(pointerId: number): void;
  cancelPointer(): void;
  reset(): void;
  confirm(): void;
  readonly range: SelectedLineRange | null;
};

export function createSurfaceTouchSelection({
  onRangeChange,
  onSelect
}: {
  readonly onRangeChange: (range: SelectedLineRange | null) => void;
  readonly onSelect: (range: SelectedLineRange) => void;
}): Controller {
  let active: SelectedLineRange | null = null;
  let pending: {
    id: number;
    target: TouchLineTarget;
    x: number;
    y: number;
    endpoint: boolean;
  } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  const setRange = (value: SelectedLineRange | null) => {
    active = value;
    onRangeChange(value);
  };
  const controller: Controller = {
    down(id, target, x, y) {
      if (pending) {
        clearTimer();
        pending = null;
        return;
      }
      if (active && target.side !== active.side) return;
      pending = { id, target, x, y, endpoint: Boolean(active) };
      timer = setTimeout(() => {
        timer = null;
        if (pending?.id !== id) return;
        if (pending.endpoint) return;
        setRange({ start: target.lineNumber, end: target.lineNumber, side: target.side });
      }, LONG_PRESS_MS);
    },
    move(id, x, y) {
      if (pending?.id !== id) return;
      if (Math.hypot(x - pending.x, y - pending.y) > MOVE_SLOP_PX) {
        clearTimer();
        pending = null;
      }
    },
    up(id) {
      if (pending?.id !== id) return;
      const wasEndpoint = pending.endpoint;
      const target = pending.target;
      clearTimer();
      pending = null;
      if (!active)
        onSelect({ start: target.lineNumber, end: target.lineNumber, side: target.side });
      else if (wasEndpoint)
        setRange({
          start: active.start,
          end: target.lineNumber,
          ...(active.side ? { side: active.side } : {})
        });
    },
    cancelPointer() {
      clearTimer();
      pending = null;
    },
    reset() {
      clearTimer();
      pending = null;
      setRange(null);
    },
    confirm() {
      if (active) {
        const value = active;
        clearTimer();
        pending = null;
        active = null;
        onRangeChange(null);
        onSelect(value);
      }
    },
    get range() {
      return active;
    }
  };
  return controller;
}
