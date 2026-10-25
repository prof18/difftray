import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "settings-panel.module.css"),
  "utf8"
);

function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Missing rule ${selector}`);
  return css.slice(start, css.indexOf("}", start));
}

describe("settings panel css", () => {
  // The Appearance select sat beside the custom editor picker on the same page but
  // looked like a different control (shorter, native chevron).
  it("draws the native select like the editor picker", () => {
    const select = rule(".settingRow select");
    const picker = rule(".editorPickerButton");

    expect(select).toContain("appearance: none;");
    expect(select).toContain("height: 32px;");
    expect(picker).toContain("height: 32px;");
    expect(select).toContain("border-radius: 6px;");
    expect(picker).toContain("border-radius: 6px;");
  });

  // Each section drew a full-width rule above and below its rows plus one under
  // every row, so a page of three settings showed six lines. Sections are now one
  // rounded panel each, with dividers only between rows inside it.
  it("groups each section's rows in one rounded panel", () => {
    const card = rule(".settingsCard");
    expect(card).toContain("border: 1px solid var(--border);");
    expect(card).toContain("border-radius: 8px;");
    expect(card).not.toContain("border-top:");
    expect(card).not.toContain("border-bottom:");
    expect(rule(".settingRow:last-child")).toContain("border-bottom: 0;");
  });

  // Check for updates was 28px tall beside 32px pickers in the same column.
  it("draws settings buttons at the pickers' height", () => {
    expect(rule(".settingsCard .secondaryButton")).toContain("height: 32px;");
    // The remove-folder icon button stays square at the new height.
    expect(rule(".secondaryButton.repositoryRootIconButton")).toContain("width: 32px;");
  });

  // The companion switch sat on the title line while Approved folders, the other
  // row with a description, centres its button on the whole row.
  it("centres the companion switch on its row like the other settings rows", () => {
    expect(rule(".companionIntro")).toContain("align-items: center;");
    expect(rule(".settingRow")).toContain("align-items: center;");
  });

  // Rows with a description (Companion mode, Approved folders) used bold titles,
  // unlike every other settings row.
  it("gives described rows the same title weight as plain rows", () => {
    for (const selector of [".companionTitle", ".repositoryRootTitle"]) {
      expect(rule(selector)).toContain("font-weight: 400;");
      expect(rule(selector)).toContain("font-size: 12.5px;");
      expect(rule(selector)).toContain("color: var(--text-2);");
    }
  });
});
