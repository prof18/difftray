import os from "node:os";
import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";

import { encodeBase64Url, fingerprintPublicKey } from "@difftray/companion-protocol";
import type { DifftrayStorage } from "@difftray/storage";
import nacl from "tweetnacl";

const pairingSessionTtlMs = 5 * 60 * 1000;
const maxWrongCodeAttempts = 3;

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

function timingSafeStringEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);

  if (leftBytes.length !== rightBytes.length) {
    timingSafeEqual(leftBytes, leftBytes);
    return false;
  }

  return timingSafeEqual(leftBytes, rightBytes);
}
