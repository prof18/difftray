import path from "node:path";
import { describe, expect, it } from "vitest";
import type { RepositorySearchRootRecord } from "@difftray/storage";

import {
  isSafeRepositorySearchRootSuggestion,
  shouldRefreshRepositorySearchRoot
} from "./repository-scan-policy.js";

describe("repository search root refresh policy", () => {
  const staleBefore = Date.parse("2026-08-27T12:00:00.000Z");

  it("refreshes roots cached with an older discovery policy", () => {
    expect(
      shouldRefreshRepositorySearchRoot(
        root({
          discoveryVersion: 1,
          lastScanCompletedAt: "2026-08-27T13:00:00.000Z"
        }),
        staleBefore
      )
    ).toBe(true);
  });

  it("refreshes a root that has never started scanning", () => {
    expect(
      shouldRefreshRepositorySearchRoot(root({ discoveryVersion: 2 }), staleBefore)
    ).toBe(true);
  });

  it("does not restart an unfinished scan with stale discovery metadata", () => {
    expect(
      shouldRefreshRepositorySearchRoot(
        root({
          discoveryVersion: 1,
          lastScanStartedAt: "2026-08-27T13:00:00.000Z",
          lastScanCompletedAt: "2026-08-27T11:00:00.000Z"
        }),
        staleBefore
      )
    ).toBe(false);
  });

  it("retries an old failed unfinished scan after the backoff threshold", () => {
    expect(
      shouldRefreshRepositorySearchRoot(
        root({
          discoveryVersion: 1,
          lastScanError: "permission denied",
          lastScanStartedAt: "2026-08-27T11:00:00.000Z",
          lastScanCompletedAt: "2026-08-27T10:00:00.000Z"
        }),
        staleBefore
      )
    ).toBe(true);
    expect(
      shouldRefreshRepositorySearchRoot(
        root({
          lastScanError: "permission denied",
          lastScanStartedAt: "2026-08-27T13:00:00.000Z"
        }),
        staleBefore
      )
    ).toBe(false);
  });

  it("does not automatically retry recent failed, active, or cancelled scans", () => {
    expect(
      shouldRefreshRepositorySearchRoot(
        root({
          lastScanError: "permission denied",
          lastScanStartedAt: "2026-08-27T13:00:00.000Z",
          lastScanCompletedAt: "2026-08-27T11:00:00.000Z"
        }),
        staleBefore
      )
    ).toBe(false);
    expect(
      shouldRefreshRepositorySearchRoot(
        root({ lastScanStartedAt: "2026-08-27T11:00:00.000Z" }),
        staleBefore
      )
    ).toBe(false);
    expect(
      shouldRefreshRepositorySearchRoot(
        root({ lastScanStartedAt: "2026-08-27T11:00:00.000Z" }),
        staleBefore
      )
    ).toBe(false);
  });

  it("does not restart an interrupted scan that has no completion", () => {
    expect(
      shouldRefreshRepositorySearchRoot(
        root({
          lastScanStartedAt: "2026-08-27T13:00:00.000Z"
        }),
        staleBefore
      )
    ).toBe(false);
  });

  it("refreshes stale roots but leaves current fresh roots alone", () => {
    expect(
      shouldRefreshRepositorySearchRoot(
        root({ lastScanCompletedAt: "2026-08-27T11:00:00.000Z" }),
        staleBefore
      )
    ).toBe(true);
    expect(
      shouldRefreshRepositorySearchRoot(
        root({ lastScanCompletedAt: "2026-08-27T13:00:00.000Z" }),
        staleBefore
      )
    ).toBe(false);
  });

  it("never suggests scanning an entire filesystem root", () => {
    expect(isSafeRepositorySearchRootSuggestion(path.parse(process.cwd()).root)).toBe(
      false
    );
    expect(
      isSafeRepositorySearchRootSuggestion(path.join(process.cwd(), "projects"))
    ).toBe(true);
  });
});

function root(
  overrides: Partial<RepositorySearchRootRecord>
): RepositorySearchRootRecord {
  return {
    discoveryVersion: 2,
    enabled: true,
    id: "workspace",
    path: "/workspace",
    ...overrides
  };
}
