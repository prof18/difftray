import { describe, expect, it } from "vitest";
import { CliUsageError, parseCliArguments } from "./commands.js";

const contextId = "ctx_0123456789abcdef0123456789abcdef";

describe("parseCliArguments", () => {
  it("defaults open to cwd and the worktree's current selection", () => {
    expect(parseCliArguments(["open"], "/work/my repo")).toEqual({
      kind: "open",
      repoPath: "/work/my repo",
      selector: { kind: "selected" },
      json: false
    });
    expect(
      parseCliArguments(["open", "--target", "working-tree"], "/work/my repo")
    ).toMatchObject({ selector: { kind: "working-tree" } });
  });

  it("preserves nested paths containing spaces", () => {
    expect(
      parseCliArguments(["open", "nested folder/with spaces"], "/repo root")
    ).toEqual({
      kind: "open",
      repoPath: "/repo root/nested folder/with spaces",
      selector: { kind: "selected" },
      json: false
    });
  });

  it("rejects unknown flags and extra positional arguments", () => {
    expect(() => parseCliArguments(["open", "--mystery"])).toThrow(CliUsageError);
    expect(() => parseCliArguments(["open", "one", "two"])).toThrow(CliUsageError);
  });

  it("requires --base for branch selectors", () => {
    expect(() => parseCliArguments(["open", "--target", "branch"])).toThrow(
      /--base is required/
    );
    expect(
      parseCliArguments(["open", "--target=branch", "--base", "origin/main"])
    ).toMatchObject({ selector: { kind: "branch", base: "origin/main" } });
  });

  it("requires --commit for commit selectors", () => {
    expect(() => parseCliArguments(["open", "--target", "commit"])).toThrow(
      /--commit is required/
    );
    expect(
      parseCliArguments(["review", "inspect", "--target", "commit", "--commit", "abc"])
    ).toMatchObject({ selector: { kind: "commit", commit: "abc" } });
  });

  it("rejects unknown commands without treating them as paths", () => {
    expect(() => parseCliArguments(["opne"])).toThrow(/Unknown command/);
  });

  it("parses review defaults and selected target", () => {
    expect(parseCliArguments(["review", "inspect"], "/repo")).toMatchObject({
      kind: "review.inspect",
      repoPath: "/repo",
      selector: { kind: "selected" }
    });
  });

  it("parses the remaining documented operation arguments", () => {
    expect(
      parseCliArguments(["review", "files", "--context", contextId, "--limit", "8"])
    ).toMatchObject({ kind: "review.files", contextId, limit: 8 });
    expect(
      parseCliArguments(["review", "file", `--context=${contextId}`, "--path", "a b.ts"])
    ).toMatchObject({ kind: "review.file", contextId, path: "a b.ts" });
    expect(
      parseCliArguments([
        "review",
        "feedback",
        "--context",
        contextId,
        "--include-inactive"
      ])
    ).toMatchObject({ kind: "review.feedback", includeInactive: true });
    expect(
      parseCliArguments(["review", "export", "--repo", ".", "--format", "prompt"])
    ).toMatchObject({
      kind: "review.export",
      selector: { kind: "selected" },
      format: "prompt"
    });
    expect(
      parseCliArguments(["feedback", "submit", "--context", contextId, "--input", "-"])
    ).toMatchObject({ kind: "feedback.submit", input: "-" });
  });

  it("parses offline help, version, schema, and doctor commands", () => {
    expect(parseCliArguments(["--help"])).toEqual({ kind: "help" });
    expect(parseCliArguments(["--version", "--json"])).toEqual({
      kind: "version",
      json: true
    });
    expect(parseCliArguments(["schema"])).toEqual({ kind: "schema" });
    expect(
      parseCliArguments(["doctor", "--app", "/Applications/Difftray.app", "--json"])
    ).toEqual({ kind: "doctor", appPath: "/Applications/Difftray.app", json: true });
  });

  it("rejects protocol-invalid contexts, refs, file paths, and cursors offline", () => {
    expect(() => parseCliArguments(["review", "files", "--context", "ctx_bad"])).toThrow(
      /Invalid context ID/
    );
    expect(() =>
      parseCliArguments(["review", "inspect", "--target=branch", "--base=-bad"])
    ).toThrow(/cannot begin with an option prefix/);
    expect(() =>
      parseCliArguments([
        "review",
        "file",
        "--context",
        "ctx_0123456789abcdef0123456789abcdef",
        "--path",
        "../secret"
      ])
    ).toThrow(/Invalid relative path/);
    expect(() =>
      parseCliArguments([
        "review",
        "files",
        "--context",
        "ctx_0123456789abcdef0123456789abcdef",
        "--cursor",
        "bad/cursor"
      ])
    ).toThrow(/Invalid cursor/);
  });
});
