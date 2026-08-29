import { describe, expect, it, vi } from "vitest";

import { previewDroppedRepositoryCandidates } from "./repository-drop-preview.js";

describe("dropped repository preview", () => {
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
