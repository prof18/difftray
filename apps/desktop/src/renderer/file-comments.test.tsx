import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { FileCommentStack, type FileCommentStackProps } from "./file-comments.js";

describe("FileCommentStack", () => {
  it("renders cards in the given order with the whole-file caption", () => {
    const html = render({
      comments: [fileComment("first", "First comment."), fileComment("second", "Second.")]
    });

    expect(html.match(/Whole file/g)).toHaveLength(2);
    expect(html.indexOf("First comment.")).toBeLessThan(html.indexOf("Second."));
    expect(html).toContain('aria-label="Edit file comment"');
    expect(html).toContain('aria-label="Delete file comment"');
  });

  it("distinguishes agent runs and retains file controls", () => {
    const html = render({
      comments: [
        {
          ...fileComment("agent", "First\nSecond"),
          createdBy: { kind: "agent", name: "Codex", runId: "one" },
          lastEditedBy: { kind: "agent", name: "Codex", runId: "two" }
        }
      ]
    });
    expect(html).toContain("Agent: Codex · edited by agent: Codex");
    expect(html).toContain("First\nSecond");
    expect(html).toContain('aria-label="Edit file comment"');
    expect(html).toContain('aria-label="Delete file comment"');
  });

  // The composer opened as an empty field with an accent border on both the card
  // and the field. It now says what to write, and only the field shows focus.
  it("prompts for whole-file feedback and keeps one focus ring", () => {
    const html = render({ comments: [], draft: { body: "" } });
    const css = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "file-comments.module.css"),
      "utf8"
    );

    expect(html).toContain('placeholder="Feedback on this file as a whole"');
    expect(css).not.toContain(
      '.card[data-draft="true"] {\n  border-color: var(--accent);'
    );
  });

  it("renders the draft editor before saved cards", () => {
    const html = render({
      comments: [fileComment("first", "Saved comment.")],
      draft: { body: "Draft body" }
    });

    expect(html.indexOf("<textarea")).toBeGreaterThan(-1);
    expect(html.indexOf("<textarea")).toBeLessThan(html.indexOf("Saved comment."));
    expect(html).toContain("Draft body");
    expect(html).toContain('data-draft="true"');
  });

  it("renders nothing without comments or a draft", () => {
    expect(render({})).toBe("");
  });
});

function render(patch: Partial<FileCommentStackProps>): string {
  return renderToStaticMarkup(
    <FileCommentStack
      comments={[]}
      draft={undefined}
      onCancelDraft={vi.fn()}
      onDelete={vi.fn()}
      onDraftBodyChange={vi.fn()}
      onSaveDraft={vi.fn()}
      onUpdate={vi.fn()}
      pending={false}
      {...patch}
    />
  );
}

function fileComment(id: string, body: string): ReviewFileCommentView {
  return {
    body,
    createdAt: "2026-01-01T00:00:00.000Z",
    diffHash: "hash-1",
    id,
    path: "src/App.tsx",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}
