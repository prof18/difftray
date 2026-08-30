import type { MenuItemConstructorOptions } from "electron";

export type ApplicationCommand =
  | "file-show-in-finder"
  | "open-settings"
  | "repository-close"
  | "repository-forget"
  | "repository-refresh"
  | "repository-show-in-finder"
  | "repository-worktrees"
  | "view-split-diff"
  | "view-toggle-file-list"
  | "view-toggle-wrap-lines"
  | "view-unified-diff";

export type ApplicationCommandHandler = (command: ApplicationCommand) => void;

export function selectedFileMenuItemOptions(
  onCommand: ApplicationCommandHandler,
  enabled = false
): MenuItemConstructorOptions {
  return {
    click: () => onCommand("file-show-in-finder"),
    enabled,
    id: "file-show-in-finder",
    label: "Show Selected File in Finder"
  };
}

export function settingsMenuItemOptions(
  onCommand: ApplicationCommandHandler
): MenuItemConstructorOptions {
  return {
    accelerator: "CommandOrControl+,",
    click: () => onCommand("open-settings"),
    id: "settings",
    label: "Settings…"
  };
}

export function repositoryMenuItemOptions(
  onCommand: ApplicationCommandHandler
): readonly MenuItemConstructorOptions[] {
  return [
    {
      click: () => onCommand("repository-refresh"),
      id: "repository-refresh",
      label: "Refresh"
    },
    {
      click: () => onCommand("repository-worktrees"),
      id: "repository-worktrees",
      label: "Worktrees…"
    },
    {
      click: () => onCommand("repository-show-in-finder"),
      id: "repository-show-in-finder",
      label: "Show in Finder"
    },
    { type: "separator" },
    {
      click: () => onCommand("repository-close"),
      id: "repository-close",
      label: "Close Repository"
    },
    {
      click: () => onCommand("repository-forget"),
      id: "repository-forget",
      label: "Forget Repository…"
    }
  ];
}

export function reviewViewMenuItemOptions(
  onCommand: ApplicationCommandHandler
): readonly MenuItemConstructorOptions[] {
  return [
    {
      accelerator: "CommandOrControl+1",
      click: () => onCommand("view-toggle-file-list"),
      label: "Toggle File List"
    },
    { type: "separator" },
    {
      click: () => onCommand("view-split-diff"),
      label: "Use Split Diff"
    },
    {
      click: () => onCommand("view-unified-diff"),
      label: "Use Unified Diff"
    },
    {
      click: () => onCommand("view-toggle-wrap-lines"),
      label: "Toggle Wrap Long Lines"
    }
  ];
}

export function viewMenuItemOptions(input: {
  readonly developerToolsEnabled: boolean;
}): readonly MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = [];

  if (input.developerToolsEnabled) {
    items.push(
      { role: "reload" },
      { role: "forceReload" },
      { role: "toggleDevTools" },
      { type: "separator" }
    );
  }

  items.push({ role: "togglefullscreen" });

  return items;
}
