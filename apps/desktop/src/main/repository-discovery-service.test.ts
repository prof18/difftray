import { mkdtemp, mkdir, realpath, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  isRepositoryScanAbort,
  resolveRepositoryCandidates
} from "./repository-discovery-service.js";

describe("repository scan cancellation", () => {
  it("recognizes AbortError values without treating other failures as cancellation", () => {
    expect(isRepositoryScanAbort(new DOMException("cancelled", "AbortError"))).toBe(true);
    expect(
      isRepositoryScanAbort(Object.assign(new Error("cancelled"), { name: "AbortError" }))
    ).toBe(true);
    expect(isRepositoryScanAbort(new Error("scan failed"))).toBe(false);
    expect(isRepositoryScanAbort("AbortError")).toBe(false);
  });

  it("does not return candidates when cancellation arrives during repository resolution", async () => {
    const controller = new AbortController();
    let finishResolution: ((value: { readonly root: string }) => void) | undefined;
    const resolution = new Promise<{ readonly root: string }>((resolve) => {
      finishResolution = resolve;
    });
    const pending = resolveRepositoryCandidates(
      ["/workspace/project/.git"],
      async () => resolution,
      "/workspace",
      controller.signal
    );

    controller.abort();
    finishResolution?.({ root: "/workspace/project" });

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("skips candidates whose real path escapes the approved root", async () => {
    const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "difftray-discovery-"));
    const approvedRoot = path.join(temporaryRoot, "workspace");
    const outsideRoot = path.join(temporaryRoot, "outside");
    await mkdir(approvedRoot);
    await mkdir(outsideRoot);
    const escapedPath = path.join(approvedRoot, "project");
    const missingPath = path.join(approvedRoot, "missing");
    await symlink(outsideRoot, escapedPath, "dir");

    const result = await resolveRepositoryCandidates(
      [path.join(escapedPath, ".git"), path.join(missingPath, ".git")],
      async (markerPath) => ({
        root: markerPath.startsWith(escapedPath) ? escapedPath : missingPath
      }),
      approvedRoot
    );

    expect(result).toEqual([]);
  });

  it("persists the canonical path for candidates found through a symlink", async () => {
    const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "difftray-discovery-"));
    const approvedRoot = path.join(temporaryRoot, "workspace");
    const repositoryRoot = path.join(approvedRoot, "project");
    const aliasRoot = path.join(approvedRoot, "project-alias");
    await mkdir(approvedRoot);
    await mkdir(repositoryRoot);
    await symlink(repositoryRoot, aliasRoot, "dir");

    const result = await resolveRepositoryCandidates(
      [path.join(aliasRoot, ".git")],
      async () => ({ root: aliasRoot }),
      approvedRoot
    );

    expect(result).toEqual([
      { name: path.basename(repositoryRoot), path: await realpath(repositoryRoot) }
    ]);
  });
});
