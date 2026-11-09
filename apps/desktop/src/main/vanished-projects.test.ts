import { describe, expect, it, vi } from "vitest";

import {
  isProjectPathPresent,
  loadUnlessVanished,
  vanishedProjectIds
} from "./vanished-projects.js";

function pathExistsFor(paths: readonly string[]): (pathName: string) => boolean {
  const existing = new Set(paths);
  return (pathName) => existing.has(pathName);
}

describe("isProjectPathPresent", () => {
  it("is present when the folder and its .git entry exist", () => {
    expect(isProjectPathPresent("/r", pathExistsFor(["/r", "/r/.git"]))).toBe(true);
  });

  it("is gone when the folder is missing", () => {
    expect(isProjectPathPresent("/r", pathExistsFor([]))).toBe(false);
  });

  it("is gone when the folder has no .git entry", () => {
    expect(isProjectPathPresent("/r", pathExistsFor(["/r", "/r/node_modules"]))).toBe(
      false
    );
  });
});

describe("vanishedProjectIds", () => {
  it("returns only the ids of gone projects, in input order", () => {
    const pathExists = pathExistsFor(["/a", "/a/.git", "/c"]);

    expect(
      vanishedProjectIds(
        [
          { id: "b", path: "/b" },
          { id: "a", path: "/a" },
          { id: "c", path: "/c" }
        ],
        pathExists
      )
    ).toEqual(["b", "c"]);
  });
});

describe("loadUnlessVanished", () => {
  it("skips the load when the project is already gone", async () => {
    const load = vi.fn(async () => "workspace");
    const onVanished = vi.fn(async () => undefined);

    await expect(
      loadUnlessVanished({ isPresent: () => false, load, onVanished })
    ).resolves.toBeNull();
    expect(load).not.toHaveBeenCalled();
    expect(onVanished).toHaveBeenCalledOnce();
  });

  it("returns the loaded value while the project stays present", async () => {
    const onVanished = vi.fn(async () => undefined);

    await expect(
      loadUnlessVanished({
        isPresent: () => true,
        load: async () => "workspace",
        onVanished
      })
    ).resolves.toBe("workspace");
    expect(onVanished).not.toHaveBeenCalled();
  });

  it("returns null when the project vanishes during a successful load", async () => {
    let present = true;
    const onVanished = vi.fn(async () => undefined);

    await expect(
      loadUnlessVanished({
        isPresent: () => present,
        load: async () => {
          present = false;
          return "workspace";
        },
        onVanished
      })
    ).resolves.toBeNull();
    expect(onVanished).toHaveBeenCalledOnce();
  });

  it("returns null when the load fails because the project vanished", async () => {
    let present = true;
    const onVanished = vi.fn(async () => undefined);

    await expect(
      loadUnlessVanished({
        isPresent: () => present,
        load: async () => {
          present = false;
          throw new Error("gone");
        },
        onVanished
      })
    ).resolves.toBeNull();
    expect(onVanished).toHaveBeenCalledOnce();
  });

  it("rethrows a load failure while the project is still present", async () => {
    const onVanished = vi.fn(async () => undefined);
    const failure = new Error("git failed");

    await expect(
      loadUnlessVanished({
        isPresent: () => true,
        load: async () => {
          throw failure;
        },
        onVanished
      })
    ).rejects.toBe(failure);
    expect(onVanished).not.toHaveBeenCalled();
  });
});
