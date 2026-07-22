import type { MenuItemConstructorOptions } from "electron";

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
