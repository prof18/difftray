import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ChangeTypeTile,
  ReviewStateGlyph,
  changeTypeLetter,
  reviewStateLabel
} from "./file-state.js";

describe("file state indicators", () => {
  it("maps every change status to one letter", () => {
    expect(changeTypeLetter("added")).toBe("A");
    expect(changeTypeLetter("deleted")).toBe("D");
    expect(changeTypeLetter("modified")).toBe("M");
    expect(changeTypeLetter("mode_changed")).toBe("M");
    expect(changeTypeLetter("renamed")).toBe("R");
  });

  it("renders the change type tile with its status", () => {
    const html = renderToStaticMarkup(<ChangeTypeTile status="added" />);

    expect(html).toContain('data-change-type="added"');
    expect(html).toContain(">A<");
    expect(html).toContain('aria-hidden="true"');
  });

  it("renders a distinct glyph for each review state", () => {
    const pending = renderToStaticMarkup(<ReviewStateGlyph state="pending" />);
    const reviewed = renderToStaticMarkup(<ReviewStateGlyph state="reviewed" />);
    const attention = renderToStaticMarkup(<ReviewStateGlyph state="attention" />);

    expect(pending).toContain('data-review-state="pending"');
    expect(reviewed).toContain('data-review-state="reviewed"');
    expect(attention).toContain('data-review-state="attention"');
    expect(new Set([pending, reviewed, attention]).size).toBe(3);
    expect(attention).not.toContain("pulse");
  });

  it("names review states in user-facing words", () => {
    expect(reviewStateLabel("pending")).toBe("Unreviewed");
    expect(reviewStateLabel("unknown")).toBe("Unreviewed");
    expect(reviewStateLabel("reviewed")).toBe("Reviewed");
    expect(reviewStateLabel("attention")).toBe("Changed after review");
  });
});
