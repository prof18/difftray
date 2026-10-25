/** Runs `onAdded` with the approved folder's path; a cancelled dialog does nothing. */
export async function addRepositorySearchRootThen(
  addRepositorySearchRoot: () => Promise<string | null>,
  onAdded: (folderPath: string) => void
): Promise<void> {
  const folderPath = await addRepositorySearchRoot();
  if (folderPath) {
    onAdded(folderPath);
  }
}

/**
 * "Scan a folder…" from anywhere: approve a folder, then show the repository
 * picker scoped to that folder, which says it is scanning and then lists what the
 * scan found there. Without it the scan ran unseen and the click looked dead.
 */
export async function scanFolderForRepositories({
  addRepositorySearchRoot,
  onError,
  openRepositoryPicker
}: {
  readonly addRepositorySearchRoot: () => Promise<string | null>;
  readonly onError: (error: unknown) => void;
  readonly openRepositoryPicker: (folderPath: string) => void;
}): Promise<void> {
  try {
    await addRepositorySearchRootThen(addRepositorySearchRoot, openRepositoryPicker);
  } catch (caughtError: unknown) {
    onError(caughtError);
  }
}
