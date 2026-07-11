import { describe, expect, it } from "vitest";

import {
  parseCompanionServerEvent,
  parseCreateCommentBody,
  parseDiffTargetBody,
  parseMarkReviewedBody,
  parsePairRequestBody,
  parseUpdateCommentBody
} from "../src/index.js";

describe("parsePairRequestBody", () => {
  it("accepts exactly one QR secret or manual code", () => {
    expect(
      parsePairRequestBody({
        deviceId: "device-a",
        deviceName: "Marco's iPhone",
        devicePublicKey: "device-pk",
        platform: "ios",
        protocolVersion: 1,
        secret: "pair-secret"
      })
    ).toEqual({
      ok: true,
      value: {
        deviceId: "device-a",
        deviceName: "Marco's iPhone",
        devicePublicKey: "device-pk",
        platform: "ios",
        protocolVersion: 1,
        secret: "pair-secret"
      }
    });

    expect(
      parsePairRequestBody({
        code: "123456",
        deviceId: "device-a",
        deviceName: "Marco's iPhone",
        devicePublicKey: "device-pk",
        platform: "ios",
        protocolVersion: 1
      })
    ).toEqual(
      expect.objectContaining({
        ok: true
      })
    );
  });

  it("rejects missing fields, unsupported platforms, and mixed credentials", () => {
    expect(parsePairRequestBody({})).toEqual({
      error: "missing deviceId",
      ok: false
    });
    expect(
      parsePairRequestBody({
        code: "123456",
        deviceId: "device-a",
        deviceName: "Phone",
        devicePublicKey: "device-pk",
        platform: "web",
        protocolVersion: 1
      })
    ).toEqual({ error: "unsupported platform", ok: false });
    expect(
      parsePairRequestBody({
        code: "123456",
        deviceId: "device-a",
        deviceName: "Phone",
        devicePublicKey: "device-pk",
        platform: "android",
        protocolVersion: 1,
        secret: "pair-secret"
      })
    ).toEqual({ error: "provide exactly one of secret or code", ok: false });
  });
});

describe("review request parsers", () => {
  it("parses mark reviewed bodies with optional previous paths", () => {
    expect(
      parseMarkReviewedBody({
        displayedDiffHash: "hash",
        path: "src/App.tsx",
        previousPath: "src/OldApp.tsx",
        reviewTargetId: "target"
      })
    ).toEqual({
      ok: true,
      value: {
        displayedDiffHash: "hash",
        path: "src/App.tsx",
        previousPath: "src/OldApp.tsx",
        reviewTargetId: "target"
      }
    });
  });

  it("parses comment create/update bodies and rejects wrong types", () => {
    expect(
      parseCreateCommentBody({
        body: "Please simplify this branch.",
        diffHash: "hash",
        lineEnd: 12,
        lineStart: 10,
        path: "src/App.tsx",
        reviewTargetId: "target",
        side: "additions"
      })
    ).toEqual(
      expect.objectContaining({
        ok: true
      })
    );
    expect(parseCreateCommentBody({ lineStart: "10" })).toEqual({
      error: "missing body",
      ok: false
    });
    expect(parseUpdateCommentBody({ body: "Updated" })).toEqual({
      ok: true,
      value: { body: "Updated" }
    });
    expect(parseUpdateCommentBody({ body: 42 })).toEqual({
      error: "missing body",
      ok: false
    });
  });

  it("parses diff target requests", () => {
    expect(parseDiffTargetBody({ mode: "working_tree" })).toEqual({
      ok: true,
      value: { mode: "working_tree" }
    });
    expect(parseDiffTargetBody({ mode: "branch", ref: "origin/main" })).toEqual({
      ok: true,
      value: { mode: "branch", ref: "origin/main" }
    });
    expect(parseDiffTargetBody({ mode: "commit" })).toEqual({
      error: "missing ref",
      ok: false
    });
  });
});

describe("parseCompanionServerEvent", () => {
  it("accepts every server event shape", () => {
    expect(
      parseCompanionServerEvent({
        kind: "hello",
        protocolVersion: 1,
        serverName: "MacBook"
      })
    ).toEqual(
      expect.objectContaining({
        ok: true
      })
    );
    expect(
      parseCompanionServerEvent({
        kind: "workspace_changed",
        projectId: "project-a",
        reason: "comments"
      })
    ).toEqual(
      expect.objectContaining({
        ok: true
      })
    );
    expect(parseCompanionServerEvent({ kind: "device_revoked" })).toEqual({
      ok: true,
      value: { kind: "device_revoked" }
    });
    expect(parseCompanionServerEvent({ kind: "server_stopping" })).toEqual({
      ok: true,
      value: { kind: "server_stopping" }
    });
  });

  it("rejects malformed events", () => {
    expect(parseCompanionServerEvent({ kind: "workspace_changed" })).toEqual({
      error: "missing projectId",
      ok: false
    });
    expect(parseCompanionServerEvent({ kind: "hello", protocolVersion: "1" })).toEqual({
      error: "missing protocolVersion",
      ok: false
    });
    expect(parseCompanionServerEvent({ kind: "hello", protocolVersion: 1.5 })).toEqual({
      error: "missing protocolVersion",
      ok: false
    });
  });
});
