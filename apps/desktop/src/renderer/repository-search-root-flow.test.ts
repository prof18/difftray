import { describe, expect, it, vi } from "vitest";

import {
  addRepositorySearchRootThen,
  scanFolderForRepositories
} from "./repository-search-root-flow.js";

// The empty window's "Scan a folder…" added the folder and then showed nothing:
// no picker, no progress, so it looked like the click did nothing. Every entry
// point now runs this one flow.
describe("scanFolderForRepositories", () => {
  it("shows the scanned folder's results once it is approved", async () => {
    const openRepositoryPicker = vi.fn();
    const onError = vi.fn();

    await scanFolderForRepositories({
      addRepositorySearchRoot: async () => "/Users/me/Workspace",
      onError,
      openRepositoryPicker
    });

    expect(openRepositoryPicker).toHaveBeenCalledWith("/Users/me/Workspace");
    expect(onError).not.toHaveBeenCalled();
  });

  it("stays put when the folder dialog is cancelled", async () => {
    const openRepositoryPicker = vi.fn();

    await scanFolderForRepositories({
      addRepositorySearchRoot: async () => null,
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

    await addRepositorySearchRootThen(async () => "/Users/me/Workspace", onAdded);

    expect(onAdded).toHaveBeenCalledWith("/Users/me/Workspace");
  });

  it("does not open or reopen Quick Open when folder selection is cancelled", async () => {
    const onAdded = vi.fn();

    await addRepositorySearchRootThen(async () => null, onAdded);

    expect(onAdded).not.toHaveBeenCalled();
  });
});
