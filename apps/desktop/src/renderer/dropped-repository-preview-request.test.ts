import { describe, expect, it, vi } from "vitest";

import { requestDroppedRepositoryPreview } from "./dropped-repository-preview-request.js";

describe("requestDroppedRepositoryPreview", () => {
  it("clears the current preview before starting the next request", () => {
    let visiblePreview = ["candidate-a"];
    const previewDroppedRepositories = vi.fn(async (files: readonly File[]) => {
      expect(files).toHaveLength(1);
      return ["candidate-b"];
    });

    requestDroppedRepositoryPreview([{} as File], {
      clearPreview: () => {
        visiblePreview = [];
      },
      isCurrent: () => true,
      onCandidates: () => undefined,
      onEmpty: () => undefined,
      onError: () => undefined,
      previewDroppedRepositories: (files) => {
        expect(visiblePreview).toEqual([]);
        return previewDroppedRepositories(files);
      }
    });

    expect(visiblePreview).toEqual([]);
    expect(previewDroppedRepositories).toHaveBeenCalledOnce();
  });

  it("invalidates a pending preview when a handled drop has no folders", async () => {
    let generation = 0;
    let resolvePreview: ((candidates: readonly string[]) => void) | undefined;
    const onCandidates = vi.fn();
    const previewDroppedRepositories = vi.fn(
      () =>
        new Promise<readonly string[]>((resolve) => {
          resolvePreview = resolve;
        })
    );
    const baseCallbacks = {
      clearPreview: vi.fn(),
      onCandidates,
      onEmpty: vi.fn(),
      onError: vi.fn(),
      previewDroppedRepositories
    };

    generation += 1;
    requestDroppedRepositoryPreview([{} as File], {
      ...baseCallbacks,
      isCurrent: () => generation === 1
    });
    generation += 1;
    requestDroppedRepositoryPreview([], {
      ...baseCallbacks,
      isCurrent: () => generation === 2
    });
    resolvePreview?.(["stale-candidate"]);
    await Promise.resolve();

    expect(baseCallbacks.clearPreview).toHaveBeenCalledTimes(2);
    expect(onCandidates).not.toHaveBeenCalled();
    expect(previewDroppedRepositories).toHaveBeenCalledOnce();
  });
});
