import { COMPANION_PROTOCOL_VERSION } from "@difftray/companion-protocol";
import type { AppSettingsRecord } from "@difftray/storage";
import { Bonjour, type Service } from "bonjour-service";
import type { ServiceConfig } from "bonjour-service";
import os from "node:os";

import {
  probeLocalNetworkAccess,
  type LocalNetworkProbeResult
} from "./local-network-probe.js";
import type { CompanionServer } from "./server.js";

export type CompanionAdvertisementInput = {
  readonly port: number;
  readonly serverId: string;
  readonly serverName: string;
};

export type CompanionAdvertisement = {
  readonly stop: () => Promise<void> | void;
};

export type CompanionDiscoveryState =
  | { readonly status: "stopped" }
  | { readonly status: "starting"; readonly name: string }
  | { readonly status: "advertising"; readonly name: string }
  | {
      readonly status: "blocked";
      readonly name: string;
      readonly errorCode: string;
    }
  | {
      readonly status: "failed";
      readonly name: string;
      readonly errorCode: string;
    };

export type CompanionAdvertiser = {
  readonly destroy: () => Promise<void> | void;
  readonly publish: (
    input: CompanionAdvertisementInput,
    onState: (state: CompanionDiscoveryState) => void
  ) => CompanionAdvertisement;
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
  readonly listNetworkAddresses?: () => readonly string[];
  readonly onDiscoveryStateChanged?: (state: CompanionDiscoveryState) => void;
  readonly probeLocalNetwork?: () => Promise<LocalNetworkProbeResult>;
  readonly serverIdentity: CompanionServerIdentityProvider;
};

type ActiveCompanionServer = {
  advertisement: CompanionAdvertisement | undefined;
  advertiser: CompanionAdvertiser;
  readonly port: number;
  readonly server: CompanionServer;
};

type WorkspaceChangedReason = "comments" | "diff_target" | "filesystem" | "review_state";
type Timer = ReturnType<typeof setTimeout>;

const companionPortRangeStart = 48620;
const companionPortRangeEnd = 48629;
const readvertiseIntervalMs = 60_000;

export class CompanionLifecycleController {
  private active: ActiveCompanionServer | undefined;
  private bonjourNameAttempt = 1;
  private readonly createAdvertiser: () => CompanionAdvertiser;
  private readonly createServer: CompanionServerFactory;
  private currentDiscoveryState: CompanionDiscoveryState = { status: "stopped" };
  private readonly serverIdentity: CompanionServerIdentityProvider;
  private discoveryGeneration = 0;
  private discoveryTimer: ReturnType<typeof setInterval> | undefined;
  private lastPublishedNetworkAddresses: readonly string[] = [];
  private readonly listNetworkAddresses: () => readonly string[];
  private lockedBonjourName: string | undefined;
  private readonly onDiscoveryStateChanged:
    ((state: CompanionDiscoveryState) => void) | undefined;
  private readonly probeLocalNetwork: () => Promise<LocalNetworkProbeResult>;
  private republishGeneration: number | undefined;
  private currentState: CompanionLifecycleState = {
    enabled: false,
    status: "stopped"
  };

  constructor(options: CompanionLifecycleControllerOptions) {
    this.createAdvertiser = options.createAdvertiser ?? createBonjourCompanionAdvertiser;
    this.createServer = options.createServer;
    this.listNetworkAddresses = options.listNetworkAddresses ?? listNetworkAddresses;
    this.onDiscoveryStateChanged = options.onDiscoveryStateChanged;
    this.probeLocalNetwork = options.probeLocalNetwork ?? probeLocalNetworkAccess;
    this.serverIdentity = options.serverIdentity;
  }

  get state(): CompanionLifecycleState {
    return this.currentState;
  }

  get discoveryState(): CompanionDiscoveryState {
    return this.currentDiscoveryState;
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

    const startupGeneration = this.discoveryGeneration + 1;
    const started = await this.startOnAvailablePort(settings.companionPort);

    if (!this.isCurrentDiscoveryGeneration(startupGeneration)) {
      return this.currentState;
    }

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
    this.startDiscoveryTimer();

    return this.currentState;
  }

  async stop(): Promise<void> {
    this.discoveryGeneration += 1;
    this.clearDiscoveryTimer();
    const active = this.active;

    this.active = undefined;

    if (active) {
      active.server.broadcast({ kind: "server_stopping" });
      await active.advertisement?.stop();
      await active.advertiser.destroy();
      await active.server.stop();
    }

    this.bonjourNameAttempt = 1;
    this.lastPublishedNetworkAddresses = [];
    this.lockedBonjourName = undefined;
    this.setDiscoveryState({ status: "stopped" });

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

  revokeDevice(deviceId: string): void {
    this.active?.server.revokeDevice(deviceId);
  }

  private async startOnAvailablePort(
    preferredPort: number
  ): Promise<ActiveCompanionServer | null> {
    const generation = ++this.discoveryGeneration;

    for (const port of companionPortCandidates(preferredPort)) {
      const server = this.createServer();

      try {
        const started = await server.start(port);
        const identity = this.serverIdentity();
        const advertiser = this.createAdvertiser();
        const active: ActiveCompanionServer = {
          advertisement: undefined,
          advertiser,
          port: started.port,
          server
        };
        this.active = active;
        await this.publishAfterProbe(active, generation, identity, identity.serverName);

        if (!this.isCurrentDiscoveryGeneration(generation)) {
          await advertiser.destroy();
          await server.stop();
          return null;
        }

        return active;
      } catch (caughtError) {
        if (this.active?.server === server) {
          this.active = undefined;
        }
        await server.stop().catch(() => undefined);

        if (!isAddressInUseError(caughtError)) {
          throw caughtError;
        }
      }
    }

    return null;
  }

  private startDiscoveryTimer(): void {
    this.clearDiscoveryTimer();
    this.discoveryTimer = setInterval(() => {
      void this.handleDiscoveryTick();
    }, readvertiseIntervalMs);
    this.discoveryTimer.unref();
  }

  private clearDiscoveryTimer(): void {
    if (this.discoveryTimer) {
      clearInterval(this.discoveryTimer);
      this.discoveryTimer = undefined;
    }
  }

  private async handleDiscoveryTick(): Promise<void> {
    const active = this.active;

    if (!active || this.republishGeneration !== undefined) {
      return;
    }

    const generation = this.discoveryGeneration;
    this.republishGeneration = generation;

    try {
      if (this.currentDiscoveryState.status === "advertising") {
        const probeResult = await this.probeLocalNetwork();

        if (!this.isCurrentActive(active, generation)) {
          return;
        }

        if (probeResult === "blocked") {
          this.setDiscoveryState({
            status: "blocked",
            name: this.currentDiscoveryState.name,
            errorCode: "local_network_probe"
          });
          return;
        }
      }

      const currentAddresses = this.sortedNetworkAddresses();
      const shouldRepublish =
        this.currentDiscoveryState.status === "blocked" ||
        this.currentDiscoveryState.status === "failed" ||
        !sameStringArray(currentAddresses, this.lastPublishedNetworkAddresses);

      if (shouldRepublish) {
        await this.republish(active, generation);
      }
    } finally {
      if (this.republishGeneration === generation) {
        this.republishGeneration = undefined;
      }
    }
  }

  private async republish(
    active: ActiveCompanionServer,
    generation: number
  ): Promise<void> {
    await active.advertisement?.stop();

    if (!this.isCurrentActive(active, generation)) {
      return;
    }

    active.advertisement = undefined;
    await active.advertiser.destroy();

    if (!this.isCurrentActive(active, generation)) {
      return;
    }

    const advertiser = this.createAdvertiser();
    const identity = this.serverIdentity();
    const serverName = this.nextBonjourName(identity.serverName);
    const probeResult = await this.probeLocalNetwork();

    if (!this.isCurrentActive(active, generation)) {
      await advertiser.destroy();
      return;
    }

    active.advertiser = advertiser;
    this.publishWithProbeResult(active, generation, identity, serverName, probeResult);
  }

  private async publishAfterProbe(
    active: ActiveCompanionServer,
    generation: number,
    identity: ReturnType<CompanionServerIdentityProvider>,
    serverName: string
  ): Promise<void> {
    const probeResult = await this.probeLocalNetwork();

    if (!this.isCurrentActive(active, generation)) {
      return;
    }

    this.publishWithProbeResult(active, generation, identity, serverName, probeResult);
  }

  private publishWithProbeResult(
    active: ActiveCompanionServer,
    generation: number,
    identity: ReturnType<CompanionServerIdentityProvider>,
    serverName: string,
    probeResult: LocalNetworkProbeResult
  ): void {
    if (probeResult === "blocked") {
      this.setDiscoveryState({
        status: "blocked",
        name: serverName,
        errorCode: "local_network_probe"
      });
      return;
    }

    this.lastPublishedNetworkAddresses = this.sortedNetworkAddresses();
    active.advertisement = active.advertiser.publish(
      {
        port: active.port,
        serverId: identity.serverId,
        serverName
      },
      (state) => {
        if (!this.isCurrentActive(active, generation)) {
          return;
        }

        if (state.status === "advertising") {
          this.lockedBonjourName = state.name;
        }

        this.setDiscoveryState(state);
      }
    );
  }

  private nextBonjourName(baseName: string): string {
    if (this.lockedBonjourName) {
      return this.lockedBonjourName;
    }

    if (
      this.currentDiscoveryState.status === "failed" &&
      this.currentDiscoveryState.errorCode === "not_published"
    ) {
      this.bonjourNameAttempt = Math.min(this.bonjourNameAttempt + 1, 9);
    }

    return this.bonjourNameAttempt === 1
      ? baseName
      : `${baseName} (${String(this.bonjourNameAttempt)})`;
  }

  private sortedNetworkAddresses(): readonly string[] {
    return [...this.listNetworkAddresses()].sort();
  }

  private isCurrentDiscoveryGeneration(generation: number): boolean {
    return this.discoveryGeneration === generation;
  }

  private isCurrentActive(active: ActiveCompanionServer, generation: number): boolean {
    return this.active === active && this.isCurrentDiscoveryGeneration(generation);
  }

  private setDiscoveryState(state: CompanionDiscoveryState): void {
    this.currentDiscoveryState = state;
    this.onDiscoveryStateChanged?.(state);
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
  let currentOnState: ((state: CompanionDiscoveryState) => void) | undefined;
  let currentHandleError:
    ((error: unknown, classification: BonjourErrorClassification) => void) | undefined;
  const bonjour = new Bonjour({}, (error: unknown) => {
    const classification = handleBonjourAdvertisementError(error);
    currentHandleError?.(error, classification);
  });

  return {
    destroy: () =>
      new Promise<void>((resolve) => {
        bonjour.destroy(() => {
          resolve();
        });
      }),
    publish: (input, onState) => {
      let stopped = false;
      let terminal = false;
      let publicationTimer: ReturnType<typeof setTimeout> | undefined;
      const clearPublicationTimer = (): void => {
        if (publicationTimer) {
          clearTimeout(publicationTimer);
          publicationTimer = undefined;
        }
      };
      const reportTerminalError = (
        error: unknown,
        classification: BonjourErrorClassification
      ): void => {
        if (stopped || terminal || classification === "transient") {
          return;
        }

        terminal = true;
        clearPublicationTimer();
        onState({
          status: classification === "blocked" ? "blocked" : "failed",
          name: input.serverName,
          errorCode: bonjourErrorCode(error)
        });
      };

      currentOnState = onState;
      currentHandleError = reportTerminalError;
      onState({ status: "starting", name: input.serverName });
      const service = bonjour.publish(companionAdvertisementServiceConfig(input));
      service.on("up", () => {
        if (stopped || terminal || currentOnState !== onState) {
          return;
        }

        clearPublicationTimer();
        onState({ status: "advertising", name: input.serverName });
      });
      publicationTimer = setTimeout(() => {
        if (stopped || terminal || currentOnState !== onState) {
          return;
        }

        terminal = true;
        onState({
          status: "failed",
          name: input.serverName,
          errorCode: "not_published"
        });
      }, 10_000);
      publicationTimer.unref();

      return serviceAdvertisement(service, () => {
        stopped = true;
        clearPublicationTimer();

        if (currentOnState === onState) {
          currentOnState = undefined;
          currentHandleError = undefined;
        }
      });
    }
  };
}

type BonjourErrorClassification = "blocked" | "failed" | "transient";

function handleBonjourAdvertisementError(error: unknown): BonjourErrorClassification {
  const classification = classifyBonjourError(error, process.platform);

  if (classification === "blocked") {
    console.error(
      "Bonjour/mDNS advertisement blocked: Local Network access may be off",
      error
    );
    return classification;
  }

  if (classification === "transient") {
    console.warn(
      "Bonjour/mDNS advertisement encountered a transient network error",
      error
    );
    return classification;
  }

  console.error("Bonjour/mDNS advertisement failed", error);
  return classification;
}

export function classifyBonjourError(
  error: unknown,
  platform: NodeJS.Platform
): BonjourErrorClassification {
  if (!(error instanceof Error) || !("code" in error)) {
    return "failed";
  }

  const code = String(error.code);

  if (platform === "darwin" && ["EACCES", "EHOSTUNREACH", "EPERM"].includes(code)) {
    return "blocked";
  }

  if (
    ["EADDRNOTAVAIL", "EHOSTDOWN", "EHOSTUNREACH", "ENETDOWN", "ENETUNREACH"].includes(
      code
    )
  ) {
    return "transient";
  }

  return "failed";
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

function serviceAdvertisement(
  service: Service,
  onStop: () => void
): CompanionAdvertisement {
  return {
    stop: () =>
      new Promise<void>((resolve) => {
        onStop();
        const stopService = service.stop as (callback: () => void) => void;

        stopService(() => {
          resolve();
        });
      })
  };
}

function bonjourErrorCode(error: unknown): string {
  if (error instanceof Error && "code" in error) {
    return String(error.code);
  }

  return "unknown";
}

function isAddressInUseError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "EADDRINUSE"
  );
}

function listNetworkAddresses(): readonly string[] {
  return Object.values(os.networkInterfaces())
    .flatMap((addresses) => addresses ?? [])
    .filter((address) => !address.internal && address.family === "IPv4")
    .map((address) => address.address)
    .sort();
}

function sameStringArray(first: readonly string[], second: readonly string[]): boolean {
  return (
    first.length === second.length &&
    first.every((value, index) => value === second[index])
  );
}
