import os from "node:os";

import { encodeBase64Url, fingerprintPublicKey } from "@difftray/companion-protocol";
import type { DifftrayStorage } from "@difftray/storage";
import nacl from "tweetnacl";

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
