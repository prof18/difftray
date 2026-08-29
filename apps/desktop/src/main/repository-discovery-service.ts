import { realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

import { isPathInsideApprovedRoot } from "@difftray/core";
import type { RepositoryCatalogCandidate } from "@difftray/storage";

import type { RepositoryTraversalResult } from "./repository-discovery-worker.js";

export type RepositoryDiscoveryResult = {
  readonly candidates: readonly RepositoryCatalogCandidate[];
  readonly scannedDirectories: number;
  readonly skippedDirectories: number;
};

export async function discoverRepositories(input: {
  readonly findRepository: (
    markerPath: string
  ) => Promise<{ readonly root: string } | null>;
  readonly onProgress?: (progress: {
    readonly scannedDirectories: number;
    readonly skippedDirectories: number;
  }) => void;
  readonly rootPath: string;
  readonly signal?: AbortSignal;
}): Promise<RepositoryDiscoveryResult> {
  const traversal = await runTraversalWorker(input);
  const candidates = await resolveRepositoryCandidates(
    traversal.markerPaths,
    input.findRepository,
    input.rootPath,
    input.signal
  );
  return { ...traversal, candidates };
}

export async function resolveRepositoryCandidates(
  markerPaths: readonly string[],
  findRepository: (markerPath: string) => Promise<{ readonly root: string } | null>,
  approvedRootPath: string,
  signal?: AbortSignal
): Promise<readonly RepositoryCatalogCandidate[]> {
  let approvedRoot: string | undefined;
  try {
    approvedRoot = await realpath(approvedRootPath);
  } catch {
    approvedRoot = undefined;
  }

  const candidates = new Map<string, RepositoryCatalogCandidate>();
  for (let index = 0; index < markerPaths.length; index += 8) {
    if (signal?.aborted) throw abortError();
    const repositories = await Promise.all(
      markerPaths.slice(index, index + 8).map((markerPath) => findRepository(markerPath))
    );
    if (signal?.aborted) throw abortError();
    for (const repository of repositories) {
      if (!repository) continue;
      let resolvedRepositoryRoot: string;
      try {
        resolvedRepositoryRoot = await realpath(repository.root);
      } catch {
        continue;
      }
      if (
        !approvedRoot ||
        !isPathInsideApprovedRoot(approvedRoot, resolvedRepositoryRoot)
      ) {
        continue;
      }
      candidates.set(resolvedRepositoryRoot, {
        name: path.basename(resolvedRepositoryRoot),
        path: resolvedRepositoryRoot
      });
    }
  }
  return [...candidates.values()];
}

export function isRepositoryScanAbort(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function runTraversalWorker(input: {
  readonly onProgress?: (progress: {
    readonly scannedDirectories: number;
    readonly skippedDirectories: number;
  }) => void;
  readonly rootPath: string;
  readonly signal?: AbortSignal;
}): Promise<RepositoryTraversalResult> {
  return new Promise((resolve, reject) => {
    const workerUrl = new URL("./repository-discovery-worker.cjs", import.meta.url);
    const worker = new Worker(fileURLToPath(workerUrl), {
      workerData: { rootPath: input.rootPath }
    });
    let settled = false;
    const finalize = (action: () => void) => {
      if (settled) return;
      settled = true;
      input.signal?.removeEventListener("abort", abort);
      worker.removeAllListeners();
      void worker.terminate();
      action();
    };
    const abort = () => {
      finalize(() => reject(abortError()));
    };
    if (input.signal?.aborted) {
      abort();
      return;
    }
    input.signal?.addEventListener("abort", abort, { once: true });
    worker.on("message", (message: unknown) => {
      if (!isWorkerMessage(message)) return;
      if (message.kind === "progress") {
        input.onProgress?.({
          scannedDirectories: message.scannedDirectories,
          skippedDirectories: message.skippedDirectories
        });
      } else if (message.kind === "complete") {
        finalize(() => resolve(message.result));
      } else {
        finalize(() => reject(new Error(message.message)));
      }
    });
    worker.on("error", (error) => {
      finalize(() => reject(error));
    });
    worker.on("exit", (code) => {
      finalize(() =>
        reject(
          new Error(`Repository scan worker exited before completion: ${String(code)}`)
        )
      );
    });
  });
}

type WorkerMessage =
  | { readonly kind: "complete"; readonly result: RepositoryTraversalResult }
  | { readonly kind: "error"; readonly message: string }
  | {
      readonly kind: "progress";
      readonly scannedDirectories: number;
      readonly skippedDirectories: number;
    };

function isWorkerMessage(input: unknown): input is WorkerMessage {
  return typeof input === "object" && input !== null && "kind" in input;
}

function abortError(): DOMException {
  return new DOMException("Repository scan cancelled", "AbortError");
}
