import { describe, expect, it, vi } from "vitest";

import {
  addRepositorySearchRootThen,
  scanFolderForRepositories
} from "./repository-search-root-flow.js";

// The empty window's "Scan a folder…" added the folder and then showed nothing:
// no picker, no progress, so it looked like the click did nothing. Every entry
// point now runs this one flow.
describe("scanFolderForRepositories", () => {
  it("opens the repository picker once the folder is approved", async () => {
    const openRepositoryPicker = vi.fn();
    const onError = vi.fn();

    await scanFolderForRepositories({
      addRepositorySearchRoot: async () => true,
      onError,
      openRepositoryPicker
    });

    expect(openRepositoryPicker).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });

  it("stays put when the folder dialog is cancelled", async () => {
    const openRepositoryPicker = vi.fn();

    await scanFolderForRepositories({
      addRepositorySearchRoot: async () => false,
      onError: vi.fn(),
      openRepositoryPicker
    });

    expect(openRepositoryPicker).not.toHaveBeenCalled();
  });

  it("reports a failure instead of dropping it", async () => {
    const onError = vi.fn();

    await scanFolderForRepositories({
      addRepositorySearchRoot: async () => {
        throw new Error("Folder is not readable");
      },
      onError,
      openRepositoryPicker: vi.fn()
    });

    expect(onError).toHaveBeenCalledWith(new Error("Folder is not readable"));
  });
});

describe("addRepositorySearchRootThen", () => {
  it("runs the success action after a search folder is added", async () => {
    const onAdded = vi.fn();

    await addRepositorySearchRootThen(async () => true, onAdded);

    expect(onAdded).toHaveBeenCalledOnce();
  });

  it("does not open or reopen Quick Open when folder selection is cancelled", async () => {
    const onAdded = vi.fn();

    await addRepositorySearchRootThen(async () => false, onAdded);

    expect(onAdded).not.toHaveBeenCalled();
  });
});
