import os from "node:os";
import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";

import {
  encodeBase64Url,
  fingerprintPublicKey,
  openEnvelope,
  sealEnvelope,
  shortFingerprint,
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

export type CompanionAuthManager = {
  readonly approvePairRequest: (id: string) => PairRequestDecisionResult;
  readonly cancelPairing: () => void;
  readonly denyPairRequest: (id: string) => PairRequestDecisionResult;
  readonly getActivePairingSession: () => CompanionPairingSessionView | null;
  readonly listPendingPairRequests: () => readonly PendingPairRequestView[];
  readonly pairDevice: (request: PairRequestBody) => PairDeviceResult;
  readonly startPairing: () => CompanionPairingSessionView;
};

export type CompanionEnvelopeVerifier = {
  readonly sealResponseEnvelope: (
    input: CompanionEnvelopeResponseInput
  ) => EncryptedEnvelope;
  readonly verifyRequestEnvelope: (
    input: CompanionEnvelopeVerificationInput
  ) => CompanionEnvelopeVerificationResult;
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

  return {
    sealResponseEnvelope: ({ body, devicePublicKey, requestId, status }) => {
      const serverKeyPair = getOrCreateCompanionServerKeyPair(input.storage);

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
    verifyRequestEnvelope: ({ envelope, logicalMethod, path }) => {
      const device = input.storage.findCompanionDeviceByPublicKey(envelope.devicePk);

      if (!device || device.revokedAt) {
        return { ok: false, reason: "unauthorized" };
      }

      const serverKeyPair = input.storage.getCompanionServerKeyPair();

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

      return {
        body: plaintext.body,
        device: {
          deviceId: device.id,
          devicePublicKey: device.publicKey
        },
        ok: true,
        requestId: plaintext.requestId
      };
    }
  };
}

export function createCompanionAuthManager(input: {
  readonly generateCode?: () => string;
  readonly generatePairRequestId?: () => string;
  readonly generateSecret?: () => string;
  readonly now?: () => Date;
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

        return { reason: "pairing_expired", status: "rejected" };
      }

      pendingRequests.delete(id);

      return registerDevice(request.requestBody);
    },
    cancelPairing: () => {
      pairingSessions.cancelPairing();
    },
    denyPairRequest: (id) => {
      const request = pendingRequests.get(id);

      if (!request) {
        return { reason: "not_found", status: "rejected" };
      }

      pendingRequests.delete(id);

      return { status: "denied" };
    },
    getActivePairingSession: () => pairingSessions.getActivePairingSession(),
    listPendingPairRequests: () => {
      pruneExpiredPendingRequests();

      return Array.from(pendingRequests.values(), pendingPairRequestView);
    },
    pairDevice: (request) => {
      if (request.secret !== undefined) {
        const consumed = pairingSessions.consumeQrSecret(request.secret);

        return consumed.ok
          ? registerDevice(request)
          : { reason: "pairing_expired", status: "rejected" };
      }

      const activeSession = pairingSessions.getActivePairingSession();
      const verified = pairingSessions.verifyPairingCode(request.code ?? "");

      if (!verified.ok) {
        return {
          reason: codeFailureReason(verified.reason),
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

      return { pairRequestId, status: "pending" };
    },
    startPairing: () => pairingSessions.startPairing()
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
