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

  it("wraps long file header paths without widening the surface", () => {
    expect(styles).toContain(".diff-surface__path {\n  color: var(--diff-surface-fg);");
    expect(styles).toContain("  min-width: 0;\n  overflow-wrap: anywhere;");
    expect(styles).not.toContain(".diff-surface__meta");
    expect(styles).not.toContain(".diff-surface__header::-webkit-scrollbar");
  });

  it("keeps syntax tokens inside changed rows on the added or removed color", () => {
    expect(styles).toContain(
      '.diff-surface__row[data-row-kind="deletion"] .diff-surface__syntax-token {\n  color: inherit;'
    );
    expect(styles).toContain(
      '.diff-surface__row[data-row-kind="addition"] .diff-surface__syntax-token {\n  color: inherit;'
    );
    expect(styles).toContain(
      '[data-split-side="deletions"]\n  .diff-surface__syntax-token {\n  color: inherit;'
    );
    expect(styles).toContain(
      '[data-split-side="additions"]\n  .diff-surface__syntax-token {\n  color: inherit;'
    );
  });

  it("emphasizes paired line edits as inline word changes", () => {
    expect(styles).toContain(".diff-surface__line-change {\n  border-radius: 3px;");
    expect(styles).toContain(
      '.diff-surface__row[data-inline-change="true"] {\n  background: var(--diff-bg-context);'
    );
    expect(styles).toContain(
      '.diff-surface__row[data-inline-change="true"][data-row-kind="deletion"]\n  .diff-surface__line-change {\n  background: var(--diff-del-bg);'
    );
    expect(styles).toContain(
      '.diff-surface__split-row[data-inline-change="true"]\n  .diff-surface__split-cell:not(:empty) {\n  background: var(--diff-bg-context);'
    );
    expect(styles).toContain(
      '.diff-surface__split-row[data-inline-change="true"]\n  .diff-surface__line-content\n  code {\n  overflow-wrap: normal;'
    );
    expect(styles).toContain("  white-space: pre;");
  });

  it("gives split diff lanes desktop-style context backgrounds and empty-side hatching", () => {
    expect(styles).toContain(
      '.diff-surface__diff[data-diff-layout="split"] {\n  background: var(--diff-bg-separator);'
    );
    expect(styles).toContain(
      ".diff-surface__split-row {\n  background: var(--diff-bg-separator);\n  column-gap: 1px;"
    );
    expect(styles).toContain(
      ".diff-surface__split-cell {\n  appearance: none;\n  background: var(--diff-bg-context);"
    );
    expect(styles).toContain(".diff-surface__split-cell:empty {");
    expect(styles).toContain("repeating-linear-gradient(");
    expect(styles).toContain(
      ".diff-surface__split-cell .diff-surface__line-number,\n.diff-surface__split-cell .diff-surface__glyph {\n  background: var(--diff-bg-gutter);"
    );
    expect(styles).toContain("  background: var(--diff-add-bg-strong);");
    expect(styles).toContain("  background: var(--diff-del-bg-strong);");
  });
});
