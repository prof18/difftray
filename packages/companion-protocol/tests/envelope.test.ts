import { describe, expect, it } from "vitest";

import {
  decodeBase64Url,
  encodeBase64Url,
  fingerprintPublicKey,
  openEnvelope,
  sealEnvelope,
  shortFingerprint,
  type EnvelopeRequestPlain
} from "../src/index.js";

const serverPublicKey = "B6N8vBQgk8i3VdwbEOhstCY3StFqqFPtC9_AsrhtHHw";
const serverSecretKey = "AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA";
const devicePublicKey = "VxR2nRFr92Q2rnS8eT0sMK0ZA8WaxSc4BcfiaYtBDDY";
const deviceSecretKey = "ZWZnaGlqa2xtbm9wcXJzdHV2d3h5ent8fX5_gIGCg4Q";
const nonce = "ycrLzM3Oz9DR0tPU1dbX2Nna29zd3t_g";

const requestPlain = {
  body: {
    displayedDiffHash: "difftray-file-diff-v1:abc",
    path: "src/App.tsx",
    reviewTargetId: "difftray-review-target-v1:def"
  },
  method: "POST",
  path: "/companion/v1/projects/project-a/reviews/mark",
  requestId: "request-1",
  ts: "2026-01-02T03:04:05.000Z"
} satisfies EnvelopeRequestPlain;

describe("base64url", () => {
  it("round-trips bytes without padding", () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);
    const encoded = encodeBase64Url(bytes);

    expect(encoded).toBe("AAEC_f7_");
    expect(decodeBase64Url(encoded)).toEqual(bytes);
  });

  it("rejects invalid input", () => {
    expect(() => decodeBase64Url("not valid!")).toThrow(/Invalid base64url/);
    expect(() => decodeBase64Url("A")).toThrow(/Invalid base64url/);
  });
});

describe("fingerprints", () => {
  it("derives stable server ids and short comparison strings", () => {
    expect(fingerprintPublicKey(serverPublicKey)).toBe("vezp4r4g24w3tRpsDa3-5w");
    expect(shortFingerprint(serverPublicKey)).toBe("BDEC-E9E2-BE20");
  });
});

describe("encrypted envelope", () => {
  it("seals a fixed request vector", () => {
    const envelope = sealEnvelope({
      devicePublicKey,
      nonce,
      plaintext: requestPlain,
      recipientPublicKey: serverPublicKey,
      senderSecretKey: deviceSecretKey
    });

    expect(envelope).toEqual({
      box: "5KATFt24ivViz2MYSvjv4u655L7oz2XJlI437vKt8Kzs4Da14yW4j19Mmp3sk1A5xWR-WFlgVAjF3_Dgz8dnqG47VMEI_G74NwFo_A3JnSyXpUPrYWK1x3wvU2iHlG_PWDEHuHJS3yKPqN1kjVK7GdZ-KNBGwbji4RBeQEql7ETyIwXlmZ_0r3fdrItHt_7u3eubqmJhXAp-4H6MZORctrgDmv4KZlijcSRQhcfdljbkiDxEYTBkx8WNipYvjCoYchirhdJ2kPYJF6bsJnQpfY99EtJInNEvCJVGFtN-j5nSgvsjn46DyRxgLDOnUlQPfqrH7WHafUm_nmriy1F0_BTvDAzn7J5Jdujh6GLcrg",
      devicePk: devicePublicKey,
      nonce,
      v: 1
    });
  });

  it("opens a sealed request and verifies route binding plus timestamp skew", () => {
    const opened = openEnvelope({
      envelope: sealEnvelope({
        devicePublicKey,
        nonce,
        plaintext: requestPlain,
        recipientPublicKey: serverPublicKey,
        senderSecretKey: deviceSecretKey
      }),
      expectedMethod: "POST",
      expectedPath: "/companion/v1/projects/project-a/reviews/mark",
      maxClockSkewMs: 5 * 60 * 1000,
      now: new Date("2026-01-02T03:06:00.000Z"),
      recipientSecretKey: serverSecretKey,
      senderPublicKey: devicePublicKey
    });

    expect(opened).toEqual({ ok: true, value: requestPlain });
  });

  it("rejects tampered boxes, wrong recipients, route swaps, and stale timestamps", () => {
    const envelope = sealEnvelope({
      devicePublicKey,
      nonce,
      plaintext: requestPlain,
      recipientPublicKey: serverPublicKey,
      senderSecretKey: deviceSecretKey
    });

    expect(
      openEnvelope({
        envelope: { ...envelope, box: `${envelope.box.slice(0, -1)}A` },
        recipientSecretKey: serverSecretKey,
        senderPublicKey: devicePublicKey
      }).ok
    ).toBe(false);
    expect(
      openEnvelope({
        envelope,
        recipientSecretKey: deviceSecretKey,
        senderPublicKey: devicePublicKey
      }).ok
    ).toBe(false);
    expect(
      openEnvelope({
        envelope,
        expectedMethod: "GET",
        expectedPath: requestPlain.path,
        recipientSecretKey: serverSecretKey,
        senderPublicKey: devicePublicKey
      }).ok
    ).toBe(false);
    expect(
      openEnvelope({
        envelope,
        maxClockSkewMs: 5 * 60 * 1000,
        now: new Date("2026-01-02T03:10:00.001Z"),
        recipientSecretKey: serverSecretKey,
        senderPublicKey: devicePublicKey
      }).ok
    ).toBe(false);
  });

  it("verifies response request ids and rejects reflected request plaintexts", () => {
    const responsePlain = {
      body: { marked: true },
      requestId: "request-1",
      status: 200,
      ts: "2026-01-02T03:04:06.000Z"
    };
    const responseEnvelope = sealEnvelope({
      devicePublicKey,
      nonce,
      plaintext: responsePlain,
      recipientPublicKey: devicePublicKey,
      senderSecretKey: serverSecretKey
    });

    expect(
      openEnvelope({
        envelope: responseEnvelope,
        expectedRequestId: "request-1",
        recipientSecretKey: deviceSecretKey,
        senderPublicKey: serverPublicKey
      })
    ).toEqual({ ok: true, value: responsePlain });
    expect(
      openEnvelope({
        envelope: responseEnvelope,
        expectedRequestId: "other-request",
        recipientSecretKey: deviceSecretKey,
        senderPublicKey: serverPublicKey
      }).ok
    ).toBe(false);
    expect(
      openEnvelope({
        envelope: sealEnvelope({
          devicePublicKey,
          nonce,
          plaintext: requestPlain,
          recipientPublicKey: devicePublicKey,
          senderSecretKey: serverSecretKey
        }),
        expectedRequestId: "request-1",
        recipientSecretKey: deviceSecretKey,
        senderPublicKey: serverPublicKey
      }).ok
    ).toBe(false);
  });
});
