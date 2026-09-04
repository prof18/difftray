export function canRunApplicationCommand(
  loadState: "idle" | "loading",
  settingsOpen = false
): boolean {
  return loadState !== "loading" && !settingsOpen;
}

export function runApplicationCommandIfAllowed(
  loadState: "idle" | "loading",
  command: () => void,
  settingsOpen = false
): void {
  if (canRunApplicationCommand(loadState, settingsOpen)) {
    command();
  }
}

export function isSelectedFileActionRequestCurrent(
  request: {
    readonly id: number;
    readonly path: string;
    readonly projectId: string;
  },
  current: {
    readonly activePath: string | undefined;
    readonly activeProjectId: string | undefined;
    readonly latestRequestId: number;
  }
): boolean {
  return (
    request.id === current.latestRequestId &&
    request.path === current.activePath &&
    request.projectId === current.activeProjectId
  );
}

export function isLatestWorktreePathCopyRequest(
  requestId: number,
  latestRequestId: number
): boolean {
  return requestId === latestRequestId;
}

export function invalidateWorktreePathCopyRequest(request: { current: number }): void {
  request.current += 1;
}
