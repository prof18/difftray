import { describe, expect, it } from "vitest";

import { projectIdentityLabel } from "./project-identity.js";

describe("projectIdentityLabel", () => {
  it("distinguishes a linked worktree from its repository", () => {
    expect(
      projectIdentityLabel({
        name: "agent-cli",
        repositoryName: "reader-flow",
        worktreeName: "agent-cli"
      })
    ).toBe("reader-flow / agent-cli");
  });

  it("falls back to the project name for a regular repository", () => {
    expect(projectIdentityLabel({ name: "reader-flow" })).toBe("reader-flow");
  });
});
