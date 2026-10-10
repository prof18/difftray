import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ReviewNotesPanel, type ReviewNotesPanelProps } from "./review-notes-panel.js";

const note = {
  body: "Keep the public API stable.",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z"
};

describe("ReviewNotesPanel", () => {
  it("offers to add review notes when there is no note", () => {
    const html = render({ note: null });

    expect(html).toContain("Add review notes");
    expect(html).not.toContain("<textarea");
  });

  it("renders the editor with placeholder and actions", () => {
    const html = render({ editing: true, note: null });

    expect(html).toContain("Review notes");
    expect(html).not.toContain("Whole change");
    expect(html).toContain(
      'placeholder="Overall feedback for the whole change. Use new lines for separate points."'
    );
    expect(html).toContain("Cancel");
    expect(html).toContain("Save");
  });

  it("renders an active note with its actions", () => {
    const html = render({ note });

    expect(html).toContain("Review notes");
    expect(html).toContain("Keep the public API stable.");
    expect(html).toContain('aria-label="Edit review notes"');
    expect(html).toContain('aria-label="Dismiss review notes"');
    expect(html).toContain('aria-label="Delete review notes"');
  });

  it("renders a dismissed note with restore and delete", () => {
    const html = render({ note: { ...note, dismissedAt: "2026-01-03T00:00:00.000Z" } });

    expect(html).toContain(
      "Review notes dismissed. They won&#x27;t be included in the prompt."
    );
    expect(html).toContain("Restore");
    expect(html).toContain('aria-label="Delete review notes"');
    expect(html).not.toContain("Keep the public API stable.");
  });

  it("disables every button while pending", () => {
    const html = render({ note, pending: true });

    expect(html.match(/<button/g)?.length).toBe(html.match(/disabled=""/g)?.length);
  });
});

function render(patch: Partial<ReviewNotesPanelProps>): string {
  return renderToStaticMarkup(
    <ReviewNotesPanel
      editing={false}
      note={null}
      onCancelEdit={vi.fn()}
      onDelete={vi.fn()}
      onSave={vi.fn()}
      onSetDismissed={vi.fn()}
      onStartEdit={vi.fn()}
      pending={false}
      {...patch}
    />
  );
}
