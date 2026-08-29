import { lstat, opendir, stat } from "node:fs/promises";
import path from "node:path";
import { isMainThread, parentPort, workerData } from "node:worker_threads";

import { shouldTraverseRepositoryDirectory } from "@difftray/core";

export type RepositoryTraversalResult = {
  readonly markerPaths: readonly string[];
  readonly scannedDirectories: number;
  readonly skippedDirectories: number;
};

const progressDirectoryInterval = 100;

export async function traverseRepositoryMarkers(
  rootPath: string,
  onProgress?: (scannedDirectories: number, skippedDirectories: number) => void
): Promise<RepositoryTraversalResult> {
  const rootDevice = (await stat(rootPath)).dev;
  const markerPaths: string[] = [];
  let scannedDirectories = 0;
  let skippedDirectories = 0;
  let lastReportedScannedDirectories = 0;
  let lastReportedSkippedDirectories = 0;

  const reportProgress = (force = false): void => {
    if (!onProgress) return;
    const changed =
      scannedDirectories !== lastReportedScannedDirectories ||
      skippedDirectories !== lastReportedSkippedDirectories;
    if (
      !changed ||
      (!force &&
        scannedDirectories - lastReportedScannedDirectories < progressDirectoryInterval)
    ) {
      return;
    }
    lastReportedScannedDirectories = scannedDirectories;
    lastReportedSkippedDirectories = skippedDirectories;
    onProgress(scannedDirectories, skippedDirectories);
  };

  async function walk(directory: string): Promise<void> {
    let handle;
    try {
      handle = await opendir(directory);
    } catch (error) {
      if (directory !== rootPath && isSkippableDirectoryError(error)) {
        skippedDirectories += 1;
        return;
      }
      throw error;
    }
    scannedDirectories += 1;
    let markerIsDirectory = false;
    let markerExists = false;
    try {
      const marker = await lstat(path.join(directory, ".git"));
      markerExists = true;
      markerIsDirectory = marker.isDirectory();
    } catch (error) {
      if (isMissingMarkerError(error)) {
        // This directory is not a Git boundary, so traversal can continue.
      } else if (isSkippableDirectoryError(error)) {
        await handle.close();
        skippedDirectories += 1;
        reportProgress();
        return;
      } else {
        await handle.close();
        throw error;
      }
    }
    if (markerIsDirectory) {
      await handle.close();
      markerPaths.push(directory);
      reportProgress();
      return;
    }
    if (markerExists) {
      await handle.close();
      reportProgress();
      return;
    }
    try {
      for await (const entry of handle) {
        if (!entry.isDirectory() || !shouldTraverseRepositoryDirectory(entry.name)) {
          continue;
        }
        const childPath = path.join(directory, entry.name);
        try {
          const childStat = await lstat(childPath);
          if (!childStat.isSymbolicLink() && childStat.dev === rootDevice) {
            await walk(childPath);
          }
        } catch (error) {
          if (isSkippableDirectoryError(error)) {
            skippedDirectories += 1;
            continue;
          }
          throw error;
        }
      }
    } catch (error) {
      if (!isSkippableDirectoryError(error)) throw error;
      skippedDirectories += 1;
      reportProgress();
      return;
    }
    reportProgress();
  }

  await walk(rootPath);
  reportProgress(true);
  return { markerPaths, scannedDirectories, skippedDirectories };
}

function isSkippableDirectoryError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    ((error as { readonly code?: unknown }).code === "EACCES" ||
      (error as { readonly code?: unknown }).code === "ENOENT" ||
      (error as { readonly code?: unknown }).code === "ENOTDIR" ||
      (error as { readonly code?: unknown }).code === "EPERM")
  );
}

function isMissingMarkerError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    ((error as { readonly code?: unknown }).code === "ENOENT" ||
      (error as { readonly code?: unknown }).code === "ENOTDIR")
  );
}

if (!isMainThread && parentPort) {
  const port = parentPort;
  const rootPath = (workerData as { readonly rootPath: string }).rootPath;
  void traverseRepositoryMarkers(rootPath, (scannedDirectories, skippedDirectories) => {
    port.postMessage({ kind: "progress", scannedDirectories, skippedDirectories });
  }).then(
    (result) => port.postMessage({ kind: "complete", result }),
    (error: unknown) =>
      port.postMessage({
        kind: "error",
        message: error instanceof Error ? error.message : "Repository scan failed"
      })
  );
}
