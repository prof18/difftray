import { describe, expect, it, vi } from "vitest";

import {
  loadValidatedFileImage,
  requiredFileImagePreflightSides,
  type FileImageValidationSnapshot
} from "./file-image-loader.js";

describe("loadValidatedFileImage", () => {
  it("returns an image when the file and review target stay current", async () => {
    const loadValidationSnapshot = vi.fn(() => Promise.resolve(snapshot()));

    await expect(
      loadValidatedFileImage({
        expectedDiffHash: "diff-b",
        loadImage: async () => ({
          response: imageResponse(),
          reviewTargetId: "target-b"
        }),
        loadValidationSnapshot,
        preflight: passPreflight
      })
    ).resolves.toEqual({ ...imageResponse(), diffHash: "diff-b" });
    expect(loadValidationSnapshot).toHaveBeenCalledTimes(2);
  });

  it("rejects bytes loaded from a different review target", async () => {
    const loadValidationSnapshot = vi.fn(() => Promise.resolve(snapshot()));

    await expect(
      loadValidatedFileImage({
        expectedDiffHash: "diff-b",
        loadImage: async () => ({
          response: imageResponse(),
          reviewTargetId: "target-c"
        }),
        loadValidationSnapshot,
        preflight: passPreflight
      })
    ).resolves.toBeNull();
    expect(loadValidationSnapshot).toHaveBeenCalledOnce();
  });

  it("does not load bytes when the expected diff is already stale", async () => {
    const loadImage = vi.fn(() =>
      Promise.resolve({
        response: imageResponse(),
        reviewTargetId: "target-b"
      })
    );

    await expect(
      loadValidatedFileImage({
        expectedDiffHash: "diff-a",
        loadImage,
        loadValidationSnapshot: async () => snapshot(),
        preflight: passPreflight
      })
    ).resolves.toBeNull();
    expect(loadImage).not.toHaveBeenCalled();
  });

  it("rejects bytes when the file changes while the image is loading", async () => {
    const loadValidationSnapshot = vi
      .fn<() => Promise<FileImageValidationSnapshot | null>>()
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce(snapshot({ diffHash: "diff-c" }));

    await expect(
      loadValidatedFileImage({
        expectedDiffHash: "diff-b",
        loadImage: async () => ({
          response: imageResponse(),
          reviewTargetId: "target-b"
        }),
        loadValidationSnapshot,
        preflight: passPreflight
      })
    ).resolves.toBeNull();
  });

  it("rejects bytes when the review target changes while loading", async () => {
    const loadValidationSnapshot = vi
      .fn<() => Promise<FileImageValidationSnapshot | null>>()
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce(snapshot({ reviewTargetId: "target-c" }));

    await expect(
      loadValidatedFileImage({
        expectedDiffHash: "diff-b",
        loadImage: async () => ({
          response: imageResponse(),
          reviewTargetId: "target-b"
        }),
        loadValidationSnapshot,
        preflight: passPreflight
      })
    ).resolves.toBeNull();
  });

  it("skips expensive validation and loading when the image exceeds its cap", async () => {
    const loadImage = vi.fn(() => Promise.resolve(null));
    const loadValidationSnapshot = vi.fn(() => Promise.resolve(snapshot()));

    await expect(
      loadValidatedFileImage({
        expectedDiffHash: "diff-b",
        loadImage,
        loadValidationSnapshot,
        preflight: async () => false
      })
    ).resolves.toBeNull();
    expect(loadValidationSnapshot).not.toHaveBeenCalled();
    expect(loadImage).not.toHaveBeenCalled();
  });
});

describe("requiredFileImagePreflightSides", () => {
  it.each([
    ["old", "modified", ["old", "new"]],
    ["new", "modified", ["new"]],
    ["old", "deleted", ["old"]]
  ] as const)("checks %s for a %s file", (side, status, expected) => {
    expect(requiredFileImagePreflightSides(side, status)).toEqual(expected);
  });
});

function passPreflight(): Promise<boolean> {
  return Promise.resolve(true);
}

function snapshot(
  patch: Partial<FileImageValidationSnapshot> = {}
): FileImageValidationSnapshot {
  return {
    diffHash: "diff-b",
    reviewTargetId: "target-b",
    ...patch
  };
}

function imageResponse() {
  return {
    image: {
      dataBase64: "iVBORw0KGgo=",
      height: 1,
      mimeType: "image/png" as const,
      width: 1
    },
    side: "new" as const
  };
}
