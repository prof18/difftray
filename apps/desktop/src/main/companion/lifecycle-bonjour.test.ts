import { beforeEach, describe, expect, it, vi } from "vitest";

const bonjourMocks = vi.hoisted(() => ({
  constructor: vi.fn(),
  destroy: vi.fn((callback?: () => void) => callback?.()),
  publish: vi.fn((input: unknown) => ({ input, stop: vi.fn() }))
}));

vi.mock("bonjour-service", () => ({
  Bonjour: class {
    constructor(options?: unknown, errorCallback?: (error: Error) => void) {
      bonjourMocks.constructor(options, errorCallback);
    }

    destroy(callback?: () => void): void {
      bonjourMocks.destroy(callback);
    }

    publish(input: unknown): { readonly stop: ReturnType<typeof vi.fn> } {
      return bonjourMocks.publish(input);
    }
  }
}));

import { createBonjourCompanionAdvertiser } from "./lifecycle.js";

describe("createBonjourCompanionAdvertiser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles unreachable multicast routes without throwing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    createBonjourCompanionAdvertiser();
    const errorHandler = bonjourMocks.constructor.mock.calls[0]?.[1] as
      | ((error: Error) => void)
      | undefined;
    const error = Object.assign(new Error("send EHOSTUNREACH 224.0.0.251:5353"), {
      code: "EHOSTUNREACH"
    });

    expect(errorHandler).toBeTypeOf("function");
    expect(() => errorHandler?.(error)).not.toThrow();
    expect(warn).toHaveBeenCalledWith(
      "Bonjour/mDNS advertisement encountered a transient network error",
      error
    );
  });
});
