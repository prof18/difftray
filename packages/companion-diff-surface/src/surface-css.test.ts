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
});
