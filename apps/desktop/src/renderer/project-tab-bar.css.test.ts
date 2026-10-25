import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "project-tab-bar.module.css"),
  "utf8"
);

// The last rule for a selector: the shared base rule lists several of them first.
function rule(selector: string): string {
  const start = css.lastIndexOf(`\n${selector} {`);
  if (start < 0) throw new Error(`Missing rule ${selector}`);
  return css.slice(start, css.indexOf("}", start));
}

describe("project tab bar css", () => {
  // The active tab kept styles from when it joined the panel below: a bottom border
  // in the panel colour and a -1px margin. As a pill centred in the bar, its bottom
  // edge looked cut off and the tab sat a pixel low.
  it("draws the active tab as a whole pill", () => {
    const active = rule('.projectTab[data-active="true"]');

    expect(active).toContain("border-color: var(--border);");
    expect(active).not.toContain("border-bottom-color");
    expect(active).not.toContain("margin-bottom");
  });

  // The close control was a full-height strip with a divider on the tab's right
  // edge, against 12px of padding on the left.
  it("insets the close control evenly inside the tab", () => {
    const close = rule(".tabCloseButton");

    expect(close).toContain("width: 20px;");
    expect(close).toContain("height: 20px;");
    expect(close).toContain("margin-right: 4px;");
    expect(close).toContain("border-radius: 4px;");
    expect(close).not.toContain("border-left-color");
  });

  it("gives inactive tabs a hover state", () => {
    expect(rule('.projectTab:not([data-active="true"]):hover')).toContain(
      "background: var(--hover);"
    );
  });
});
