import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "app-status-views.module.css"),
  "utf8"
);

function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Missing rule ${selector}`);
  return css.slice(start, css.indexOf("}", start));
}

describe("app status views css", () => {
  // Open Repository and Scan a folder stacked with no gap between them and the
  // drop hint pressed against the second button.
  it("lays the empty-state actions out as one spaced row", () => {
    expect(rule(".emptyActions")).toContain(
      'composes: buttonGroup from "./styles/buttons.module.css";'
    );
    expect(rule(".dropHint")).toContain("margin: 14px 0 0;");
  });
});
