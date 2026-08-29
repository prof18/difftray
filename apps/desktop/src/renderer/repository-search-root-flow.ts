export async function addRepositorySearchRootThen(
  addRepositorySearchRoot: () => Promise<boolean>,
  onAdded: () => void
): Promise<void> {
  if (await addRepositorySearchRoot()) {
    onAdded();
  }
}
