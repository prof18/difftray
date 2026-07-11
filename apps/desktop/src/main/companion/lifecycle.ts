import { COMPANION_PROTOCOL_VERSION } from "@difftray/companion-protocol";
import type { AppSettingsRecord } from "@difftray/storage";
import { Bonjour, type Service } from "bonjour-service";
import type { ServiceConfig } from "bonjour-service";

import type { CompanionServer } from "./server.js";

export type CompanionAdvertisementInput = {
  readonly port: number;
  readonly serverId: string;
  readonly serverName: string;
};

export type CompanionAdvertisement = {
  readonly stop: () => Promise<void> | void;
};

export type CompanionAdvertiser = {
  readonly destroy: () => Promise<void> | void;
  readonly publish: (input: CompanionAdvertisementInput) => CompanionAdvertisement;
};

export type CompanionServerFactory = () => CompanionServer;

export type CompanionLifecycleState =
  | {
      readonly enabled: false;
      readonly status: "stopped";
    }
  | {
      readonly enabled: true;
      readonly port: number;
      readonly status: "running";
    }
  | {
      readonly enabled: true;
      readonly errorMessage: string;
      readonly status: "error";
    };

export type CompanionServerIdentityProvider = () => {
  readonly appVersion: string;
  readonly serverId: string;
  readonly serverName: string;
  readonly serverPublicKey: string;
};

export type CompanionLifecycleControllerOptions = {
  readonly createAdvertiser?: () => CompanionAdvertiser;
  readonly createServer: CompanionServerFactory;
  readonly serverIdentity: CompanionServerIdentityProvider;
};

type ActiveCompanionServer = {
  readonly advertisement: CompanionAdvertisement;
  readonly advertiser: CompanionAdvertiser;
  readonly port: number;
  readonly server: CompanionServer;
};

type WorkspaceChangedReason = "comments" | "diff_target" | "filesystem" | "review_state";
type Timer = ReturnType<typeof setTimeout>;

const companionPortRangeStart = 48620;
const companionPortRangeEnd = 48629;

export class CompanionLifecycleController {
  private active: ActiveCompanionServer | undefined;
  private readonly createAdvertiser: () => CompanionAdvertiser;
  private readonly createServer: CompanionServerFactory;
  private readonly serverIdentity: CompanionServerIdentityProvider;
  private currentState: CompanionLifecycleState = {
    enabled: false,
    status: "stopped"
  };

  constructor(options: CompanionLifecycleControllerOptions) {
    this.createAdvertiser = options.createAdvertiser ?? createBonjourCompanionAdvertiser;
    this.createServer = options.createServer;
    this.serverIdentity = options.serverIdentity;
  }

  get state(): CompanionLifecycleState {
    return this.currentState;
  }

  async applySettings(settings: AppSettingsRecord): Promise<CompanionLifecycleState> {
    if (!settings.companionEnabled) {
      await this.stop();

      return this.currentState;
    }

    if (this.active) {
      return this.currentState;
    }

    this.currentState = {
      enabled: true,
      errorMessage: "Starting companion server.",
      status: "error"
    };

    const started = await this.startOnAvailablePort(settings.companionPort);

    if (!started) {
      this.currentState = {
        enabled: true,
        errorMessage: `No companion port is available in ${String(companionPortRangeStart)}-${String(companionPortRangeEnd)}.`,
        status: "error"
      };

      return this.currentState;
    }

    this.active = started;
    this.currentState = {
      enabled: true,
      port: started.port,
      status: "running"
    };

    return this.currentState;
  }

  async stop(): Promise<void> {
    const active = this.active;

    this.active = undefined;

    if (active) {
      active.server.broadcast({ kind: "server_stopping" });
      await active.advertisement.stop();
      await active.advertiser.destroy();
      await active.server.stop();
    }

    this.currentState = {
      enabled: false,
      status: "stopped"
    };
  }

  broadcastWorkspaceChanged(projectId: string, reason: WorkspaceChangedReason): void {
    this.active?.server.broadcast({
      kind: "workspace_changed",
      projectId,
      reason
    });
  }

  broadcast(event: Parameters<CompanionServer["broadcast"]>[0]): void {
    this.active?.server.broadcast(event);
  }

  private async startOnAvailablePort(
    preferredPort: number
  ): Promise<ActiveCompanionServer | null> {
    for (const port of companionPortCandidates(preferredPort)) {
      const server = this.createServer();

      try {
        const started = await server.start(port);
        const identity = this.serverIdentity();
        const advertiser = this.createAdvertiser();
        const advertisement = advertiser.publish({
          port: started.port,
          serverId: identity.serverId,
          serverName: identity.serverName
        });

        return {
          advertisement,
          advertiser,
          port: started.port,
          server
        };
      } catch (caughtError) {
        await server.stop().catch(() => undefined);

        if (!isAddressInUseError(caughtError)) {
          throw caughtError;
        }
      }
    }

    return null;
  }
}

export class CompanionWorkspaceChangeBroadcaster {
  private readonly broadcast: (projectId: string, reason: WorkspaceChangedReason) => void;
  private readonly debounceMs: number;
  private readonly timers = new Map<string, Timer>();

  constructor(options: {
    readonly broadcast: (projectId: string, reason: WorkspaceChangedReason) => void;
    readonly debounceMs?: number;
  }) {
    this.broadcast = options.broadcast;
    this.debounceMs = options.debounceMs ?? 1_000;
  }

  notify(projectId: string, reason: WorkspaceChangedReason): void {
    const existingTimer = this.timers.get(projectId);

    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.timers.delete(projectId);
      this.broadcast(projectId, reason);
    }, this.debounceMs);

    this.timers.set(projectId, timer);
  }

  dispose(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }

    this.timers.clear();
  }
}

export function createBonjourCompanionAdvertiser(): CompanionAdvertiser {
  const bonjour = new Bonjour();

  return {
    destroy: () =>
      new Promise<void>((resolve) => {
        bonjour.destroy(() => {
          resolve();
        });
      }),
    publish: (input) => {
      const service = bonjour.publish(companionAdvertisementServiceConfig(input));

      return serviceAdvertisement(service);
    }
  };
}

export function companionAdvertisementServiceConfig(
  input: CompanionAdvertisementInput
): ServiceConfig {
  return {
    name: input.serverName,
    port: input.port,
    protocol: "tcp",
    txt: {
      id: input.serverId,
      port: String(input.port),
      pv: String(COMPANION_PROTOCOL_VERSION)
    },
    type: "difftray"
  };
}

export function companionPortCandidates(preferredPort: number): readonly number[] {
  const range = Array.from(
    { length: companionPortRangeEnd - companionPortRangeStart + 1 },
    (_, index) => companionPortRangeStart + index
  );
  const normalizedPreferredPort = Math.round(preferredPort);

  return [
    ...(range.includes(normalizedPreferredPort) ? [normalizedPreferredPort] : []),
    ...range.filter((port) => port !== normalizedPreferredPort)
  ];
}

function serviceAdvertisement(service: Service): CompanionAdvertisement {
  return {
    stop: () =>
      new Promise<void>((resolve) => {
        const stopService = service.stop as (callback: () => void) => void;

        stopService(() => {
          resolve();
        });
      })
  };
}

function isAddressInUseError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "EADDRINUSE"
  );
}
