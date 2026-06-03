import { describe, expect, it } from "vitest";

import {
  commandSearchRank,
  filterCommands,
  groupCommands,
  type CommandItem
} from "./command-palette.js";

describe("filterCommands", () => {
  it("filters to file commands in file mode", () => {
    expect(
      filterCommands(
        [
          command("refresh", "action", "Refresh project", "reader-flow"),
          command("file", "file", "App.tsx", "apps/desktop/src/renderer/App.tsx")
        ],
        "files",
        ""
      ).map((item) => item.id)
    ).toEqual(["file"]);
  });

  it("ranks exact, prefix, label, subtext, and hint matches predictably", () => {
    const commands = [
      command("hint", "action", "Toggle file list", "Layout", "reviewed"),
      command("sub", "project", "Reader Flow", "/Users/mg/Workspace/difftray"),
      command("file", "file", "App.tsx", "apps/desktop/src/renderer/App.tsx"),
      command("exact", "action", "App", "Open repository")
    ];

    expect(filterCommands(commands, "all", "app").map((item) => item.id)).toEqual([
      "exact",
      "file"
    ]);
    expect(filterCommands(commands, "all", "workspace").map((item) => item.id)).toEqual([
      "sub"
    ]);
    expect(filterCommands(commands, "all", "reviewed").map((item) => item.id)).toEqual([
      "hint"
    ]);
  });

  it("uses file, project, action as the tie-breaker order", () => {
    const commands = [
      command("action", "action", "Open", "same"),
      command("project", "project", "Open", "same"),
      command("file", "file", "Open", "same")
    ];

    expect(filterCommands(commands, "all", "open").map((item) => item.id)).toEqual([
      "file",
      "project",
      "action"
    ]);
  });
});

describe("groupCommands", () => {
  it("groups commands in project, file, action order and drops empty groups", () => {
    expect(
      groupCommands([
        command("action", "action", "Refresh", "Project"),
        command("file", "file", "App.tsx", "src/App.tsx")
      ]).map((group) => [group.kind, group.items.map((item) => item.id)])
    ).toEqual([
      ["file", ["file"]],
      ["action", ["action"]]
    ]);
  });
});

describe("commandSearchRank", () => {
  it("returns infinity for non-matches", () => {
    expect(
      commandSearchRank(command("missing", "action", "Refresh", "Project"), "settings")
    ).toBe(Number.POSITIVE_INFINITY);
  });
});

function command(
  id: string,
  kind: CommandItem["kind"],
  label: string,
  sub: string,
  hint?: string
): CommandItem {
  return {
    icon: null as unknown as CommandItem["icon"],
    id,
    kind,
    label,
    run: () => undefined,
    sub,
    ...(hint !== undefined ? { hint } : {})
  };
}
