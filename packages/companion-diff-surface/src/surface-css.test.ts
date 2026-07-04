import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const styles = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "styles.css"),
  "utf8"
);

describe("diff surface css", () => {
  it("uses the design elevated background for unified and split hunk bars", () => {
    expect(styles).toContain(
      '.diff-surface__row[data-row-kind="hunk"] {\n  background: var(--diff-hunk-bg);'
    );
    expect(styles).toContain(
      ".diff-surface__split-hunk {\n  background: var(--diff-hunk-bg);"
    );
  });

  it("keeps the gutter and code content as separate grid targets", () => {
    expect(styles).toContain(
      '.diff-surface__line-number[data-line-select-target="gutter"] {\n  cursor: pointer;'
    );
    expect(styles).toContain(".diff-surface__line-content {\n  appearance: none;");
    expect(styles).toContain("grid-column: 2 / 4;");
  });

  it("contains horizontal panning to code lines when wrapping is disabled", () => {
    expect(styles).toContain(
      ".diff-surface {\n  box-sizing: border-box;\n  height: 100%;\n  overflow-x: hidden;\n  overflow-y: auto;"
    );
    expect(styles).toContain(
      '.diff-surface[data-wrap-lines="false"] .diff-surface__line-content code {\n  overflow-x: auto;'
    );
  });
});
