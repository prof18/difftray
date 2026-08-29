import { describe, expect, it, vi } from "vitest";

import { listCompanionRepositoryCatalog } from "./repository-catalog-service.js";

describe("companion repository catalog", () => {
  it("returns the cached catalog immediately and schedules stale-root refresh", () => {
    const scheduleStaleScans = vi.fn();
    const result = listCompanionRepositoryCatalog({
      listOpenProjects: () => [{ path: "/workspace/open" }],
      listRepositoryCatalog: () => [
        {
          available: true,
          id: "open-id",
          lastSeenAt: "2026-08-27T10:00:00.000Z",
          name: "Open",
          path: "/workspace/open"
        },
        {
          available: true,
          id: "available-id",
          lastSeenAt: "2026-08-27T10:01:00.000Z",
          name: "Available",
          path: "/workspace/available"
        },
        {
          available: false,
          id: "missing-id",
          lastSeenAt: "2026-08-27T10:02:00.000Z",
          name: "Missing",
          path: "/workspace/missing"
        }
      ],
      scheduleStaleScans
    });

    expect(result).toEqual([
      {
        displayPath: "/workspace/open",
        id: "open-id",
        lastSeenAt: "2026-08-27T10:00:00.000Z",
        name: "Open",
        state: "open"
      },
      {
        displayPath: "/workspace/available",
        id: "available-id",
        lastSeenAt: "2026-08-27T10:01:00.000Z",
        name: "Available",
        state: "available"
      }
    ]);
    expect(scheduleStaleScans).toHaveBeenCalledOnce();
  });
});
