export type WorktreePathCopyDependencies = {
  readonly resolvePath: (projectId: string, worktreeId: string) => Promise<string>;
  readonly writeText: (path: string) => void;
};

export function createWorktreePathCopyHandler({
  resolvePath,
  writeText
}: WorktreePathCopyDependencies): (
  sender: object,
  projectId: string,
  worktreeId: string
) => Promise<void> {
  const latestRequestBySender = new WeakMap<object, number>();
  let nextRequestId = 0;

  return async (sender, projectId, worktreeId) => {
    const requestId = ++nextRequestId;
    latestRequestBySender.set(sender, requestId);
    const worktreePath = await resolvePath(projectId, worktreeId);

    if (latestRequestBySender.get(sender) !== requestId) return;

    writeText(worktreePath);
  };
}
