import type { JSX } from "react";

export type PaletteMode = "all" | "files";
export type CommandKind = "action" | "file" | "project";

export type CommandItem = {
  readonly id: string;
  readonly hint?: string;
  readonly icon: JSX.Element;
  readonly kind: CommandKind;
  readonly label: string;
  readonly run: () => void;
  readonly shortcut?: string;
  readonly sub: string;
  /** Shorter text to draw instead of `sub`; search still matches the full `sub`. */
  readonly subLabel?: string;
};

export type CommandGroup = {
  readonly items: readonly CommandItem[];
  readonly kind: CommandKind;
};

export function groupCommands(commands: readonly CommandItem[]): readonly CommandGroup[] {
  return (["project", "file", "action"] as const)
    .map((kind) => ({
      items: commands.filter((command) => command.kind === kind),
      kind
    }))
    .filter((group) => group.items.length > 0);
}

export function filterCommands(
  commands: readonly CommandItem[],
  mode: PaletteMode,
  query: string
): readonly CommandItem[] {
  const normalizedQuery = query.trim().toLowerCase();
  const modeCommands =
    mode === "files" ? commands.filter((command) => command.kind === "file") : commands;

  if (normalizedQuery.length === 0) {
    return inDisplayOrder(modeCommands);
  }

  const ranked = modeCommands
    .map((command) => ({
      command,
      rank: commandSearchRank(command, normalizedQuery)
    }))
    .filter((result) => Number.isFinite(result.rank))
    .sort(
      (left, right) =>
        left.rank - right.rank ||
        commandKindSearchWeight(left.command.kind) -
          commandKindSearchWeight(right.command.kind) ||
        left.command.label.localeCompare(right.command.label)
    )
    .map((result) => result.command);

  return inDisplayOrder(ranked);
}

/**
 * The palette draws commands grouped by kind, so the list the selected index and
 * Enter work on must be in that same order, or the highlighted row and the command
 * that runs drift apart from what is on screen.
 */
function inDisplayOrder(commands: readonly CommandItem[]): readonly CommandItem[] {
  return groupCommands(commands).flatMap((group) => group.items);
}

export function commandSearchRank(command: CommandItem, query: string): number {
  const label = command.label.toLowerCase();
  const sub = command.sub.toLowerCase();
  const hint = command.hint?.toLowerCase() ?? "";

  if (label === query) {
    return 0;
  }

  if (label.startsWith(query)) {
    return 1;
  }

  if (label.includes(query)) {
    return 2;
  }

  if (sub.startsWith(query)) {
    return 10;
  }

  if (sub.includes(query)) {
    return 11;
  }

  if (hint.includes(query)) {
    return 20;
  }

  return Number.POSITIVE_INFINITY;
}

function commandKindSearchWeight(kind: CommandKind): number {
  switch (kind) {
    case "file":
      return 0;
    case "project":
      return 1;
    case "action":
      return 2;
  }
}
