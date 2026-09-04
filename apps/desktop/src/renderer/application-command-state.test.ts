import { describe, expect, it, vi } from "vitest";

import {
  canRunApplicationCommand,
  invalidateWorktreePathCopyRequest,
  isLatestWorktreePathCopyRequest,
  isSelectedFileActionRequestCurrent,
  runApplicationCommandIfAllowed
} from "./application-command-state.js";

describe("application command state", () => {
  it("blocks repository and view commands while a project is loading", () => {
    expect(canRunApplicationCommand("loading")).toBe(false);
    expect(canRunApplicationCommand("idle")).toBe(true);
  });

  it("blocks commands while the settings draft is open", () => {
    expect(canRunApplicationCommand("idle", true)).toBe(false);
    expect(canRunApplicationCommand("loading", true)).toBe(false);
  });

  it("does not invoke a native application command while a project is loading", () => {
    const command = vi.fn();

    runApplicationCommandIfAllowed("loading", command);

    expect(command).not.toHaveBeenCalled();
  });

  it("invokes a native application command when the workspace is idle", () => {
    const command = vi.fn();

    runApplicationCommandIfAllowed("idle", command);

    expect(command).toHaveBeenCalledOnce();
  });

  it("does not invoke a native application command while settings are open", () => {
    const command = vi.fn();

    runApplicationCommandIfAllowed("idle", command, true);

    expect(command).not.toHaveBeenCalled();
  });

  it("accepts only the latest selected-file action for the active project and path", () => {
    const request = {
      id: 4,
      path: "src/App.tsx",
      projectId: "project-1"
    };

    expect(
      isSelectedFileActionRequestCurrent(request, {
        activePath: "src/App.tsx",
        activeProjectId: "project-1",
        latestRequestId: 4
      })
    ).toBe(true);
    expect(
      isSelectedFileActionRequestCurrent(request, {
        activePath: "src/App.tsx",
        activeProjectId: "project-1",
        latestRequestId: 5
      })
    ).toBe(false);
    expect(
      isSelectedFileActionRequestCurrent(request, {
        activePath: "src/Other.tsx",
        activeProjectId: "project-1",
        latestRequestId: 4
      })
    ).toBe(false);
    expect(
      isSelectedFileActionRequestCurrent(request, {
        activePath: "src/App.tsx",
        activeProjectId: "project-2",
        latestRequestId: 4
      })
    ).toBe(false);
  });

  it("accepts only the latest worktree-path copy completion", () => {
    expect(isLatestWorktreePathCopyRequest(3, 3)).toBe(true);
    expect(isLatestWorktreePathCopyRequest(2, 3)).toBe(false);
  });

  it("invalidates a pending worktree-path copy when its picker closes", () => {
    const request = { current: 3 };

    invalidateWorktreePathCopyRequest(request);

    expect(isLatestWorktreePathCopyRequest(3, request.current)).toBe(false);
  });
});
