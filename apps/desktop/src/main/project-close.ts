export type CloseProjectOperation = {
  readonly closeProjectTab: () => void;
  readonly isProjectOpen: () => boolean;
  readonly isShuttingDown: () => boolean;
  readonly onProjectClosed: () => void;
  readonly onWatcherStopError: (error: unknown) => void;
  readonly stopProjectWatcher: () => Promise<void>;
};

export async function closeProjectIfOpen(
  operation: CloseProjectOperation
): Promise<boolean> {
  if (operation.isShuttingDown() || !operation.isProjectOpen()) {
    return false;
  }

  operation.closeProjectTab();
  try {
    await operation.stopProjectWatcher();
  } catch (caughtError) {
    operation.onWatcherStopError(caughtError);
  }

  if (!operation.isShuttingDown() && !operation.isProjectOpen()) {
    operation.onProjectClosed();
  }

  return true;
}
