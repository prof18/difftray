import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CommandPalette } from "./command-palette-view.js";
import { type CommandItem } from "./command-palette.js";

describe("CommandPalette view", () => {
  it("renders grouped commands, selected item state, shortcuts, and all scope", () => {
    const html = renderToStaticMarkup(
      <CommandPalette
        commands={[
          command({
            id: "project",
            kind: "project",
            label: "Difftray",
            sub: "/repo/difftray",
            subLabel: "/repo/…/difftray"
          }),
          command({
            hint: "⌘R",
            id: "refresh",
            kind: "action",
            label: "Refresh",
            shortcut: "R",
            sub: "Reload repository"
          }),
          command({
            id: "file",
            kind: "file",
            label: "App.tsx",
            sub: "apps/desktop/src/renderer"
          })
        ]}
        inputRef={createRef<HTMLInputElement>()}
        mode="all"
        onClose={vi.fn()}
        onQueryChange={vi.fn()}
        query="app"
        selectedIndex={2}
        setSelectedIndex={vi.fn()}
      />
    );

    expect(html).toContain('aria-label="Command palette"');
    expect(html).toContain("/repo/…/difftray");
    expect(html).not.toContain(">/repo/difftray<");
    expect(html).toContain('value="app"');
    expect(html).toContain(">All</span>");
    expect(html).toContain("project");
    expect(html).toContain("file");
    expect(html).toContain("action");
    expect(html).toContain("Difftray");
    expect(html).toContain("App.tsx");
    expect(html).toContain("Refresh");
    expect(html).toContain("Reload repository");
    expect(html).toContain('data-selected="true"');
    // Every footer shortcut says what it does; ⌘K alone gave no hint.
    expect(html).toContain("⌘K all");
    expect(html).toContain("⌘P files only");
  });

  // Action icons used the warning amber, a colour that means "needs attention"
  // everywhere else in the app.
  it("draws action icons on a neutral tile, not the warning colour", () => {
    const css = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "command-palette-view.module.css"),
      "utf8"
    );
    const actionRule = css.slice(
      css.indexOf('.paletteItem[data-kind="action"] .paletteItemIcon {'),
      css.indexOf("}", css.indexOf('.paletteItem[data-kind="action"] .paletteItemIcon {'))
    );

    expect(actionRule).not.toContain("--warn");
  });

  it("renders files scope when opened in file mode", () => {
    const html = renderToStaticMarkup(
      <CommandPalette
        commands={[command({ id: "file", kind: "file", label: "App.tsx" })]}
        inputRef={createRef<HTMLInputElement>()}
        mode="files"
        onClose={vi.fn()}
        onQueryChange={vi.fn()}
        query=""
        selectedIndex={0}
        setSelectedIndex={vi.fn()}
      />
    );

    expect(html).toContain(">Files</span>");
    expect(html).toContain("Search projects, files, and actions");
  });
});

function command(input: Partial<CommandItem>): CommandItem {
  return {
    icon: <span aria-hidden>*</span>,
    id: "command",
    kind: "action",
    label: "Command",
    run: vi.fn(),
    sub: "Command subtitle",
    ...input
  };
}
