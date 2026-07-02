import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { fingerprintPublicKey } from "@difftray/companion-protocol";
import { openStorage } from "@difftray/storage";
import { describe, expect, it } from "vitest";

import { getOrCreateCompanionServerIdentity } from "./auth.js";

describe("companion auth", () => {
  it("generates and reuses a persisted server identity", () => {
    const storageDir = mkdtempSync(path.join(tmpdir(), "difftray-auth-"));
    const storagePath = path.join(storageDir, "difftray.sqlite");

    try {
      const storage = openStorage(storagePath);
      const firstIdentity = getOrCreateCompanionServerIdentity({
        appVersion: "0.0.0-test",
        serverName: "Test Mac",
        storage
      });
      const storedKeyPair = storage.getCompanionServerKeyPair();

      expect(storedKeyPair).toEqual({
        publicKey: firstIdentity.serverPublicKey,
        secretKey: expect.any(String) as string
      });
      expect(firstIdentity).toEqual({
        appVersion: "0.0.0-test",
        serverId: fingerprintPublicKey(firstIdentity.serverPublicKey),
        serverName: "Test Mac",
        serverPublicKey: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) as string
      });
      storage.close();

      const reopenedStorage = openStorage(storagePath);
      const secondIdentity = getOrCreateCompanionServerIdentity({
        appVersion: "0.0.0-test",
        serverName: "Test Mac",
        storage: reopenedStorage
      });

      expect(secondIdentity).toEqual(firstIdentity);
      reopenedStorage.close();
    } finally {
      rmSync(storageDir, { force: true, recursive: true });
    }
  });
});
