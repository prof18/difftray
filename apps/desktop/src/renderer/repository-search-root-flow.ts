export async function addRepositorySearchRootThen(
  addRepositorySearchRoot: () => Promise<boolean>,
  onAdded: () => void
): Promise<void> {
  if (await addRepositorySearchRoot()) {
    onAdded();
  }
}

/**
 * "Scan a folder…" from the menu or the empty window: approve a folder, then show
 * the repository picker, where the scan's repositories appear as it finds them.
 * Without the picker the scan runs unseen and the click looks like it did nothing.
 */
export async function scanFolderForRepositories({
  addRepositorySearchRoot,
  onError,
  openRepositoryPicker
}: {
  readonly addRepositorySearchRoot: () => Promise<boolean>;
  readonly onError: (error: unknown) => void;
  readonly openRepositoryPicker: () => void;
}): Promise<void> {
  try {
    await addRepositorySearchRootThen(addRepositorySearchRoot, openRepositoryPicker);
  } catch (caughtError: unknown) {
    onError(caughtError);
  }
}
