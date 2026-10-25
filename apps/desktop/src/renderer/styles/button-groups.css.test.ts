import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const rendererDir = join(dirname(fileURLToPath(import.meta.url)), "..");

function css(file: string): string {
  return readFileSync(join(rendererDir, file), "utf8");
}

function rule(source: string, selector: string): string {
  const start = source.indexOf(`\n${selector} {`);
  if (start < 0) throw new Error(`Missing rule ${selector}`);
  return source.slice(start, source.indexOf("}", start));
}

// Buttons shown side by side as peers (Cancel and Save, Deny and Approve, Open
// Repository and Scan a folder) were each as wide as their own label, so pairs
// looked lopsided, and the gaps between them varied between 2, 6 and 8px.
describe("button groups", () => {
  it("has one recipe that gives peer buttons the width of the widest", () => {
    const group = rule(css("styles/buttons.module.css"), ".buttonGroup");

    expect(group).toContain("display: grid;");
    expect(group).toContain("width: max-content;");
    expect(group).toContain("grid-auto-columns: 1fr;");
    expect(group).toContain("grid-auto-flow: column;");
    expect(group).toContain("gap: 8px;");
  });

  const groups: readonly (readonly [string, string])[] = [
    ["app-status-views.module.css", ".emptyActions"],
    ["app-status-views.module.css", ".toastActions"],
    ["file-comments.module.css", ".actions"],
    ["review-notes-panel.module.css", ".actions"],
    ["review-comment-annotation.module.css", ".reviewCommentActions"],
    ["settings-panel.module.css", ".companionActions"],
    ["settings-panel.module.css", ".companionDialogActions"],
    ["settings-panel.module.css", ".companionStores"],
    ["dropped-repository-preview.module.css", ".footerActions"],
    ["repository-picker.module.css", ".footerActions"],
    ["worktree-label-dialog.module.css", ".footerActions"]
  ];

  // Three buttons and a keyboard hint did not fit the picker's footer: the hint
  // wrapped and squeezed the buttons back to unequal widths. The buttons now
  // share the footer in equal thirds.
  it("splits the repository picker footer into equal thirds", () => {
    const source = css("repository-picker.module.css");
    expect(rule(source, ".footer .footerActions")).toContain("width: 100%;");
  });

  it.each(groups)("%s %s uses the shared group", (file, selector) => {
    const source = css(file);
    expect(rule(source, selector)).toContain(
      'composes: buttonGroup from "./styles/buttons.module.css";'
    );
    // A local display or gap would fight the recipe in whatever order the
    // bundled stylesheets land.
    const grouped = new RegExp(
      `${selector.replace(".", "\\.")}[,\\s][^{]*\\{[^}]*display`
    );
    expect(source).not.toMatch(grouped);
  });
});
