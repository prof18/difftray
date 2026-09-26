import type dgram from "node:dgram";
import { EventEmitter } from "node:events";

import { afterEach, describe, expect, it, vi } from "vitest";

import { mdnsProbeQuery, probeLocalNetworkAccess } from "./local-network-probe.js";

type FakeSocket = EventEmitter & {
  readonly close: ReturnType<typeof vi.fn>;
  readonly connect: ReturnType<typeof vi.fn>;
  readonly send: ReturnType<typeof vi.fn>;
};

function codedError(code: string): Error & { readonly code: string } {
  return Object.assign(new Error(code), { code });
}

function createFakeSocket(
  options: {
    readonly connect?: boolean;
    readonly sendError?: Error;
  } = {}
): FakeSocket {
  const socket = new EventEmitter() as FakeSocket;

  Object.assign(socket, {
    close: vi.fn(),
    connect: vi.fn((_port: number, _address: string, callback: () => void) => {
      if (options.connect !== false) {
        callback();
      }
    }),
    send: vi.fn((_message: Buffer, callback: (error?: Error) => void) => {
      callback(options.sendError);
    })
  });

  return socket;
}

function injectedCreateSocket(socket: FakeSocket): typeof dgram.createSocket {
  return vi.fn(() => socket) as unknown as typeof dgram.createSocket;
}

describe("mdnsProbeQuery", () => {
  it("builds a PTR/IN query for _difftray._tcp.local", () => {
    const query = mdnsProbeQuery();
    let offset = 12;
    const labels: string[] = [];

    expect(query.readUInt16BE(4)).toBe(1);

    while (query[offset] !== 0) {
      const length = query[offset] ?? 0;
      offset += 1;
      labels.push(query.subarray(offset, offset + length).toString("ascii"));
      offset += length;
    }

    offset += 1;
    expect(labels.join(".")).toBe("_difftray._tcp.local");
    expect(query.readUInt16BE(offset)).toBe(12);
    expect(query.readUInt16BE(offset + 2)).toBe(1);
  });
});

describe("probeLocalNetworkAccess", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("connects, sends the mDNS query and reports allowed", async () => {
    const socket = createFakeSocket();

    await expect(
      probeLocalNetworkAccess({
        createSocket: injectedCreateSocket(socket),
        platform: "darwin"
      })
    ).resolves.toBe("allowed");

    expect(socket.connect).toHaveBeenCalledWith(
      5353,
      "224.0.0.251",
      expect.any(Function)
    );
    expect(socket.send).toHaveBeenCalledWith(mdnsProbeQuery(), expect.any(Function));
    expect(socket.close).toHaveBeenCalledTimes(1);
  });

  it("reports a blocked send on macOS", async () => {
    const socket = createFakeSocket({ sendError: codedError("EHOSTUNREACH") });

    await expect(
      probeLocalNetworkAccess({
        createSocket: injectedCreateSocket(socket),
        platform: "darwin"
      })
    ).resolves.toBe("blocked");

    expect(socket.close).toHaveBeenCalledTimes(1);
  });

  it("reports a blocked socket error on macOS", async () => {
    const socket = createFakeSocket({ connect: false });
    const result = probeLocalNetworkAccess({
      createSocket: injectedCreateSocket(socket),
      platform: "darwin"
    });

    socket.emit("error", codedError("EHOSTUNREACH"));

    await expect(result).resolves.toBe("blocked");
    expect(socket.close).toHaveBeenCalledTimes(1);
  });

  it("does not treat unknown send errors as a permission denial", async () => {
    const socket = createFakeSocket({ sendError: codedError("EINVAL") });

    await expect(
      probeLocalNetworkAccess({
        createSocket: injectedCreateSocket(socket),
        platform: "darwin"
      })
    ).resolves.toBe("allowed");

    expect(socket.close).toHaveBeenCalledTimes(1);
  });

  it("reports allowed after the probe timeout", async () => {
    vi.useFakeTimers();
    const socket = createFakeSocket({ connect: false });
    const result = probeLocalNetworkAccess({
      createSocket: injectedCreateSocket(socket),
      platform: "darwin"
    });

    await vi.advanceTimersByTimeAsync(1_000);

    await expect(result).resolves.toBe("allowed");
    expect(socket.close).toHaveBeenCalledTimes(1);
  });

  it("is unsupported outside macOS without creating a socket", async () => {
    const createSocket = vi.fn();

    await expect(
      probeLocalNetworkAccess({
        createSocket: createSocket as unknown as typeof dgram.createSocket,
        platform: "linux"
      })
    ).resolves.toBe("unsupported");

    expect(createSocket).not.toHaveBeenCalled();
  });
});
