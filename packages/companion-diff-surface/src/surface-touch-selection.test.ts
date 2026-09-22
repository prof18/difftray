import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSurfaceTouchSelection, LONG_PRESS_MS } from "./surface-touch-selection.js";
import type { TouchLineTarget } from "./surface-touch-target.js";

const a: TouchLineTarget = { lineNumber: 10, side: "additions" };
const b: TouchLineTarget = { lineNumber: 14, side: "additions" };
describe("surface touch selection", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it("emits a singleton short tap, but a hold enters selection", () => {
    const selected = vi.fn(),
      range = vi.fn();
    const c = createSurfaceTouchSelection({ onRangeChange: range, onSelect: selected });
    c.down(1, a, 0, 0);
    c.up(1);
    expect(selected).toHaveBeenCalledWith({ start: 10, end: 10, side: "additions" });
    c.down(2, a, 0, 0);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(c.range).toEqual({ start: 10, end: 10, side: "additions" });
    expect(range).toHaveBeenCalled();
    c.up(2);
    expect(selected).toHaveBeenCalledTimes(1);
  });
  it("uses the exact threshold and does not emit on hold release", () => {
    const select = vi.fn();
    const c = createSurfaceTouchSelection({ onRangeChange: vi.fn(), onSelect: select });
    c.down(1, a, 0, 0);
    vi.advanceTimersByTime(LONG_PRESS_MS - 1);
    expect(c.range).toBeNull();
    vi.advanceTimersByTime(1);
    expect(c.range).toEqual({ start: 10, end: 10, side: "additions" });
    c.up(1);
    expect(select).not.toHaveBeenCalled();
  });
  it("adjusts same-side endpoints, allows reverse, and ignores opposite side", () => {
    const c = createSurfaceTouchSelection({ onRangeChange: vi.fn(), onSelect: vi.fn() });
    c.down(1, a, 0, 0);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    c.up(1);
    c.down(1, b, 0, 0);
    c.up(1);
    expect(c.range).toEqual({ start: 10, end: 14, side: "additions" });
    c.down(1, { lineNumber: 2, side: "deletions" }, 0, 0);
    c.up(1);
    expect(c.range).toEqual({ start: 10, end: 14, side: "additions" });
  });
  it("keeps the original anchor when endpoints move in either direction", () => {
    const c = createSurfaceTouchSelection({ onRangeChange: vi.fn(), onSelect: vi.fn() });
    c.down(1, { lineNumber: 15, side: "additions" }, 0, 0);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    c.up(1);
    c.down(1, { lineNumber: 10, side: "additions" }, 0, 0);
    c.up(1);
    expect(c.range).toEqual({ start: 15, end: 10, side: "additions" });
    c.down(1, { lineNumber: 18, side: "additions" }, 0, 0);
    c.up(1);
    expect(c.range).toEqual({ start: 15, end: 18, side: "additions" });
  });
  it("cancels pending motion, confirms once, and resets", () => {
    const select = vi.fn();
    const c = createSurfaceTouchSelection({ onRangeChange: vi.fn(), onSelect: select });
    c.down(1, a, 0, 0);
    c.move(1, 11, 0);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    c.up(1);
    expect(select).not.toHaveBeenCalled();
    c.down(1, a, 0, 0);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    c.confirm();
    expect(select).toHaveBeenCalledTimes(1);
    c.confirm();
    expect(c.range).toBeNull();
    c.down(2, a, 0, 0);
    c.reset();
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(c.range).toBeNull();
    expect(select).toHaveBeenCalledTimes(1);
  });
  it("cancels pending endpoint on pointercancel while retaining the active range", () => {
    const c = createSurfaceTouchSelection({ onRangeChange: vi.fn(), onSelect: vi.fn() });
    c.down(1, a, 0, 0);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    c.up(1);
    c.down(1, b, 0, 0);
    c.cancelPointer();
    expect(c.range).toEqual({ start: 10, end: 10, side: "additions" });
  });
  it("rolls back a moving endpoint while retaining the active range", () => {
    const c = createSurfaceTouchSelection({ onRangeChange: vi.fn(), onSelect: vi.fn() });
    c.down(1, a, 0, 0);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    c.up(1);
    c.down(1, b, 0, 0);
    c.move(1, 11, 0);
    c.up(1);
    expect(c.range).toEqual({ start: 10, end: 10, side: "additions" });
  });
  it("cancels a secondary pointer sequence without swallowing a fresh tap", () => {
    const select = vi.fn();
    const c = createSurfaceTouchSelection({ onRangeChange: vi.fn(), onSelect: select });
    c.down(1, a, 0, 0);
    c.down(2, b, 0, 0);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    c.up(2);
    c.down(3, b, 0, 0);
    c.up(3);
    expect(select).toHaveBeenCalledWith({ start: 14, end: 14, side: "additions" });
  });
});
