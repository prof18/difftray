import type {
  FileDiffStatus,
  FileImageResponse,
  FileImageSide
} from "@difftray/companion-protocol";

export type FileImageValidationSnapshot = {
  readonly diffHash: string;
  readonly reviewTargetId: string;
};

export type LoadedFileImage = {
  readonly response: Omit<FileImageResponse, "diffHash">;
  readonly reviewTargetId: string;
};

export function requiredFileImagePreflightSides(
  requestedSide: FileImageSide,
  status: FileDiffStatus
): readonly FileImageSide[] {
  const fingerprintSide = status === "deleted" ? "old" : "new";

  return requestedSide === fingerprintSide
    ? [requestedSide]
    : [requestedSide, fingerprintSide];
}

export async function loadValidatedFileImage({
  expectedDiffHash,
  loadImage,
  loadValidationSnapshot,
  preflight
}: {
  readonly expectedDiffHash: string;
  readonly loadImage: () => Promise<LoadedFileImage | null>;
  readonly loadValidationSnapshot: () => Promise<FileImageValidationSnapshot | null>;
  readonly preflight: () => Promise<boolean>;
}): Promise<FileImageResponse | null> {
  if (!(await preflight())) {
    return null;
  }

  const before = await loadValidationSnapshot();

  if (before?.diffHash !== expectedDiffHash) {
    return null;
  }

  const loaded = await loadImage();

  if (loaded?.reviewTargetId !== before.reviewTargetId) {
    return null;
  }

  const after = await loadValidationSnapshot();

  if (
    after?.diffHash !== expectedDiffHash ||
    after.reviewTargetId !== before.reviewTargetId
  ) {
    return null;
  }

  return {
    ...loaded.response,
    diffHash: expectedDiffHash
  };
}
