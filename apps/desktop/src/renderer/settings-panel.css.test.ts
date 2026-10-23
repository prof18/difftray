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
    expect(select).toContain("height: 34px;");
    expect(picker).toContain("height: 34px;");
    expect(select).toContain("border-radius: 8px;");
    expect(picker).toContain("border-radius: 8px;");
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
