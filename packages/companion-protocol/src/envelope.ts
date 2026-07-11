import nacl from "tweetnacl";

export type EncryptedEnvelope = {
  readonly box: string;
  readonly devicePk: string;
  readonly nonce: string;
  readonly v: 1;
};

export type EnvelopeRequestPlain = {
  readonly body?: unknown;
  readonly method: string;
  readonly path: string;
  readonly requestId: string;
  readonly ts: string;
};

export type EnvelopeResponsePlain = {
  readonly body: unknown;
  readonly requestId: string;
  readonly status: number;
  readonly ts: string;
};

export type SealEnvelopeInput = {
  readonly devicePublicKey: string;
  readonly nonce?: string;
  readonly plaintext: unknown;
  readonly recipientPublicKey: string;
  readonly senderSecretKey: string;
};

export type OpenEnvelopeInput = {
  readonly envelope: EncryptedEnvelope;
  readonly expectedMethod?: string;
  readonly expectedPath?: string;
  readonly expectedRequestId?: string;
  readonly maxClockSkewMs?: number;
  readonly now?: Date;
  readonly recipientSecretKey: string;
  readonly senderPublicKey?: string;
};

export type OpenEnvelopeResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly error: string; readonly ok: false };

const base64Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const base64UrlPattern = /^[A-Za-z0-9_-]*$/;

export function sealEnvelope(input: SealEnvelopeInput): EncryptedEnvelope {
  const nonce = input.nonce
    ? decodeBase64Url(input.nonce)
    : nacl.randomBytes(nacl.box.nonceLength);

  if (nonce.length !== nacl.box.nonceLength) {
    throw new Error("Invalid nonce length");
  }

  const box = nacl.box(
    utf8Encode(JSON.stringify(input.plaintext)),
    nonce,
    decodePublicKey(input.recipientPublicKey),
    decodeSecretKey(input.senderSecretKey)
  );

  return {
    box: encodeBase64Url(box),
    devicePk: input.devicePublicKey,
    nonce: encodeBase64Url(nonce),
    v: 1
  };
}

export function openEnvelope(input: OpenEnvelopeInput): OpenEnvelopeResult {
  if ((input.envelope as { readonly v: number }).v !== 1) {
    return { error: "unsupported envelope version", ok: false };
  }

  let plaintextBytes: Uint8Array | null;

  try {
    plaintextBytes = nacl.box.open(
      decodeBase64Url(input.envelope.box),
      decodeBase64Url(input.envelope.nonce),
      decodePublicKey(input.senderPublicKey ?? input.envelope.devicePk),
      decodeSecretKey(input.recipientSecretKey)
    );
  } catch {
    return { error: "invalid envelope", ok: false };
  }

  if (!plaintextBytes) {
    return { error: "invalid envelope", ok: false };
  }

  let value: unknown;

  try {
    value = JSON.parse(utf8Decode(plaintextBytes)) as unknown;
  } catch {
    return { error: "invalid envelope payload", ok: false };
  }

  const shapeError = validateEnvelopePlaintext(value, input);

  if (shapeError) {
    return { error: shapeError, ok: false };
  }

  return { ok: true, value };
}

export function fingerprintPublicKey(publicKey: string | Uint8Array): string {
  const keyBytes = typeof publicKey === "string" ? decodePublicKey(publicKey) : publicKey;

  return encodeBase64Url(nacl.hash(keyBytes).slice(0, 16));
}

export function shortFingerprint(publicKey: string | Uint8Array): string {
  const keyBytes = typeof publicKey === "string" ? decodePublicKey(publicKey) : publicKey;
  const hex = Array.from(nacl.hash(keyBytes).slice(0, 6), (byte) =>
    byte.toString(16).padStart(2, "0")
  )
    .join("")
    .toUpperCase();

  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}

export function encodeBase64Url(bytes: Uint8Array): string {
  let output = "";

  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;
    const value = (first << 16) | (second << 8) | third;

    output += base64AlphabetAt((value >> 18) & 63);
    output += base64AlphabetAt((value >> 12) & 63);
    output += index + 1 < bytes.length ? base64AlphabetAt((value >> 6) & 63) : "=";
    output += index + 2 < bytes.length ? base64AlphabetAt(value & 63) : "=";
  }

  return output.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function decodeBase64Url(input: string): Uint8Array {
  if (!base64UrlPattern.test(input) || input.length % 4 === 1) {
    throw new Error("Invalid base64url input");
  }

  const paddingLength = (4 - (input.length % 4)) % 4;
  const padded = `${input.replaceAll("-", "+").replaceAll("_", "/")}${"=".repeat(
    paddingLength
  )}`;

  if (padded.length % 4 !== 0) {
    throw new Error("Invalid base64url input");
  }

  const outputLength =
    (padded.length / 4) * 3 - (padded.endsWith("==") ? 2 : padded.endsWith("=") ? 1 : 0);
  const output = new Uint8Array(outputLength);
  let outputIndex = 0;

  for (let index = 0; index < padded.length; index += 4) {
    const chars = [
      base64Value(charAt(padded, index)),
      base64Value(charAt(padded, index + 1)),
      base64Value(charAt(padded, index + 2)),
      base64Value(charAt(padded, index + 3))
    ] as const;
    const value =
      (chars[0] << 18) | (chars[1] << 12) | ((chars[2] & 63) << 6) | (chars[3] & 63);

    if (outputIndex < output.length) {
      output[outputIndex] = (value >> 16) & 255;
      outputIndex += 1;
    }
    if (outputIndex < output.length) {
      output[outputIndex] = (value >> 8) & 255;
      outputIndex += 1;
    }
    if (outputIndex < output.length) {
      output[outputIndex] = value & 255;
      outputIndex += 1;
    }
  }

  return output;
}

function validateEnvelopePlaintext(
  value: unknown,
  input: Pick<
    OpenEnvelopeInput,
    "expectedMethod" | "expectedPath" | "expectedRequestId" | "maxClockSkewMs" | "now"
  >
): string | undefined {
  if (typeof value !== "object" || value === null) {
    return "invalid envelope payload";
  }

  const record = value as Record<string, unknown>;

  if (input.expectedMethod !== undefined && record.method !== input.expectedMethod) {
    return "method mismatch";
  }

  if (input.expectedPath !== undefined && record.path !== input.expectedPath) {
    return "path mismatch";
  }

  if (input.expectedRequestId !== undefined) {
    if (record.method !== undefined || record.path !== undefined) {
      return "unexpected response shape";
    }

    if (record.requestId !== input.expectedRequestId) {
      return "requestId mismatch";
    }

    if (typeof record.status !== "number" || !Number.isFinite(record.status)) {
      return "missing response status";
    }
  }

  if (input.maxClockSkewMs !== undefined) {
    if (typeof record.ts !== "string") {
      return "missing timestamp";
    }

    const timestamp = Date.parse(record.ts);

    if (!Number.isFinite(timestamp)) {
      return "invalid timestamp";
    }

    const now = input.now?.getTime() ?? Date.now();

    if (Math.abs(now - timestamp) > input.maxClockSkewMs) {
      return "timestamp skew";
    }
  }

  return undefined;
}

function decodePublicKey(input: string): Uint8Array {
  const bytes = decodeBase64Url(input);

  if (bytes.length !== nacl.box.publicKeyLength) {
    throw new Error("Invalid public key length");
  }

  return bytes;
}

function decodeSecretKey(input: string): Uint8Array {
  const bytes = decodeBase64Url(input);

  if (bytes.length !== nacl.box.secretKeyLength) {
    throw new Error("Invalid secret key length");
  }

  return bytes;
}

function base64Value(input: string | undefined): number {
  if (input === "=") {
    return 0;
  }

  if (input === undefined) {
    throw new Error("Invalid base64url input");
  }

  const value = base64Alphabet.indexOf(input);

  if (value < 0) {
    throw new Error("Invalid base64url input");
  }

  return value;
}

function base64AlphabetAt(index: number): string {
  const char = base64Alphabet[index];

  if (char === undefined) {
    throw new Error("Invalid base64 index");
  }

  return char;
}

function charAt(input: string, index: number): string {
  const char = input[index];

  if (char === undefined) {
    throw new Error("Invalid base64url input");
  }

  return char;
}

function utf8Encode(input: string): Uint8Array {
  const escaped = encodeURIComponent(input);
  const bytes: number[] = [];

  for (let index = 0; index < escaped.length; index += 1) {
    const char = escaped[index];

    if (char === undefined) {
      throw new Error("Invalid UTF-8 input");
    }

    if (char === "%") {
      bytes.push(Number.parseInt(escaped.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      bytes.push(char.charCodeAt(0));
    }
  }

  return new Uint8Array(bytes);
}

function utf8Decode(input: Uint8Array): string {
  let escaped = "";

  for (const byte of input) {
    escaped += `%${byte.toString(16).padStart(2, "0")}`;
  }

  return decodeURIComponent(escaped);
}
