import os from "node:os";
import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";

import {
  encodeBase64Url,
  fingerprintPublicKey,
  openEnvelope,
  sealEnvelope,
  shortFingerprint,
  type CompanionServerEvent,
  type EncryptedEnvelope,
  type EnvelopeRequestPlain,
  type PairRequestBody
} from "@difftray/companion-protocol";
import type { DifftrayStorage } from "@difftray/storage";
import nacl from "tweetnacl";

const pairingSessionTtlMs = 5 * 60 * 1000;
const maxWrongCodeAttempts = 3;
const envelopeMaxClockSkewMs = 5 * 60 * 1000;
const replayRetentionMs = 10 * 60 * 1000;
const replayCacheMaxEntries = 10_000;

export type CompanionDeviceContext = {
  readonly deviceId: string;
  readonly devicePublicKey: string;
};

export type CompanionServerIdentity = {
  readonly appVersion: string;
  readonly serverId: string;
  readonly serverName: string;
  readonly serverPublicKey: string;
};

export type CompanionPairingSessionView = {
  readonly code: string;
  readonly expiresAt: string;
  readonly secret: string;
};

export type PairingCodeVerificationResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: "expired" | "locked" | "wrong_code";
    };

export type PendingPairRequestView = {
  readonly deviceId: string;
  readonly deviceName: string;
  readonly devicePublicKey: string;
  readonly devicePublicKeyFingerprint: string;
  readonly expiresAt: string;
  readonly id: string;
  readonly platform: PairRequestBody["platform"];
};

export type PairDeviceResult =
  | {
      readonly deviceId: string;
      readonly devicePublicKey: string;
      readonly status: "approved";
    }
  | {
      readonly pairRequestId: string;
      readonly status: "pending";
    }
  | {
      readonly reason: "locked" | "not_found" | "pairing_expired" | "wrong_code";
      readonly status: "rejected";
    };

type ApprovedPairDeviceResult = Extract<
  PairDeviceResult,
  { readonly status: "approved" }
>;
type PairRejectionReason = Extract<
  PairDeviceResult,
  { readonly status: "rejected" }
>["reason"];

export type PairRequestDecisionResult =
  | {
      readonly deviceId: string;
      readonly devicePublicKey: string;
      readonly status: "approved";
    }
  | { readonly status: "denied" }
  | {
      readonly reason: "not_found" | "pairing_expired";
      readonly status: "rejected";
    };

export type PairRequestStatusResult =
  | {
      readonly devicePublicKey: string;
      readonly status: "approved";
    }
  | {
      readonly devicePublicKey: string;
      readonly status: "pending";
    }
  | { readonly status: "denied" }
  | {
      readonly reason: "not_found" | "pairing_expired";
      readonly status: "rejected";
    };

export type CompanionAuthManager = {
  readonly approvePairRequest: (id: string) => PairRequestDecisionResult;
  readonly cancelPairing: () => void;
  readonly denyPairRequest: (id: string) => PairRequestDecisionResult;
  readonly getActivePairingSession: () => CompanionPairingSessionView | null;
  readonly getPairRequestStatus: (id: string) => PairRequestStatusResult;
  readonly listPendingPairRequests: () => readonly PendingPairRequestView[];
  readonly pairDevice: (request: PairRequestBody) => PairDeviceResult;
  readonly startPairing: () => CompanionPairingSessionView;
};

export type CompanionEnvelopeVerifier = {
  readonly openPairRequestEnvelope: (input: unknown) => CompanionPairEnvelopeOpenResult;
  readonly sealPairResponseEnvelope: (
    input: CompanionPairEnvelopeResponseInput
  ) => EncryptedEnvelope;
  readonly sealResponseEnvelope: (
    input: CompanionEnvelopeResponseInput
  ) => EncryptedEnvelope;
  readonly sealWebSocketEnvelope: (
    input: CompanionWebSocketEnvelopeInput
  ) => EncryptedEnvelope;
  readonly verifyRequestEnvelope: (
    input: CompanionEnvelopeVerificationInput
  ) => CompanionEnvelopeVerificationResult;
  readonly verifyWebSocketAuthEnvelope: (
    envelope: EncryptedEnvelope
  ) => CompanionWebSocketAuthResult;
  readonly openWebSocketClientEnvelope: (
    input: CompanionWebSocketClientEnvelopeInput
  ) => CompanionWebSocketClientEnvelopeOpenResult;
};

export type CompanionPairEnvelopeOpenResult =
  | {
      readonly body: unknown;
      readonly devicePublicKey: string;
      readonly ok: true;
    }
  | { readonly ok: false };

export type CompanionPairEnvelopeResponseInput = {
  readonly body: unknown;
  readonly devicePublicKey: string;
};

export type CompanionEnvelopeVerificationInput = {
  readonly envelope: EncryptedEnvelope;
  readonly logicalMethod: string;
  readonly path: string;
};

export type CompanionEnvelopeResponseInput = {
  readonly body: unknown;
  readonly devicePublicKey: string;
  readonly requestId: string;
  readonly status: number;
};

export type CompanionEnvelopeVerificationResult =
  | {
      readonly body: unknown;
      readonly device: CompanionDeviceContext;
      readonly ok: true;
      readonly requestId: string;
    }
  | {
      readonly ok: false;
      readonly reason: "clock_skew" | "unauthorized";
    };

export type CompanionWebSocketEnvelopeInput = {
  readonly body: CompanionServerEvent | { readonly kind: "pong" };
  readonly devicePublicKey: string;
};

export type CompanionWebSocketAuthResult =
  | {
      readonly device: CompanionDeviceContext;
      readonly ok: true;
    }
  | { readonly ok: false };

export type CompanionWebSocketClientEnvelopeInput = {
  readonly devicePublicKey: string;
  readonly envelope: EncryptedEnvelope;
};

export type CompanionWebSocketClientEnvelopeOpenResult =
  | {
      readonly body: unknown;
      readonly ok: true;
    }
  | { readonly ok: false };

export function getOrCreateCompanionServerIdentity(input: {
  readonly appVersion: string;
  readonly serverName?: string;
  readonly storage: DifftrayStorage;
}): CompanionServerIdentity {
  const keyPair = getOrCreateCompanionServerKeyPair(input.storage);
  const serverPublicKey = keyPair.publicKey;

  return {
    appVersion: input.appVersion,
    serverId: fingerprintPublicKey(serverPublicKey),
    serverName: cleanedServerName(input.serverName ?? os.hostname()),
    serverPublicKey
  };
}

export function createCompanionEnvelopeVerifier(input: {
  readonly now?: () => Date;
  readonly storage: DifftrayStorage;
}): CompanionEnvelopeVerifier {
  const now = input.now ?? (() => new Date());
  const replayCache = new Map<string, number>();
  const storage = input.storage;

  return {
    openPairRequestEnvelope: (body) => {
      const envelope = readEncryptedEnvelope(body);

      if (!envelope.ok) {
        return { ok: false };
      }

      const serverKeyPair = getOrCreateCompanionServerKeyPair(storage);
      const opened = openEnvelope({
        envelope: envelope.value,
        recipientSecretKey: serverKeyPair.secretKey,
        senderPublicKey: envelope.value.devicePk
      });

      if (!opened.ok) {
        return { ok: false };
      }

      return {
        body: opened.value,
        devicePublicKey: envelope.value.devicePk,
        ok: true
      };
    },
    sealPairResponseEnvelope: ({ body, devicePublicKey }) => {
      const serverKeyPair = getOrCreateCompanionServerKeyPair(storage);

      return sealEnvelope({
        devicePublicKey,
        plaintext: body,
        recipientPublicKey: devicePublicKey,
        senderSecretKey: serverKeyPair.secretKey
      });
    },
    sealResponseEnvelope: ({ body, devicePublicKey, requestId, status }) => {
      const serverKeyPair = getOrCreateCompanionServerKeyPair(storage);

      return sealEnvelope({
        devicePublicKey,
        plaintext: {
          body,
          requestId,
          status,
          ts: now().toISOString()
        },
        recipientPublicKey: devicePublicKey,
        senderSecretKey: serverKeyPair.secretKey
      });
    },
    sealWebSocketEnvelope: ({ body, devicePublicKey }) => {
      const serverKeyPair = getOrCreateCompanionServerKeyPair(storage);

      return sealEnvelope({
        devicePublicKey,
        plaintext: body,
        recipientPublicKey: devicePublicKey,
        senderSecretKey: serverKeyPair.secretKey
      });
    },
    verifyRequestEnvelope: ({ envelope, logicalMethod, path }) => {
      const device = storage.findCompanionDeviceByPublicKey(envelope.devicePk);

      if (!device || device.revokedAt) {
        return { ok: false, reason: "unauthorized" };
      }

      const serverKeyPair = storage.getCompanionServerKeyPair();

      if (!serverKeyPair) {
        return { ok: false, reason: "unauthorized" };
      }

      const replayKey = `${envelope.devicePk}:${envelope.nonce}`;
      pruneReplayCache(replayCache, now().getTime());

      if (replayCache.has(replayKey)) {
        return { ok: false, reason: "unauthorized" };
      }

      const opened = openEnvelope({
        envelope,
        expectedMethod: logicalMethod,
        expectedPath: path,
        maxClockSkewMs: envelopeMaxClockSkewMs,
        now: now(),
        recipientSecretKey: serverKeyPair.secretKey,
        senderPublicKey: device.publicKey
      });

      if (!opened.ok) {
        return {
          ok: false,
          reason: opened.error === "timestamp skew" ? "clock_skew" : "unauthorized"
        };
      }

      const plaintext = opened.value as EnvelopeRequestPlain;

      if (typeof plaintext.requestId !== "string") {
        return { ok: false, reason: "unauthorized" };
      }

      replayCache.set(replayKey, now().getTime());
      pruneReplayCache(replayCache, now().getTime());
      storage.touchCompanionDeviceLastSeen(device.id);

      return {
        body: plaintext.body,
        device: {
          deviceId: device.id,
          devicePublicKey: device.publicKey
        },
        ok: true,
        requestId: plaintext.requestId
      };
    },
    verifyWebSocketAuthEnvelope: (envelope) => {
      const opened = openRegisteredDeviceEnvelope({
        envelope,
        maxClockSkewMs: envelopeMaxClockSkewMs,
        now: now(),
        storage
      });

      if (!opened.ok || !isWebSocketAuthPlain(opened.body)) {
        return { ok: false };
      }

      storage.touchCompanionDeviceLastSeen(opened.device.deviceId);

      return {
        device: opened.device,
        ok: true
      };
    },
    openWebSocketClientEnvelope: ({ devicePublicKey, envelope }) => {
      if (envelope.devicePk !== devicePublicKey) {
        return { ok: false };
      }

      const opened = openRegisteredDeviceEnvelope({
        envelope,
        storage
      });

      if (!opened.ok) {
        return { ok: false };
      }

      storage.touchCompanionDeviceLastSeen(opened.device.deviceId);

      return {
        body: opened.body,
        ok: true
      };
    }
  };
}

function readEncryptedEnvelope(
  input: unknown
): { readonly ok: true; readonly value: EncryptedEnvelope } | { readonly ok: false } {
  if (typeof input !== "object" || input === null) {
    return { ok: false };
  }

  const envelope = input as Partial<EncryptedEnvelope>;

  if (
    envelope.v !== 1 ||
    typeof envelope.devicePk !== "string" ||
    typeof envelope.nonce !== "string" ||
    typeof envelope.box !== "string"
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      box: envelope.box,
      devicePk: envelope.devicePk,
      nonce: envelope.nonce,
      v: 1
    }
  };
}

function openRegisteredDeviceEnvelope(input: {
  readonly envelope: EncryptedEnvelope;
  readonly maxClockSkewMs?: number;
  readonly now?: Date;
  readonly storage: DifftrayStorage;
}):
  | {
      readonly body: unknown;
      readonly device: CompanionDeviceContext;
      readonly ok: true;
    }
  | { readonly ok: false } {
  const device = input.storage.findCompanionDeviceByPublicKey(input.envelope.devicePk);

  if (!device || device.revokedAt) {
    return { ok: false };
  }

  const serverKeyPair = input.storage.getCompanionServerKeyPair();

  if (!serverKeyPair) {
    return { ok: false };
  }

  const opened = openEnvelope({
    envelope: input.envelope,
    ...(input.maxClockSkewMs === undefined
      ? {}
      : { maxClockSkewMs: input.maxClockSkewMs }),
    ...(input.now === undefined ? {} : { now: input.now }),
    recipientSecretKey: serverKeyPair.secretKey,
    senderPublicKey: device.publicKey
  });

  if (!opened.ok) {
    return { ok: false };
  }

  return {
    body: opened.value,
    device: {
      deviceId: device.id,
      devicePublicKey: device.publicKey
    },
    ok: true
  };
}

function isWebSocketAuthPlain(input: unknown): input is {
  readonly kind: "auth";
  readonly ts: string;
} {
  if (typeof input !== "object" || input === null) {
    return false;
  }

  const record = input as Record<string, unknown>;

  return record.kind === "auth" && typeof record.ts === "string";
}

export function createCompanionAuthManager(input: {
  readonly generateCode?: () => string;
  readonly generatePairRequestId?: () => string;
  readonly generateSecret?: () => string;
  readonly now?: () => Date;
  readonly onStateChanged?: () => void;
  readonly storage: DifftrayStorage;
}): CompanionAuthManager {
  const now = input.now ?? (() => new Date());
  const generatePairRequestId = input.generatePairRequestId ?? randomPairRequestId;
  const pairingSessions = createCompanionPairingSessionManager({
    ...(input.generateCode ? { generateCode: input.generateCode } : {}),
    ...(input.generateSecret ? { generateSecret: input.generateSecret } : {}),
    now
  });
  const pendingRequests = new Map<string, PendingPairRequest>();
  const resolvedRequests = new Map<string, ResolvedPairRequest>();

  function isExpiredPendingRequest(request: PendingPairRequest): boolean {
    if (Date.parse(request.expiresAt) <= now().getTime()) {
      return true;
    }

    return false;
  }

  function pruneExpiredPendingRequests(): void {
    for (const [id, request] of pendingRequests) {
      if (isExpiredPendingRequest(request)) {
        pendingRequests.delete(id);
      }
    }

    for (const [id, request] of resolvedRequests) {
      if (Date.parse(request.expiresAt) <= now().getTime()) {
        resolvedRequests.delete(id);
      }
    }
  }

  function registerDevice(request: PairRequestBody): ApprovedPairDeviceResult {
    input.storage.upsertCompanionDevice({
      id: request.deviceId,
      name: request.deviceName,
      platform: request.platform,
      publicKey: request.devicePublicKey
    });

    return {
      deviceId: request.deviceId,
      devicePublicKey: request.devicePublicKey,
      status: "approved"
    };
  }

  return {
    approvePairRequest: (id) => {
      const request = pendingRequests.get(id);

      if (!request) {
        return { reason: "not_found", status: "rejected" };
      }

      if (isExpiredPendingRequest(request)) {
        pendingRequests.delete(id);
        input.onStateChanged?.();

        return { reason: "pairing_expired", status: "rejected" };
      }

      pendingRequests.delete(id);

      const result = registerDevice(request.requestBody);
      resolvedRequests.set(id, {
        devicePublicKey: result.devicePublicKey,
        expiresAt: request.expiresAt,
        status: "approved"
      });

      input.onStateChanged?.();

      return result;
    },
    cancelPairing: () => {
      pairingSessions.cancelPairing();
      input.onStateChanged?.();
    },
    denyPairRequest: (id) => {
      const request = pendingRequests.get(id);

      if (!request) {
        return { reason: "not_found", status: "rejected" };
      }

      pendingRequests.delete(id);
      resolvedRequests.set(id, {
        expiresAt: request.expiresAt,
        status: "denied"
      });
      input.onStateChanged?.();

      return { status: "denied" };
    },
    getActivePairingSession: () => pairingSessions.getActivePairingSession(),
    getPairRequestStatus: (id) => {
      const request = pendingRequests.get(id);

      if (request) {
        if (isExpiredPendingRequest(request)) {
          pendingRequests.delete(id);
          input.onStateChanged?.();

          return { reason: "pairing_expired", status: "rejected" };
        }

        return {
          devicePublicKey: request.requestBody.devicePublicKey,
          status: "pending"
        };
      }

      pruneExpiredPendingRequests();

      const resolved = resolvedRequests.get(id);

      if (resolved?.status === "approved" && resolved.devicePublicKey) {
        return {
          devicePublicKey: resolved.devicePublicKey,
          status: "approved"
        };
      }

      if (resolved?.status === "denied") {
        return { status: "denied" };
      }

      return { reason: "not_found", status: "rejected" };
    },
    listPendingPairRequests: () => {
      pruneExpiredPendingRequests();

      return Array.from(pendingRequests.values(), pendingPairRequestView);
    },
    pairDevice: (request) => {
      if (request.secret !== undefined) {
        const consumed = pairingSessions.consumeQrSecret(request.secret);

        if (!consumed.ok) {
          return { reason: "pairing_expired", status: "rejected" };
        }

        const result = registerDevice(request);

        input.onStateChanged?.();

        return result;
      }

      const activeSession = pairingSessions.getActivePairingSession();
      const verified = pairingSessions.verifyPairingCode(request.code ?? "");

      if (!verified.ok) {
        const reason = codeFailureReason(verified.reason);

        if (reason === "locked" || reason === "pairing_expired") {
          input.onStateChanged?.();
        }

        return {
          reason,
          status: "rejected"
        };
      }

      if (!activeSession) {
        return { reason: "pairing_expired", status: "rejected" };
      }

      pairingSessions.cancelPairing();

      const pairRequestId = generatePairRequestId();
      pendingRequests.set(pairRequestId, {
        expiresAt: activeSession.expiresAt,
        id: pairRequestId,
        requestBody: request
      });
      input.onStateChanged?.();

      return { pairRequestId, status: "pending" };
    },
    startPairing: () => {
      const session = pairingSessions.startPairing();

      input.onStateChanged?.();

      return session;
    }
  };
}

export function createCompanionPairingSessionManager(
  input: {
    readonly generateCode?: () => string;
    readonly generateSecret?: () => string;
    readonly now?: () => Date;
  } = {}
): {
  readonly cancelPairing: () => void;
  readonly consumeQrSecret: (secret: string) => { readonly ok: boolean };
  readonly getActivePairingSession: () => CompanionPairingSessionView | null;
  readonly startPairing: () => CompanionPairingSessionView;
  readonly verifyPairingCode: (code: string) => PairingCodeVerificationResult;
} {
  const now = input.now ?? (() => new Date());
  const generateCode = input.generateCode ?? randomPairingCode;
  const generateSecret = input.generateSecret ?? randomPairingSecret;
  let activeSession:
    | (CompanionPairingSessionView & { wrongCodeAttempts: number })
    | undefined;

  function currentSession():
    | (CompanionPairingSessionView & { wrongCodeAttempts: number })
    | undefined {
    if (!activeSession) {
      return undefined;
    }

    if (Date.parse(activeSession.expiresAt) <= now().getTime()) {
      activeSession = undefined;
      return undefined;
    }

    return activeSession;
  }

  return {
    cancelPairing: () => {
      activeSession = undefined;
    },
    consumeQrSecret: (secret) => {
      const session = currentSession();

      if (!session || !timingSafeStringEqual(secret, session.secret)) {
        return { ok: false };
      }

      activeSession = undefined;

      return { ok: true };
    },
    getActivePairingSession: () => {
      const session = currentSession();

      return session ? pairingSessionView(session) : null;
    },
    startPairing: () => {
      activeSession = {
        code: generateCode(),
        expiresAt: new Date(now().getTime() + pairingSessionTtlMs).toISOString(),
        secret: generateSecret(),
        wrongCodeAttempts: 0
      };

      return pairingSessionView(activeSession);
    },
    verifyPairingCode: (code) => {
      const session = currentSession();

      if (!session) {
        return { ok: false, reason: "expired" };
      }

      if (timingSafeStringEqual(code, session.code)) {
        return { ok: true };
      }

      session.wrongCodeAttempts += 1;

      if (session.wrongCodeAttempts >= maxWrongCodeAttempts) {
        activeSession = undefined;

        return { ok: false, reason: "locked" };
      }

      return { ok: false, reason: "wrong_code" };
    }
  };
}

type PendingPairRequest = {
  readonly expiresAt: string;
  readonly id: string;
  readonly requestBody: PairRequestBody;
};

type ResolvedPairRequest = {
  readonly devicePublicKey?: string;
  readonly expiresAt: string;
  readonly status: "approved" | "denied";
};

function getOrCreateCompanionServerKeyPair(storage: DifftrayStorage): {
  readonly publicKey: string;
  readonly secretKey: string;
} {
  const storedKeyPair = storage.getCompanionServerKeyPair();

  if (storedKeyPair) {
    return storedKeyPair;
  }

  const generatedKeyPair = nacl.box.keyPair();
  const keyPair = {
    publicKey: encodeBase64Url(generatedKeyPair.publicKey),
    secretKey: encodeBase64Url(generatedKeyPair.secretKey)
  };

  storage.upsertCompanionServerKeyPair(keyPair);

  return keyPair;
}

function cleanedServerName(name: string): string {
  const cleaned = name.trim();

  return cleaned.length > 0 ? cleaned : "Difftray";
}

function pairingSessionView(
  session: CompanionPairingSessionView
): CompanionPairingSessionView {
  return {
    code: session.code,
    expiresAt: session.expiresAt,
    secret: session.secret
  };
}

function randomPairingCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function randomPairingSecret(): string {
  return encodeBase64Url(randomBytes(32));
}

function randomPairRequestId(): string {
  return encodeBase64Url(randomBytes(16));
}

function pruneReplayCache(replayCache: Map<string, number>, nowMs: number): void {
  for (const [key, seenAt] of replayCache) {
    if (nowMs - seenAt > replayRetentionMs) {
      replayCache.delete(key);
    }
  }

  while (replayCache.size > replayCacheMaxEntries) {
    const oldest = replayCache.keys().next().value;

    if (!oldest) {
      return;
    }

    replayCache.delete(oldest);
  }
}

function pendingPairRequestView(request: PendingPairRequest): PendingPairRequestView {
  return {
    deviceId: request.requestBody.deviceId,
    deviceName: request.requestBody.deviceName,
    devicePublicKey: request.requestBody.devicePublicKey,
    devicePublicKeyFingerprint: shortFingerprint(request.requestBody.devicePublicKey),
    expiresAt: request.expiresAt,
    id: request.id,
    platform: request.requestBody.platform
  };
}

function codeFailureReason(
  reason: "expired" | "locked" | "wrong_code"
): PairRejectionReason {
  return reason === "expired" ? "pairing_expired" : reason;
}

function timingSafeStringEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);

  if (leftBytes.length !== rightBytes.length) {
    timingSafeEqual(leftBytes, leftBytes);
    return false;
  }

  return timingSafeEqual(leftBytes, rightBytes);
}
