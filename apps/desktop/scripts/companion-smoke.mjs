#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import process from "node:process";
import { parseArgs } from "node:util";

import {
  COMPANION_PROTOCOL_VERSION,
  encodeBase64Url,
  openEnvelope,
  sealEnvelope,
  shortFingerprint
} from "@difftray/companion-protocol";
import nacl from "tweetnacl";

const usage = `Usage:
  pnpm --filter @difftray/desktop companion:smoke -- --mode qr --secret <qr-secret>
  pnpm --filter @difftray/desktop companion:smoke -- --mode code --code <6-digit-code>
  pnpm --filter @difftray/desktop companion:smoke -- --mode skip --device-public-key <key> --device-secret-key <key>

Options:
  --base-url <url>             Companion server URL. Defaults to http://127.0.0.1:48620.
  --mode <qr|code|skip>        Pairing path to exercise. Defaults to qr when --secret is present, code when --code is present, otherwise skip.
  --secret <secret>            QR pairing secret from the desktop pairing payload.
  --code <code>                Six-digit code shown in the desktop pairing dialog.
  --project-id <id>            Project id to load. Defaults to the first recent project.
  --device-name <name>         Device name sent during pairing. Defaults to Difftray Smoke.
  --platform <ios|android>     Device platform sent during pairing. Defaults to ios.
  --device-public-key <key>    Existing paired device public key.
  --device-secret-key <key>    Existing paired device secret key.
  --approval-timeout-ms <ms>   Code-mode approval wait. Defaults to 60000.
`;

const { values } = parseArgs({
  allowPositionals: false,
  args: process.argv.slice(2).filter((arg, index) => index !== 0 || arg !== "--"),
  options: {
    "base-url": { type: "string" },
    code: { type: "string" },
    "device-name": { type: "string" },
    "device-public-key": { type: "string" },
    "device-secret-key": { type: "string" },
    "approval-timeout-ms": { type: "string" },
    help: { short: "h", type: "boolean" },
    mode: { type: "string" },
    platform: { type: "string" },
    "project-id": { type: "string" },
    secret: { type: "string" }
  }
});

if (values.help) {
  console.log(usage.trim());
  process.exit(0);
}

const baseUrl = trimTrailingSlash(values["base-url"] ?? "http://127.0.0.1:48620");
const mode = readMode(values.mode, values.secret, values.code);
const platform = readPlatform(values.platform);
const deviceName = values["device-name"] ?? "Difftray Smoke";
const keys = readDeviceKeys(values["device-public-key"], values["device-secret-key"]);
const deviceId = `smoke-${shortFingerprint(keys.publicKey).replaceAll("-", "").toLowerCase()}`;
const approvalTimeoutMs = readPositiveInteger(
  values["approval-timeout-ms"],
  60_000,
  "--approval-timeout-ms"
);

try {
  const handshake = await readHandshake(baseUrl);

  console.log(
    `Handshake OK: ${handshake.serverName} (${handshake.serverId}) protocol ${handshake.protocolVersion}`
  );

  if (handshake.protocolVersion !== COMPANION_PROTOCOL_VERSION) {
    throw new Error(
      `Protocol mismatch: server=${handshake.protocolVersion} client=${COMPANION_PROTOCOL_VERSION}`
    );
  }

  if (mode !== "skip") {
    await pairDevice({
      code: values.code,
      deviceId,
      deviceName,
      mode,
      platform,
      secret: values.secret,
      serverPublicKey: handshake.serverPublicKey
    });
  }

  const projectsBody = await encryptedRequest({
    logicalMethod: "GET",
    path: "/companion/v1/projects",
    serverPublicKey: handshake.serverPublicKey
  });
  const projects = Array.isArray(projectsBody.projects) ? projectsBody.projects : [];

  console.log(`Projects OK: ${projects.length} project(s)`);

  const projectId = values["project-id"] ?? projects[0]?.id;

  if (!projectId) {
    throw new Error(
      "No project id available. Open a project in Difftray or pass --project-id."
    );
  }

  const workspaceBody = await encryptedRequest({
    logicalMethod: "GET",
    path: `/companion/v1/projects/${encodeURIComponent(projectId)}/workspace`,
    serverPublicKey: handshake.serverPublicKey
  });

  console.log(
    `Workspace OK: ${workspaceBody.workspace.project.name} (${workspaceBody.workspace.files.length} file(s))`
  );
  console.log(`Device public key: ${keys.publicKey}`);
  console.log(`Device fingerprint: ${shortFingerprint(keys.publicKey)}`);
} catch (caughtError) {
  console.error(caughtError instanceof Error ? caughtError.message : caughtError);
  process.exit(1);
}

async function pairDevice(input) {
  const pairBody = {
    deviceId: input.deviceId,
    deviceName: input.deviceName,
    devicePublicKey: keys.publicKey,
    platform: input.platform,
    protocolVersion: COMPANION_PROTOCOL_VERSION,
    ...(input.mode === "qr" ? { secret: required(input.secret, "--secret") } : {}),
    ...(input.mode === "code" ? { code: required(input.code, "--code") } : {})
  };
  const envelope = sealEnvelope({
    devicePublicKey: keys.publicKey,
    plaintext: pairBody,
    recipientPublicKey: input.serverPublicKey,
    senderSecretKey: keys.secretKey
  });
  const response = await jsonFetch(`${baseUrl}/companion/v1/pair`, {
    body: JSON.stringify(envelope),
    headers: { "content-type": "application/x-difftray-envelope" },
    method: "POST"
  });
  const opened = openEnvelope({
    envelope: response.body,
    recipientSecretKey: keys.secretKey,
    senderPublicKey: input.serverPublicKey
  });

  if (!opened.ok) {
    throw new Error(`Failed to open pair response: ${opened.error}`);
  }

  if (response.status === 200 && opened.value.status === "approved") {
    console.log(`Pair ${input.mode} OK: approved`);
    return;
  }

  if (response.status === 202 && opened.value.status === "pending") {
    console.log(`Pair code pending: ${opened.value.pairRequestId ?? "unknown request"}`);
    console.log(`Approve device '${input.deviceName}' in Difftray.`);
    console.log(`Device fingerprint: ${shortFingerprint(keys.publicKey)}`);
    await waitForApproval(input.serverPublicKey);
    console.log("Pair code OK: approved");
    return;
  }

  throw new Error(`Pair ${input.mode} failed: ${JSON.stringify(opened.value)}`);
}

async function encryptedRequest(input) {
  const requestId = randomUUID();
  const envelope = sealEnvelope({
    devicePublicKey: keys.publicKey,
    plaintext: {
      method: input.logicalMethod,
      path: input.path,
      requestId,
      ts: new Date().toISOString()
    },
    recipientPublicKey: input.serverPublicKey,
    senderSecretKey: keys.secretKey
  });
  const response = await jsonFetch(`${baseUrl}${input.path}`, {
    body: JSON.stringify(envelope),
    headers: { "content-type": "application/x-difftray-envelope" },
    method: "POST"
  });

  if (response.body?.error) {
    throw new Error(`${input.path} failed: ${JSON.stringify(response.body.error)}`);
  }

  const opened = openEnvelope({
    envelope: response.body,
    expectedRequestId: requestId,
    recipientSecretKey: keys.secretKey,
    senderPublicKey: input.serverPublicKey
  });

  if (!opened.ok) {
    throw new Error(`Failed to open ${input.path} response: ${opened.error}`);
  }

  if (opened.value.status < 200 || opened.value.status >= 300) {
    throw new Error(`${input.path} failed: ${JSON.stringify(opened.value.body)}`);
  }

  return opened.value.body;
}

async function readHandshake(baseUrl) {
  const response = await jsonFetch(`${baseUrl}/companion/v1/handshake`, {
    method: "GET"
  });

  if (response.status !== 200) {
    throw new Error(
      `Handshake failed: HTTP ${response.status} ${JSON.stringify(response.body)}`
    );
  }

  return response.body;
}

async function jsonFetch(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  let body;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${url} returned non-JSON response: ${text.slice(0, 160)}`);
  }

  return {
    body,
    status: response.status
  };
}

async function waitForApproval(serverPublicKey) {
  const startedAt = Date.now();
  let lastError;

  while (Date.now() - startedAt <= approvalTimeoutMs) {
    try {
      await encryptedRequest({
        logicalMethod: "GET",
        path: "/companion/v1/projects",
        serverPublicKey
      });
      return;
    } catch (caughtError) {
      lastError = caughtError;
      await delay(1_000);
    }
  }

  throw new Error(
    `Timed out waiting for desktop approval${
      lastError instanceof Error ? `: ${lastError.message}` : ""
    }`
  );
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function readDeviceKeys(publicKey, secretKey) {
  if (publicKey || secretKey) {
    if (!publicKey || !secretKey) {
      throw new Error(
        "--device-public-key and --device-secret-key must be provided together."
      );
    }

    return {
      publicKey,
      secretKey
    };
  }

  const keyPair = nacl.box.keyPair();

  return {
    publicKey: encodeBase64Url(keyPair.publicKey),
    secretKey: encodeBase64Url(keyPair.secretKey)
  };
}

function readMode(input, secret, code) {
  const mode = input ?? (secret ? "qr" : code ? "code" : "skip");

  if (!["qr", "code", "skip"].includes(mode)) {
    throw new Error("--mode must be qr, code, or skip.");
  }

  return mode;
}

function readPlatform(input) {
  const platform = input ?? "ios";

  if (platform !== "ios" && platform !== "android") {
    throw new Error("--platform must be ios or android.");
  }

  return platform;
}

function readPositiveInteger(input, fallback, flag) {
  if (input === undefined) {
    return fallback;
  }

  const value = Number.parseInt(input, 10);

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${flag} must be a positive integer.`);
  }

  return value;
}

function required(value, flag) {
  if (!value) {
    throw new Error(`${flag} is required for this mode.`);
  }

  return value;
}

function trimTrailingSlash(input) {
  return input.endsWith("/") ? input.slice(0, -1) : input;
}
