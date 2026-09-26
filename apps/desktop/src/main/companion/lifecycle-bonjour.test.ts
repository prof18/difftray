import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bonjourMocks = vi.hoisted(() => {
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>();
  const service = {
    emit: vi.fn((event: string, ...args: unknown[]) => {
      for (const listener of listeners.get(event) ?? []) {
        listener(...args);
      }
    }),
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
      return service;
    }),
    stop: vi.fn((callback?: () => void) => callback?.())
  };

  return {
    constructor: vi.fn(),
    destroy: vi.fn((callback?: () => void) => callback?.()),
    publish: vi.fn<(input: unknown) => typeof service>(() => service),
    resetService: () => {
      listeners.clear();
      service.emit.mockClear();
      service.on.mockClear();
      service.stop.mockClear();
    },
    service
  };
});

vi.mock("bonjour-service", () => ({
  Bonjour: class {
    constructor(options?: unknown, errorCallback?: (error: Error) => void) {
      bonjourMocks.constructor(options, errorCallback);
    }

    destroy(callback?: () => void): void {
      bonjourMocks.destroy(callback);
    }

    publish(input: unknown): typeof bonjourMocks.service {
      return bonjourMocks.publish(input);
    }
  }
}));

import { classifyBonjourError, createBonjourCompanionAdvertiser } from "./lifecycle.js";

describe("classifyBonjourError", () => {
  const codedError = (code: string): Error & { readonly code: string } =>
    Object.assign(new Error(code), { code });

  it.each([
    ["darwin", "EHOSTUNREACH", "blocked"],
    ["darwin", "EPERM", "blocked"],
    ["darwin", "EACCES", "blocked"],
    ["darwin", "ENETDOWN", "transient"],
    ["darwin", "ENETUNREACH", "transient"],
    ["darwin", "EADDRNOTAVAIL", "transient"],
    ["darwin", "EHOSTDOWN", "transient"],
    ["linux", "EHOSTUNREACH", "transient"],
    ["linux", "EPERM", "failed"],
    ["linux", "EACCES", "failed"],
    ["linux", "ENETDOWN", "transient"],
    ["linux", "ENETUNREACH", "transient"],
    ["linux", "EADDRNOTAVAIL", "transient"],
    ["linux", "EHOSTDOWN", "transient"]
  ] as const)("classifies %s %s as %s", (platform, code, expectedClassification) => {
    expect(classifyBonjourError(codedError(code), platform)).toBe(expectedClassification);
  });

  it("classifies non-Error values as failed", () => {
    expect(classifyBonjourError({ code: "EHOSTUNREACH" }, "darwin")).toBe("failed");
  });
});

describe("createBonjourCompanionAdvertiser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bonjourMocks.resetService();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const advertisementInput = {
    port: 48620,
    serverId: "server-id",
    serverName: "Marco’s Mac Studio (Alpha)"
  };

  const errorHandler = (): ((error: Error) => void) | undefined =>
    bonjourMocks.constructor.mock.calls[0]?.[1] as ((error: Error) => void) | undefined;

  it("reports starting and then advertising when Bonjour publishes", () => {
    const onState = vi.fn();
    const advertiser = createBonjourCompanionAdvertiser();

    advertiser.publish(advertisementInput, onState);
    bonjourMocks.service.emit("up");

    expect(onState.mock.calls).toEqual([
      [{ status: "starting", name: advertisementInput.serverName }],
      [{ status: "advertising", name: advertisementInput.serverName }]
    ]);
  });

  it("reports blocked errors with their code", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onState = vi.fn();
    const advertiser = createBonjourCompanionAdvertiser();
    const error = Object.assign(new Error("blocked"), { code: "EHOSTUNREACH" });

    advertiser.publish(advertisementInput, onState);
    errorHandler()?.(error);

    expect(onState).toHaveBeenLastCalledWith({
      status: "blocked",
      name: advertisementInput.serverName,
      errorCode: "EHOSTUNREACH"
    });
  });

  it("does not report advertising after a terminal error", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onState = vi.fn();
    const advertiser = createBonjourCompanionAdvertiser();

    advertiser.publish(advertisementInput, onState);
    errorHandler()?.(Object.assign(new Error("blocked"), { code: "EHOSTUNREACH" }));
    bonjourMocks.service.emit("up");

    expect(onState).not.toHaveBeenCalledWith({
      status: "advertising",
      name: advertisementInput.serverName
    });
  });

  it("ignores Bonjour errors after the advertisement stops", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onState = vi.fn();
    const advertiser = createBonjourCompanionAdvertiser();
    const advertisement = advertiser.publish(advertisementInput, onState);

    await advertisement.stop();
    errorHandler()?.(Object.assign(new Error("blocked"), { code: "EHOSTUNREACH" }));

    expect(onState).toHaveBeenCalledTimes(1);
  });

  it("reports a silent publication failure after ten seconds", async () => {
    vi.useFakeTimers();
    const onState = vi.fn();
    const advertiser = createBonjourCompanionAdvertiser();

    advertiser.publish(advertisementInput, onState);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(onState).toHaveBeenLastCalledWith({
      status: "failed",
      name: advertisementInput.serverName,
      errorCode: "not_published"
    });
  });

  it("preserves the original publication deadline after a transient error", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const onState = vi.fn();
    const advertiser = createBonjourCompanionAdvertiser();

    advertiser.publish(advertisementInput, onState);
    await vi.advanceTimersByTimeAsync(1_000);
    errorHandler()?.(Object.assign(new Error("network down"), { code: "ENETDOWN" }));
    expect(onState).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(9_000);
    expect(onState).toHaveBeenLastCalledWith({
      status: "failed",
      name: advertisementInput.serverName,
      errorCode: "not_published"
    });
  });

  it("reports blocked multicast routes on macOS without throwing", () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    createBonjourCompanionAdvertiser();
    const error = Object.assign(new Error("send EHOSTUNREACH 224.0.0.251:5353"), {
      code: "EHOSTUNREACH"
    });

    expect(errorHandler()).toBeTypeOf("function");
    expect(() => errorHandler()?.(error)).not.toThrow();
    expect(errorLog).toHaveBeenCalledWith(
      "Bonjour/mDNS advertisement blocked: Local Network access may be off",
      error
    );
  });
});
