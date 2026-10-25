import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const rendererDir = dirname(fileURLToPath(import.meta.url));
const fileList = readFileSync(join(rendererDir, "file-list.module.css"), "utf8");
const reviewNotes = readFileSync(
  join(rendererDir, "review-notes-panel.module.css"),
  "utf8"
);

function rule(css: string, selector: string): string {
  const start = css.lastIndexOf(`\n${selector} {`);
  if (start < 0) throw new Error(`Missing rule ${selector}`);
  return css.slice(start, css.indexOf("}", start));
}

describe("file list css", () => {
  // The selected row sat 6px from the sidebar's edges while Add review notes above
  // it sits 10px in, so the highlight looked shifted against the button.
  it("insets file rows like the review notes button above them", () => {
    expect(rule(reviewNotes, ".addButton")).toContain("margin: 8px 10px 6px;");
    expect(rule(fileList, ".fileItem")).toContain("margin: 0 10px;");
  });

  // A 2px left border on a 6px-radius row bent around both left corners, so the
  // selected and needs-attention rows looked clipped on one side.
  it("marks selected and attention rows with a bar clear of the corners", () => {
    expect(rule(fileList, ".fileItem")).not.toContain("border-left");
    const marker = rule(fileList, ".fileItem::before");
    expect(marker).toContain("top: 10px;");
    expect(marker).toContain("bottom: 10px;");
    expect(rule(fileList, '.fileItem[data-selected="true"]::before')).toContain(
      "background: var(--accent);"
    );
    expect(rule(fileList, '.fileItem[data-attention="true"]::before')).toContain(
      "background: var(--warn);"
    );
  });
});
