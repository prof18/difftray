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

  it("shows the custom label in place of a linked worktree name", () => {
    expect(
      projectIdentityLabel({
        customLabel: "Checkout rework",
        name: "agent-cli",
        repositoryName: "reader-flow",
        worktreeName: "codex/checkout"
      })
    ).toBe("reader-flow / Checkout rework");
  });

  it("adds the custom label to a labeled main checkout", () => {
    expect(
      projectIdentityLabel({ customLabel: "Release prep", name: "reader-flow" })
    ).toBe("reader-flow / Release prep");
  });

  it("falls back to the project name for a regular repository", () => {
    expect(projectIdentityLabel({ name: "reader-flow" })).toBe("reader-flow");
  });
});
