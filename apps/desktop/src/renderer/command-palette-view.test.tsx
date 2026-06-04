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
            sub: "/repo/difftray"
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
    expect(html).toContain("⌘K");
    expect(html).toContain("⌘P files only");
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
