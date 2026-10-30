import { describe, expect, it } from "vitest";

import {
  fileFilterForScope,
  fileFilterScope,
  filterFilesByQuery
} from "./file-list-filter.js";

const files = [
  { path: "apps/desktop/src/renderer/file-list.tsx" },
  { path: "apps/desktop/src/renderer/App.tsx" },
  { path: "packages/core/src/index.ts" },
  { path: "README.md" }
];

describe("filterFilesByQuery", () => {
  it("returns the same list for an empty or blank query", () => {
    expect(filterFilesByQuery(files, "")).toBe(files);
    expect(filterFilesByQuery(files, "   ")).toBe(files);
  });

  it("matches anywhere in the path, ignoring case", () => {
    expect(filterFilesByQuery(files, "APP").map((file) => file.path)).toEqual([
      "apps/desktop/src/renderer/file-list.tsx",
      "apps/desktop/src/renderer/App.tsx"
    ]);
    expect(filterFilesByQuery(files, "readme").map((file) => file.path)).toEqual([
      "README.md"
    ]);
  });

  it("matches a folder prefix", () => {
    expect(filterFilesByQuery(files, "packages/").map((file) => file.path)).toEqual([
      "packages/core/src/index.ts"
    ]);
  });

  it("requires every space-separated term to match, in any order", () => {
    expect(filterFilesByQuery(files, "list renderer").map((file) => file.path)).toEqual([
      "apps/desktop/src/renderer/file-list.tsx"
    ]);
    expect(filterFilesByQuery(files, "core list")).toEqual([]);
  });

  it("keeps the original file order", () => {
    expect(filterFilesByQuery(files, ".ts").map((file) => file.path)).toEqual([
      "apps/desktop/src/renderer/file-list.tsx",
      "apps/desktop/src/renderer/App.tsx",
      "packages/core/src/index.ts"
    ]);
  });
});

describe("fileFilterScope", () => {
  it("changes with the project and the review target", () => {
    const workingTree = fileFilterScope("project-1", { kind: "working_tree" });

    expect(fileFilterScope("project-1", { kind: "working_tree" })).toBe(workingTree);
    expect(fileFilterScope("project-2", { kind: "working_tree" })).not.toBe(workingTree);
    expect(
      fileFilterScope("project-1", { baseRefName: "main", kind: "branch" })
    ).not.toBe(fileFilterScope("project-1", { baseRefName: "develop", kind: "branch" }));
    expect(fileFilterScope("project-1", { commitSha: "abc", kind: "commit" })).not.toBe(
      fileFilterScope("project-1", { commitSha: "def", kind: "commit" })
    );
  });
});

describe("fileFilterForScope", () => {
  it("keeps a filter typed for the current scope", () => {
    const filter = { query: "list", scope: "a" };

    expect(fileFilterForScope(filter, "a")).toBe(filter);
  });

  it("drops a filter for another scope so it does not return later", () => {
    const filter = { query: "list", scope: "a" };

    expect(fileFilterForScope(filter, "b")).toEqual({ query: "", scope: "b" });
  });

  it("keeps an empty filter without creating a new state object", () => {
    const filter = { query: "", scope: "a" };

    expect(fileFilterForScope(filter, "b")).toBe(filter);
  });
});
