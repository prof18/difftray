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

  it("parses worktree label set and reset with an exact repository", () => {
    expect(
      parseCliArguments(
        ["worktree", "label", "set", "--repo", "/work/my repo", "--label", "Café 🚀 fix"],
        "/elsewhere"
      )
    ).toEqual({
      kind: "worktree.label.set",
      label: "Café 🚀 fix",
      repoPath: "/work/my repo",
      json: false
    });
    expect(
      parseCliArguments(
        ["worktree", "label", "reset", "--repo", "agent", "--json"],
        "/work"
      )
    ).toEqual({
      kind: "worktree.label.set",
      label: null,
      repoPath: "/work/agent",
      json: true
    });
  });

  it("requires --repo and --label for worktree labels", () => {
    expect(() => parseCliArguments(["worktree", "label", "set", "--label", "x"])).toThrow(
      /--repo is required/
    );
    expect(() => parseCliArguments(["worktree", "label", "set", "--repo", "/r"])).toThrow(
      /--label is required/
    );
    expect(() => parseCliArguments(["worktree", "label", "reset"])).toThrow(
      /--repo is required/
    );
  });

  it("rejects unknown, duplicate and review options for worktree labels", () => {
    const set = ["worktree", "label", "set", "--repo", "/r", "--label", "x"];
    expect(() => parseCliArguments([...set, "--target", "selected"])).toThrow(
      CliUsageError
    );
    expect(() => parseCliArguments([...set, "--context", contextId])).toThrow(
      CliUsageError
    );
    expect(() => parseCliArguments([...set, "--repo", "/other"])).toThrow(
      /may only be supplied once/
    );
    expect(() =>
      parseCliArguments(["worktree", "label", "reset", "--repo", "/r", "--label", "x"])
    ).toThrow(CliUsageError);
    expect(() => parseCliArguments([...set, "extra"])).toThrow(CliUsageError);
    expect(() => parseCliArguments(["worktree", "label", "rename"])).toThrow(
      CliUsageError
    );
    expect(() => parseCliArguments(["worktree", "list"])).toThrow(CliUsageError);
  });

  it("rejects blank and oversized labels before connecting", () => {
    const set = (label: string) =>
      parseCliArguments(["worktree", "label", "set", "--repo", "/r", "--label", label]);
    expect(() => set("   ")).toThrow(CliUsageError);
    expect(() => set("a".repeat(81))).toThrow(CliUsageError);
    expect(set(" spaced ")).toMatchObject({ label: " spaced " });
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
