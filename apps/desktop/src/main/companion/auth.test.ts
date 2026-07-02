import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { fingerprintPublicKey } from "@difftray/companion-protocol";
import { openStorage } from "@difftray/storage";
import { describe, expect, it } from "vitest";

import {
  createCompanionPairingSessionManager,
  getOrCreateCompanionServerIdentity
} from "./auth.js";

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

  it("keeps a single active pairing session with a five minute TTL", () => {
    let now = new Date("2026-07-02T12:00:00.000Z");
    const manager = createCompanionPairingSessionManager({
      generateCode: () => "123456",
      generateSecret: () => "first-secret",
      now: () => now
    });

    const firstSession = manager.startPairing();
    expect(firstSession).toEqual({
      code: "123456",
      expiresAt: "2026-07-02T12:05:00.000Z",
      secret: "first-secret"
    });
    expect(manager.getActivePairingSession()).toEqual(firstSession);

    now = new Date("2026-07-02T12:05:00.001Z");
    expect(manager.getActivePairingSession()).toBeNull();

    const codes = ["654321", "456789"];
    const secrets = ["second-secret", "third-secret"];
    const restartedManager = createCompanionPairingSessionManager({
      generateCode: () => codes.shift() ?? "000000",
      generateSecret: () => secrets.shift() ?? "fallback-secret",
      now: () => new Date("2026-07-02T12:01:00.000Z")
    });

    const oldSession = restartedManager.startPairing();
    const newSession = restartedManager.startPairing();

    expect(oldSession.secret).toBe("second-secret");
    expect(newSession.secret).toBe("third-secret");
    expect(newSession).toEqual({
      code: "456789",
      expiresAt: "2026-07-02T12:06:00.000Z",
      secret: "third-secret"
    });
    expect(restartedManager.getActivePairingSession()).toEqual(newSession);
  });

  it("consumes QR secrets once and closes after three wrong codes", () => {
    const manager = createCompanionPairingSessionManager({
      generateCode: () => "123456",
      generateSecret: () => "pairing-secret",
      now: () => new Date("2026-07-02T12:00:00.000Z")
    });

    manager.startPairing();

    expect(manager.consumeQrSecret("wrong-secret")).toEqual({ ok: false });
    expect(manager.consumeQrSecret("pairing-secret")).toEqual({ ok: true });
    expect(manager.consumeQrSecret("pairing-secret")).toEqual({ ok: false });
    expect(manager.getActivePairingSession()).toBeNull();

    manager.startPairing();

    expect(manager.verifyPairingCode("000000")).toEqual({
      ok: false,
      reason: "wrong_code"
    });
    expect(manager.verifyPairingCode("111111")).toEqual({
      ok: false,
      reason: "wrong_code"
    });
    expect(manager.verifyPairingCode("222222")).toEqual({
      ok: false,
      reason: "locked"
    });
    expect(manager.getActivePairingSession()).toBeNull();
  });
});
