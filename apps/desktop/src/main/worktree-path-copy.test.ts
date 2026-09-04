import { describe, expect, it, vi } from "vitest";

import { createWorktreePathCopyHandler } from "./worktree-path-copy.js";

describe("worktree path copy", () => {
  it("does not let an older delayed request overwrite the latest copied path", async () => {
    const resolvers = new Map<string, (path: string) => void>();
    const writeText = vi.fn();
    const copyWorktreePath = createWorktreePathCopyHandler({
      resolvePath: async (_projectId, worktreeId) =>
        new Promise<string>((resolve) => {
          resolvers.set(worktreeId, resolve);
        }),
      writeText
    });
    const sender = {};

    const older = copyWorktreePath(sender, "project", "older");
    const latest = copyWorktreePath(sender, "project", "latest");
    resolvers.get("latest")?.("/workspace/latest");
    await latest;
    resolvers.get("older")?.("/workspace/older");
    await older;

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("/workspace/latest");
  });
});
