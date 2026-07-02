import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  encodeBase64Url,
  fingerprintPublicKey,
  sealEnvelope
} from "@difftray/companion-protocol";
import { openStorage } from "@difftray/storage";
import { describe, expect, it } from "vitest";

import {
  createCompanionAuthManager,
  createCompanionEnvelopeVerifier,
  createCompanionPairingSessionManager,
  getOrCreateCompanionServerIdentity
} from "./auth.js";

const serverPublicKey = "B6N8vBQgk8i3VdwbEOhstCY3StFqqFPtC9_AsrhtHHw";
const serverSecretKey = "AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA";
const devicePublicKey = "VxR2nRFr92Q2rnS8eT0sMK0ZA8WaxSc4BcfiaYtBDDY";
const deviceSecretKey = "ZWZnaGlqa2xtbm9wcXJzdHV2d3h5ent8fX5_gIGCg4Q";

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

  it("registers QR-paired devices and consumes the pairing secret once", () => {
    const storageDir = mkdtempSync(path.join(tmpdir(), "difftray-auth-"));
    const storagePath = path.join(storageDir, "difftray.sqlite");
    const devicePublicKey = testDevicePublicKey(1);
    const replayPublicKey = testDevicePublicKey(2);

    try {
      const storage = openStorage(storagePath);
      const manager = createCompanionAuthManager({
        generateCode: () => "123456",
        generateSecret: () => "pairing-secret",
        now: () => new Date("2026-07-02T12:00:00.000Z"),
        storage
      });

      manager.startPairing();

      expect(
        manager.pairDevice({
          deviceId: "device-1",
          deviceName: "Marco's iPhone",
          devicePublicKey,
          platform: "ios",
          protocolVersion: 1,
          secret: "pairing-secret"
        })
      ).toEqual({
        deviceId: "device-1",
        devicePublicKey,
        status: "approved"
      });
      expect(storage.findCompanionDeviceByPublicKey(devicePublicKey)).toMatchObject({
        id: "device-1",
        name: "Marco's iPhone",
        platform: "ios",
        publicKey: devicePublicKey
      });
      expect(
        manager.pairDevice({
          deviceId: "device-2",
          deviceName: "Replay",
          devicePublicKey: replayPublicKey,
          platform: "android",
          protocolVersion: 1,
          secret: "pairing-secret"
        })
      ).toEqual({ reason: "pairing_expired", status: "rejected" });
      storage.close();
    } finally {
      rmSync(storageDir, { force: true, recursive: true });
    }
  });

  it("queues code pair requests for approval and expires pending requests", () => {
    const storageDir = mkdtempSync(path.join(tmpdir(), "difftray-auth-"));
    const storagePath = path.join(storageDir, "difftray.sqlite");
    const firstPublicKey = testDevicePublicKey(1);
    const secondPublicKey = testDevicePublicKey(2);
    let now = new Date("2026-07-02T12:00:00.000Z");
    const requestIds = ["pair-request-1", "pair-request-2"];

    try {
      const storage = openStorage(storagePath);
      const manager = createCompanionAuthManager({
        generateCode: () => "123456",
        generatePairRequestId: () => requestIds.shift() ?? "fallback-request",
        generateSecret: () => "pairing-secret",
        now: () => now,
        storage
      });

      manager.startPairing();
      expect(
        manager.pairDevice({
          code: "123456",
          deviceId: "device-1",
          deviceName: "Pixel",
          devicePublicKey: firstPublicKey,
          platform: "android",
          protocolVersion: 1
        })
      ).toEqual({
        pairRequestId: "pair-request-1",
        status: "pending"
      });
      expect(manager.listPendingPairRequests()).toEqual([
        {
          deviceId: "device-1",
          deviceName: "Pixel",
          devicePublicKey: firstPublicKey,
          devicePublicKeyFingerprint: expect.any(String) as string,
          expiresAt: "2026-07-02T12:05:00.000Z",
          id: "pair-request-1",
          platform: "android"
        }
      ]);
      expect(manager.denyPairRequest("pair-request-1")).toEqual({
        status: "denied"
      });
      expect(storage.findCompanionDeviceByPublicKey(firstPublicKey)).toBeNull();

      manager.startPairing();
      expect(
        manager.pairDevice({
          code: "123456",
          deviceId: "device-2",
          deviceName: "iPad",
          devicePublicKey: secondPublicKey,
          platform: "ios",
          protocolVersion: 1
        })
      ).toEqual({
        pairRequestId: "pair-request-2",
        status: "pending"
      });

      now = new Date("2026-07-02T12:05:00.001Z");
      expect(manager.approvePairRequest("pair-request-2")).toEqual({
        reason: "pairing_expired",
        status: "rejected"
      });
      expect(storage.findCompanionDeviceByPublicKey(secondPublicKey)).toBeNull();
      expect(manager.listPendingPairRequests()).toEqual([]);
      storage.close();
    } finally {
      rmSync(storageDir, { force: true, recursive: true });
    }
  });

  it("verifies registered device envelopes and rejects replayed envelopes", () => {
    const storageDir = mkdtempSync(path.join(tmpdir(), "difftray-auth-"));
    const storagePath = path.join(storageDir, "difftray.sqlite");

    try {
      const storage = openStorage(storagePath);
      storage.upsertCompanionServerKeyPair({
        publicKey: serverPublicKey,
        secretKey: serverSecretKey
      });
      storage.upsertCompanionDevice({
        id: "device-1",
        name: "Phone",
        platform: "ios",
        publicKey: devicePublicKey
      });
      const verifier = createCompanionEnvelopeVerifier({
        now: () => new Date("2026-07-02T12:01:00.000Z"),
        storage
      });
      const envelope = testEnvelope({
        nonce: "ycrLzM3Oz9DR0tPU1dbX2Nna29zd3t_g",
        ts: "2026-07-02T12:00:00.000Z"
      });

      expect(
        verifier.verifyRequestEnvelope({
          envelope,
          logicalMethod: "POST",
          path: "/companion/v1/projects/project-1/reviews/mark"
        })
      ).toEqual({
        body: { value: true },
        device: {
          deviceId: "device-1",
          devicePublicKey
        },
        ok: true,
        requestId: "ycrLzM3Oz9DR0tPU1dbX2Nna29zd3t_g"
      });
      expect(
        verifier.verifyRequestEnvelope({
          envelope,
          logicalMethod: "POST",
          path: "/companion/v1/projects/project-1/reviews/mark"
        })
      ).toEqual({ ok: false, reason: "unauthorized" });
      storage.close();
    } finally {
      rmSync(storageDir, { force: true, recursive: true });
    }
  });

  it("rejects revoked, tampered, skewed, and route-swapped envelopes", () => {
    const storageDir = mkdtempSync(path.join(tmpdir(), "difftray-auth-"));
    const storagePath = path.join(storageDir, "difftray.sqlite");

    try {
      const storage = openStorage(storagePath);
      storage.upsertCompanionServerKeyPair({
        publicKey: serverPublicKey,
        secretKey: serverSecretKey
      });
      storage.upsertCompanionDevice({
        id: "device-1",
        name: "Phone",
        platform: "ios",
        publicKey: devicePublicKey
      });
      const verifier = createCompanionEnvelopeVerifier({
        now: () => new Date("2026-07-02T12:01:00.000Z"),
        storage
      });
      const tampered = testEnvelope({
        nonce: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        ts: "2026-07-02T12:00:00.000Z"
      });

      expect(
        verifier.verifyRequestEnvelope({
          envelope: { ...tampered, box: `${tampered.box.slice(0, -1)}A` },
          logicalMethod: "POST",
          path: "/companion/v1/projects/project-1/reviews/mark"
        })
      ).toEqual({ ok: false, reason: "unauthorized" });
      expect(
        verifier.verifyRequestEnvelope({
          envelope: testEnvelope({
            nonce: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB",
            ts: "2026-07-02T12:00:00.000Z"
          }),
          logicalMethod: "GET",
          path: "/companion/v1/projects/project-1/reviews/mark"
        })
      ).toEqual({ ok: false, reason: "unauthorized" });
      expect(
        verifier.verifyRequestEnvelope({
          envelope: testEnvelope({
            nonce: "AgICAgICAgICAgICAgICAgICAgICAgIC",
            ts: "2026-07-02T11:50:00.000Z"
          }),
          logicalMethod: "POST",
          path: "/companion/v1/projects/project-1/reviews/mark"
        })
      ).toEqual({ ok: false, reason: "clock_skew" });

      storage.revokeCompanionDevice("device-1");
      expect(
        verifier.verifyRequestEnvelope({
          envelope: testEnvelope({
            nonce: "AwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMD",
            ts: "2026-07-02T12:00:00.000Z"
          }),
          logicalMethod: "POST",
          path: "/companion/v1/projects/project-1/reviews/mark"
        })
      ).toEqual({ ok: false, reason: "unauthorized" });
      storage.close();
    } finally {
      rmSync(storageDir, { force: true, recursive: true });
    }
  });
});

function testDevicePublicKey(fill: number): string {
  return encodeBase64Url(new Uint8Array(32).fill(fill));
}

function testEnvelope(input: { readonly nonce: string; readonly ts: string }) {
  return sealEnvelope({
    devicePublicKey,
    nonce: input.nonce,
    plaintext: {
      body: { value: true },
      method: "POST",
      path: "/companion/v1/projects/project-1/reviews/mark",
      requestId: input.nonce,
      ts: input.ts
    },
    recipientPublicKey: serverPublicKey,
    senderSecretKey: deviceSecretKey
  });
}
