import { describe, expect, it, vi } from "vitest";

import {
  previewDroppedRepositoryCandidates,
  rememberDroppedRepositorySearchRoots
} from "./repository-drop-preview.js";

describe("dropped repository preview", () => {
  it("does not remember a search folder that became invalid after preview", () => {
    const remember = vi.fn();

    rememberDroppedRepositorySearchRoots(
      [{ path: "/workspace/project", searchRootPath: "/workspace" }],
      { isDirectory: () => false, remember }
    );

    expect(remember).not.toHaveBeenCalled();
  });

  it("surfaces storage failures while remembering a valid search folder", () => {
    expect(() =>
      rememberDroppedRepositorySearchRoots(
        [{ path: "/workspace/project", searchRootPath: "/workspace" }],
        {
          isDirectory: () => true,
          remember: () => {
            throw new Error("storage failed");
          }
        }
      )
    ).toThrow("storage failed");
  });

  it("ignores dropped files before looking for a containing repository", async () => {
    const discoverRepositories = vi.fn(async () => ({ candidates: [] }));
    const findRepository = vi.fn(async () => ({ root: "/workspace" }));

    const result = await previewDroppedRepositoryCandidates(
      ["/workspace/screenshot.png"],
      {
        discoverRepositories,
        findRepository,
        isDirectory: () => false,
        realpath: (value) => value
      }
    );

    expect(result).toEqual([]);
    expect(findRepository).not.toHaveBeenCalled();
    expect(discoverRepositories).not.toHaveBeenCalled();
  });

  it("keeps a containing repository and does not make nested discovery rememberable", async () => {
    const result = await previewDroppedRepositoryCandidates(["/workspace/packages"], {
      discoverRepositories: vi.fn(async () => ({
        candidates: [{ name: "Nested", path: "/workspace/packages/nested" }]
      })),
      findRepository: vi.fn(async () => ({ root: "/workspace" })),
      isDirectory: () => true,
      realpath: (value) => value
    });

    expect(result).toEqual([
      { path: "/workspace", searchRootPath: undefined },
      { path: "/workspace/packages/nested", searchRootPath: undefined }
    ]);
  });

  it("makes repositories found by scanning a non-repository drop rememberable", async () => {
    const result = await previewDroppedRepositoryCandidates(["/workspace"], {
      discoverRepositories: vi.fn(async () => ({
        candidates: [{ name: "Project", path: "/workspace/project" }]
      })),
      findRepository: vi.fn(async () => null),
      isDirectory: () => true,
      realpath: (value) => value
    });

    expect(result).toEqual([
      { path: "/workspace/project", searchRootPath: "/workspace" }
    ]);
  });
});
