import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";

import { gitBuffer, gitOutputOrNull } from "./git-command.js";

export const maxRasterImageBytes = 4 * 1024 * 1024;
export const maxRasterImagePixels = 8_000_000;

export type RasterImageMimeType = "image/jpeg" | "image/png" | "image/webp";

export type RasterImageSnapshot = {
  readonly bytes: Buffer;
  readonly height: number;
  readonly mimeType: RasterImageMimeType;
  readonly width: number;
};

export type RasterImageSnapshotSource =
  | {
      readonly kind: "git";
      readonly path: string;
      readonly ref: string;
    }
  | {
      readonly kind: "worktree";
      readonly path: string;
    };

export async function rasterImageSnapshotWithinSizeLimit(
  repoPath: string,
  source: RasterImageSnapshotSource
): Promise<boolean> {
  try {
    if (source.kind === "git") {
      if (!isSafeRelativePath(source.path)) {
        return false;
      }

      const sizeText = await gitOutputOrNull(repoPath, [
        "cat-file",
        "-s",
        `${source.ref}:${source.path}`
      ]);
      const size = sizeText ? Number(sizeText) : Number.NaN;

      return Number.isSafeInteger(size) && size >= 0 && size <= maxRasterImageBytes;
    }

    const absolutePath = safeWorktreePath(repoPath, source.path);

    if (!absolutePath) {
      return false;
    }

    const fileStat = await lstat(absolutePath);

    return fileStat.isFile() && fileStat.size <= maxRasterImageBytes;
  } catch {
    return false;
  }
}

export async function loadRasterImageSnapshot(
  repoPath: string,
  source: RasterImageSnapshotSource
): Promise<RasterImageSnapshot | undefined> {
  try {
    const bytes =
      source.kind === "git"
        ? await readGitSnapshot(repoPath, source.ref, source.path)
        : await readWorktreeSnapshot(repoPath, source.path);

    if (!bytes) {
      return undefined;
    }

    const metadata = rasterImageMetadata(bytes);

    if (!metadata || metadata.width * metadata.height > maxRasterImagePixels) {
      return undefined;
    }

    return { bytes, ...metadata };
  } catch {
    return undefined;
  }
}

async function readGitSnapshot(
  repoPath: string,
  ref: string,
  relativePath: string
): Promise<Buffer | undefined> {
  if (!isSafeRelativePath(relativePath)) {
    return undefined;
  }

  const object = `${ref}:${relativePath}`;
  const sizeText = await gitOutputOrNull(repoPath, ["cat-file", "-s", object]);
  const size = sizeText ? Number(sizeText) : Number.NaN;

  if (!Number.isSafeInteger(size) || size < 0 || size > maxRasterImageBytes) {
    return undefined;
  }

  const bytes = await gitBuffer(repoPath, ["show", object]);

  return bytes.length <= maxRasterImageBytes ? bytes : undefined;
}

async function readWorktreeSnapshot(
  repoPath: string,
  relativePath: string
): Promise<Buffer | undefined> {
  const absolutePath = safeWorktreePath(repoPath, relativePath);

  if (!absolutePath) {
    return undefined;
  }

  const fileStat = await lstat(absolutePath);

  if (!fileStat.isFile() || fileStat.size > maxRasterImageBytes) {
    return undefined;
  }

  const [realRoot, realFile] = await Promise.all([
    realpath(repoPath),
    realpath(absolutePath)
  ]);
  const relativeRealPath = path.relative(realRoot, realFile);

  if (
    relativeRealPath === ".." ||
    relativeRealPath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeRealPath)
  ) {
    return undefined;
  }

  const bytes = await readFile(absolutePath);

  return bytes.length <= maxRasterImageBytes ? bytes : undefined;
}

function safeWorktreePath(repoPath: string, relativePath: string): string | undefined {
  if (!isSafeRelativePath(relativePath)) {
    return undefined;
  }

  const root = path.resolve(repoPath);
  const candidate = path.resolve(root, relativePath);
  const relative = path.relative(root, candidate);

  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".."
    ? candidate
    : undefined;
}

function isSafeRelativePath(relativePath: string): boolean {
  return (
    relativePath.length > 0 &&
    !path.isAbsolute(relativePath) &&
    !relativePath.includes("\0")
  );
}

function rasterImageMetadata(
  bytes: Buffer
): Omit<RasterImageSnapshot, "bytes"> | undefined {
  return pngMetadata(bytes) ?? jpegMetadata(bytes) ?? webpMetadata(bytes);
}

function pngMetadata(bytes: Buffer): Omit<RasterImageSnapshot, "bytes"> | undefined {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  if (
    bytes.length < 24 ||
    !bytes.subarray(0, signature.length).equals(signature) ||
    bytes.toString("ascii", 12, 16) !== "IHDR" ||
    hasPngChunk(bytes, "acTL")
  ) {
    return undefined;
  }

  return dimensions("image/png", bytes.readUInt32BE(16), bytes.readUInt32BE(20));
}

function hasPngChunk(bytes: Buffer, expectedType: string): boolean {
  let offset = 8;

  while (offset + 8 <= bytes.length) {
    const dataLength = bytes.readUInt32BE(offset);
    const nextOffset = offset + 12 + dataLength;

    if (nextOffset > bytes.length || nextOffset <= offset) {
      return false;
    }

    if (bytes.toString("ascii", offset + 4, offset + 8) === expectedType) {
      return true;
    }

    offset = nextOffset;
  }

  return false;
}

function jpegMetadata(bytes: Buffer): Omit<RasterImageSnapshot, "bytes"> | undefined {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return undefined;
  }

  let offset = 2;

  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    while (bytes[offset] === 0xff) {
      offset += 1;
    }

    const marker = bytes[offset];

    if (marker === undefined || marker === 0xd9 || marker === 0xda) {
      return undefined;
    }

    if (jpegStartOfFrameMarkers.has(marker)) {
      return dimensions(
        "image/jpeg",
        bytes.readUInt16BE(offset + 6),
        bytes.readUInt16BE(offset + 4)
      );
    }

    const segmentLength = bytes.readUInt16BE(offset + 1);

    if (segmentLength < 2) {
      return undefined;
    }
    offset += segmentLength + 1;
  }

  return undefined;
}

const jpegStartOfFrameMarkers = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf
]);

function webpMetadata(bytes: Buffer): Omit<RasterImageSnapshot, "bytes"> | undefined {
  if (
    bytes.length < 30 ||
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return undefined;
  }

  const chunk = bytes.toString("ascii", 12, 16);

  if (chunk === "VP8X") {
    if ((bytes[20] ?? 0) & 0x02) {
      return undefined;
    }
    return dimensions(
      "image/webp",
      1 + readUInt24LE(bytes, 24),
      1 + readUInt24LE(bytes, 27)
    );
  }

  if (chunk === "VP8L" && bytes[20] === 0x2f) {
    const b0 = bytes[21] ?? 0;
    const b1 = bytes[22] ?? 0;
    const b2 = bytes[23] ?? 0;
    const b3 = bytes[24] ?? 0;
    return dimensions(
      "image/webp",
      1 + b0 + ((b1 & 0x3f) << 8),
      1 + (b1 >> 6) + (b2 << 2) + ((b3 & 0x0f) << 10)
    );
  }

  if (
    chunk === "VP8 " &&
    bytes[23] === 0x9d &&
    bytes[24] === 0x01 &&
    bytes[25] === 0x2a
  ) {
    return dimensions(
      "image/webp",
      bytes.readUInt16LE(26) & 0x3fff,
      bytes.readUInt16LE(28) & 0x3fff
    );
  }

  return undefined;
}

function readUInt24LE(bytes: Buffer, offset: number): number {
  return (
    (bytes[offset] ?? 0) |
    ((bytes[offset + 1] ?? 0) << 8) |
    ((bytes[offset + 2] ?? 0) << 16)
  );
}

function dimensions(
  mimeType: RasterImageMimeType,
  width: number,
  height: number
): Omit<RasterImageSnapshot, "bytes"> | undefined {
  return Number.isSafeInteger(width) &&
    Number.isSafeInteger(height) &&
    width > 0 &&
    height > 0
    ? { height, mimeType, width }
    : undefined;
}
