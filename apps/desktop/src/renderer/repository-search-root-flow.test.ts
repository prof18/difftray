import { describe, expect, it, vi } from "vitest";

import { addRepositorySearchRootThen } from "./repository-search-root-flow.js";

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
