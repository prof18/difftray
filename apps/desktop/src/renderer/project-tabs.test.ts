import { describe, expect, it } from "vitest";

import { mergeProjectTabs, reorderProjectTabs } from "./project-tabs.js";

describe("mergeProjectTabs", () => {
  it("keeps the storage order for the initial tab list", () => {
    expect(mergeProjectTabs([], [project("newest"), project("older")])).toEqual([
      project("newest"),
      project("older")
    ]);
  });

  it("appends newly opened projects instead of moving them to the front", () => {
    expect(
      mergeProjectTabs(
        [project("reader-flow"), project("difftray")],
        [project("new-repo"), project("difftray"), project("reader-flow")]
      )
    ).toEqual([project("reader-flow"), project("difftray"), project("new-repo")]);
  });

  it("removes closed projects while preserving the remaining tab order", () => {
    expect(
      mergeProjectTabs(
        [project("reader-flow"), project("difftray"), project("new-repo")],
        [project("new-repo"), project("reader-flow")]
      )
    ).toEqual([project("reader-flow"), project("new-repo")]);
  });
});

describe("reorderProjectTabs", () => {
  it("moves a dragged project before the target project", () => {
    expect(
      reorderProjectTabs(
        [project("reader-flow"), project("difftray"), project("new-repo")],
        "new-repo",
        "reader-flow",
        "before"
      )
    ).toEqual([project("new-repo"), project("reader-flow"), project("difftray")]);
  });

  it("moves a dragged project after the target project", () => {
    expect(
      reorderProjectTabs(
        [project("reader-flow"), project("difftray"), project("new-repo")],
        "reader-flow",
        "new-repo",
        "after"
      )
    ).toEqual([project("difftray"), project("new-repo"), project("reader-flow")]);
  });

  it("leaves the order unchanged for invalid drag targets", () => {
    const projects = [project("reader-flow"), project("difftray")];

    expect(reorderProjectTabs(projects, "missing", "difftray", "before")).toBe(projects);
    expect(reorderProjectTabs(projects, "reader-flow", "missing", "after")).toBe(
      projects
    );
  });
});

function project(id: string) {
  return { id };
}
