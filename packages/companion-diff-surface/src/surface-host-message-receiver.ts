import { parseHostMessage, type DiffSurfaceHostMessage } from "./surface-bridge.js";

export const DIFF_SURFACE_DEFAULT_CHUNK_DATA_LENGTH = 512 * 1024;

export type DiffSurfaceChunkFrame = {
  readonly data: string;
  readonly id: string;
  readonly index: number;
  readonly kind: "chunk";
  readonly total: number;
};

export type DiffSurfaceHostMessageReceiveResult =
  | {
      readonly kind: "invalid";
      readonly message: string;
    }
  | {
      readonly kind: "message";
      readonly message: DiffSurfaceHostMessage;
    }
  | {
      readonly kind: "pending";
    };

export type DiffSurfaceHostMessageFrame = DiffSurfaceChunkFrame | DiffSurfaceHostMessage;

export type DiffSurfaceHostMessageFrameOptions = {
  readonly chunkId: string;
  readonly maxFrameDataLength?: number;
};

type PendingChunkMessage = {
  readonly chunks: Map<number, string>;
  readonly total: number;
};

export function createDiffSurfaceHostMessageFrames(
  message: DiffSurfaceHostMessage,
  options: DiffSurfaceHostMessageFrameOptions
): readonly DiffSurfaceHostMessageFrame[] {
  const serialized = JSON.stringify(message);
  const maxFrameDataLength =
    options.maxFrameDataLength ?? DIFF_SURFACE_DEFAULT_CHUNK_DATA_LENGTH;

  if (!isPositiveInteger(maxFrameDataLength)) {
    throw new RangeError("maxFrameDataLength must be a positive integer");
  }

  if (options.chunkId.length === 0) {
    throw new Error("chunkId must not be empty");
  }

  if (serialized.length <= maxFrameDataLength) {
    return [message];
  }

  const total = Math.ceil(serialized.length / maxFrameDataLength);

  return Array.from({ length: total }, (_, index) => ({
    data: serialized.slice(index * maxFrameDataLength, (index + 1) * maxFrameDataLength),
    id: options.chunkId,
    index,
    kind: "chunk" as const,
    total
  }));
}

export function createDiffSurfaceHostMessageReceiver(): {
  readonly receive: (input: unknown) => DiffSurfaceHostMessageReceiveResult;
} {
  const pending = new Map<string, PendingChunkMessage>();

  return {
    receive(input) {
      const decoded = decodeBridgeInput(input);
      const directMessage = parseHostMessage(decoded);

      if (directMessage) {
        return { kind: "message", message: directMessage };
      }

      const chunk = parseChunkFrame(decoded);

      if (!chunk) {
        return { kind: "invalid", message: "Invalid host message" };
      }

      const active = pending.get(chunk.id);

      if (active && active.total !== chunk.total) {
        pending.delete(chunk.id);
        return { kind: "invalid", message: "Inconsistent chunk total" };
      }

      const message = active ?? {
        chunks: new Map<number, string>(),
        total: chunk.total
      };

      if (message.chunks.has(chunk.index)) {
        pending.delete(chunk.id);
        return { kind: "invalid", message: "Duplicate chunk frame" };
      }

      message.chunks.set(chunk.index, chunk.data);
      pending.set(chunk.id, message);

      if (message.chunks.size !== message.total) {
        return { kind: "pending" };
      }

      pending.delete(chunk.id);

      const assembled = decodeBridgeInput(
        Array.from(
          { length: message.total },
          (_, index) => message.chunks.get(index) ?? ""
        ).join("")
      );
      const hostMessage = parseHostMessage(assembled);

      return hostMessage
        ? { kind: "message", message: hostMessage }
        : { kind: "invalid", message: "Invalid reassembled host message" };
    }
  };
}

function parseChunkFrame(input: unknown): DiffSurfaceChunkFrame | null {
  if (
    !isRecord(input) ||
    !hasOnlyKeys(input, ["data", "id", "index", "kind", "total"]) ||
    input.kind !== "chunk" ||
    typeof input.data !== "string" ||
    typeof input.id !== "string" ||
    input.id.length === 0 ||
    !isNonNegativeInteger(input.index) ||
    !isPositiveInteger(input.total) ||
    input.index >= input.total
  ) {
    return null;
  }

  return {
    data: input.data,
    id: input.id,
    index: input.index,
    kind: "chunk",
    total: input.total
  };
}

function decodeBridgeInput(input: unknown): unknown {
  if (typeof input !== "string") {
    return input;
  }

  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function isNonNegativeInteger(input: unknown): input is number {
  return typeof input === "number" && Number.isInteger(input) && input >= 0;
}

function isPositiveInteger(input: unknown): input is number {
  return typeof input === "number" && Number.isInteger(input) && input > 0;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}

function hasOnlyKeys(input: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);

  return Object.keys(input).every((key) => allowed.has(key));
}
