import { describe, expect, it, vi } from "vitest";
import { CompanionWorkspaceCache } from "./workspace-cache.js";

describe("CompanionWorkspaceCache", () => {
  it("refreshes a cached workspace", async () => {
    const load = vi.fn().mockResolvedValueOnce("A").mockResolvedValueOnce("B");
    const cache = new CompanionWorkspaceCache(load);
    await expect(cache.load("p")).resolves.toBe("A");
    await expect(cache.refresh("p")).resolves.toBe("B");
    await expect(cache.load("p")).resolves.toBe("B");
  });

  it("does not let an in-flight old load overwrite a refresh", async () => {
    let resolveOld!: (value: string) => void;
    const old = new Promise<string>((resolve) => {
      resolveOld = resolve;
    });
    const load = vi.fn().mockReturnValueOnce(old).mockResolvedValueOnce("B");
    const cache = new CompanionWorkspaceCache(load);
    const pending = cache.load("p");
    await expect(cache.refresh("p")).resolves.toBe("B");
    resolveOld("A");
    await expect(pending).resolves.toBe("A");
    await expect(cache.load("p")).resolves.toBe("B");
  });

  it("does not cache failed loads", async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce("B");
    const cache = new CompanionWorkspaceCache(load);
    await expect(cache.load("p")).rejects.toThrow("boom");
    await expect(cache.load("p")).resolves.toBe("B");
  });
});
