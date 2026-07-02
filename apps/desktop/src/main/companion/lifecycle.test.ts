import { COMPANION_PROTOCOL_VERSION } from "@difftray/companion-protocol";
import type { AppSettingsRecord } from "@difftray/storage";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CompanionLifecycleController,
  CompanionWorkspaceChangeBroadcaster,
  companionAdvertisementServiceConfig,
  type CompanionAdvertisementInput,
  type CompanionAdvertiser
} from "./lifecycle.js";
import type { CompanionServer } from "./server.js";

describe("CompanionLifecycleController", () => {
  it("starts the server and advertises mDNS when enabled", async () => {
    const server = fakeServer({ port: 48620 });
    const advertisements: CompanionAdvertisementInput[] = [];
    const advertiser = fakeAdvertiser(advertisements);
    const controller = new CompanionLifecycleController({
      createAdvertiser: () => advertiser,
      createServer: () => server,
      serverIdentity: () => serverIdentity
    });

    await controller.applySettings(settings({ companionEnabled: true }));

    expect(server.start).toHaveBeenCalledWith(48620);
    expect(advertisements).toEqual([
      {
        port: 48620,
        serverId: "server-id",
        serverName: "Integration Mac"
      }
    ]);
    expect(advertiser.publish).toHaveBeenCalledWith({
      port: 48620,
      serverId: "server-id",
      serverName: "Integration Mac"
    });
    expect(controller.state).toEqual({
      enabled: true,
      port: 48620,
      status: "running"
    });
  });

  it("walks the companion port range without mutating the persisted preferred port", async () => {
    const first = fakeServer({
      error: Object.assign(new Error("port busy"), { code: "EADDRINUSE" })
    });
    const second = fakeServer({ port: 48621 });
    const servers = [first, second];
    const advertisements: CompanionAdvertisementInput[] = [];
    const persistedSettings = settings({
      companionEnabled: true,
      companionPort: 48620
    });
    const controller = new CompanionLifecycleController({
      createAdvertiser: () => fakeAdvertiser(advertisements),
      createServer: () => {
        const server = servers.shift();

        if (!server) {
          throw new Error("Unexpected server start");
        }

        return server;
      },
      serverIdentity: () => serverIdentity
    });

    await controller.applySettings(persistedSettings);

    expect(first.start).toHaveBeenCalledWith(48620);
    expect(first.stop).toHaveBeenCalledOnce();
    expect(second.start).toHaveBeenCalledWith(48621);
    expect(advertisements).toEqual([
      {
        port: 48621,
        serverId: "server-id",
        serverName: "Integration Mac"
      }
    ]);
    expect(persistedSettings.companionPort).toBe(48620);
    expect(controller.state).toMatchObject({ port: 48621, status: "running" });
  });

  it("broadcasts shutdown and stops advertising when disabled", async () => {
    const advertisement = { stop: vi.fn() };
    const advertiser = fakeAdvertiser([], advertisement);
    const server = fakeServer({ port: 48620 });
    const controller = new CompanionLifecycleController({
      createAdvertiser: () => advertiser,
      createServer: () => server,
      serverIdentity: () => serverIdentity
    });

    await controller.applySettings(settings({ companionEnabled: true }));
    await controller.applySettings(settings({ companionEnabled: false }));

    expect(server.broadcast).toHaveBeenCalledWith({ kind: "server_stopping" });
    expect(advertisement.stop).toHaveBeenCalledOnce();
    expect(advertiser.destroy).toHaveBeenCalledOnce();
    expect(server.stop).toHaveBeenCalledOnce();
    expect(controller.state).toEqual({
      enabled: false,
      status: "stopped"
    });
  });

  it("reports startup errors when no allowed companion port is available", async () => {
    const servers = Array.from({ length: 10 }, () =>
      fakeServer({
        error: Object.assign(new Error("port busy"), { code: "EADDRINUSE" })
      })
    );
    const controller = new CompanionLifecycleController({
      createAdvertiser: () => fakeAdvertiser([]),
      createServer: () => {
        const server = servers.shift();

        if (!server) {
          throw new Error("Unexpected server start");
        }

        return server;
      },
      serverIdentity: () => serverIdentity
    });

    await controller.applySettings(settings({ companionEnabled: true }));

    expect(controller.state).toEqual({
      enabled: true,
      errorMessage: "No companion port is available in 48620-48629.",
      status: "error"
    });
  });

  it("builds the protocol mDNS service config", () => {
    expect(
      companionAdvertisementServiceConfig({
        port: 48621,
        serverId: "server-id",
        serverName: "Integration Mac"
      })
    ).toEqual({
      name: "Integration Mac",
      port: 48621,
      protocol: "tcp",
      txt: {
        id: "server-id",
        port: "48621",
        pv: String(COMPANION_PROTOCOL_VERSION)
      },
      type: "difftray"
    });
  });
});

describe("CompanionWorkspaceChangeBroadcaster", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces workspace change broadcasts per project", async () => {
    vi.useFakeTimers();
    const broadcast = vi.fn();
    const broadcaster = new CompanionWorkspaceChangeBroadcaster({
      broadcast,
      debounceMs: 1_000
    });

    broadcaster.notify("project-1", "filesystem");
    broadcaster.notify("project-1", "filesystem");
    broadcaster.notify("project-2", "filesystem");

    await vi.advanceTimersByTimeAsync(999);
    expect(broadcast).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    expect(broadcast).toHaveBeenCalledTimes(2);
    expect(broadcast).toHaveBeenCalledWith("project-1", "filesystem");
    expect(broadcast).toHaveBeenCalledWith("project-2", "filesystem");
  });

  it("can cancel pending workspace change broadcasts", async () => {
    vi.useFakeTimers();
    const broadcast = vi.fn();
    const broadcaster = new CompanionWorkspaceChangeBroadcaster({
      broadcast,
      debounceMs: 1_000
    });

    broadcaster.notify("project-1", "filesystem");
    broadcaster.dispose();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(broadcast).not.toHaveBeenCalled();
  });
});

const serverIdentity = {
  appVersion: "0.0.0-test",
  serverId: "server-id",
  serverName: "Integration Mac",
  serverPublicKey: "server-public-key"
};

function settings(input: Partial<AppSettingsRecord>): AppSettingsRecord {
  return {
    autoCollapseHunksOver: 120,
    companionEnabled: false,
    companionPort: 48620,
    defaultDiffMode: "split",
    hideWhitespaceOnlyChanges: false,
    notifyOnDrift: true,
    reviewResetTrigger: "diff_content",
    showGeneratedFiles: false,
    themeMode: "system",
    wrapDiffLines: true,
    ...input
  };
}

function fakeServer(
  input: { readonly error?: Error; readonly port?: number } = {}
): CompanionServer & {
  readonly broadcast: ReturnType<typeof vi.fn>;
  readonly start: ReturnType<typeof vi.fn>;
  readonly stop: ReturnType<typeof vi.fn>;
} {
  return {
    broadcast: vi.fn(),
    start: vi.fn(async (port: number) => {
      if (input.error) {
        throw input.error;
      }

      return { port: input.port ?? port };
    }),
    stop: vi.fn(async () => undefined)
  };
}

function fakeAdvertiser(
  advertisements: CompanionAdvertisementInput[],
  advertisement = { stop: vi.fn() }
): CompanionAdvertiser & {
  readonly destroy: ReturnType<typeof vi.fn>;
  readonly publish: ReturnType<typeof vi.fn>;
} {
  return {
    destroy: vi.fn(async () => undefined),
    publish: vi.fn((input: CompanionAdvertisementInput) => {
      advertisements.push(input);

      return advertisement;
    })
  };
}
