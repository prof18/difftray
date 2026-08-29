import path from "node:path";

import {
  repositoryDiscoveryVersion,
  type RepositorySearchRootRecord
} from "@difftray/storage";

export function isSafeRepositorySearchRootSuggestion(candidatePath: string): boolean {
  const normalized = path.normalize(candidatePath);
  return normalized !== path.parse(normalized).root;
}

export function shouldRefreshRepositorySearchRoot(
  root: RepositorySearchRootRecord,
  staleBefore: number
): boolean {
  if (!root.enabled) return false;

  // A root with no recorded scan timestamps has never been scanned and needs
  // its first discovery even when its discovery version already matches the
  // current one. A completion without a start is legacy data and is handled as
  // a previously completed scan below.
  if (root.lastScanStartedAt === undefined && root.lastScanCompletedAt === undefined) {
    return true;
  }

  // Renderer callbacks can observe a scan after it has started but before it
  // completes (or after it was cancelled). Do not immediately start another
  // scan from that incomplete state; an explicit refresh can retry it.
  if (
    root.lastScanCompletedAt === undefined ||
    (root.lastScanStartedAt !== undefined &&
      Date.parse(root.lastScanStartedAt) > Date.parse(root.lastScanCompletedAt))
  ) {
    // A failed scan records its error without a completion timestamp. Treat
    // that as retryable only after the same stale/backoff threshold used for
    // completed scans. Active and cancelled scans have no error and remain
    // non-retryable until an explicit refresh is requested.
    return (
      root.lastScanError !== undefined &&
      root.lastScanStartedAt !== undefined &&
      Date.parse(root.lastScanStartedAt) < staleBefore
    );
  }

  return (
    root.discoveryVersion < repositoryDiscoveryVersion ||
    Date.parse(root.lastScanCompletedAt) < staleBefore
  );
}
