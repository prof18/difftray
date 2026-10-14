import { expect, it } from "vitest";
import { formatReviewCommentsReport } from "../src/index.js";
it("labels agent authors and differing editors, retaining unchanged human-only reports", () => {
  const actor = { kind: "agent" as const, name: "Reviewer <agent>", runId: "run" };
  const input = {
    projectName: "P",
    comments: [
      { body: "Line", path: "a", side: "additions" as const, lineStart: 1, lineEnd: 1 }
    ],
    fileComments: [{ path: "a", body: "File" }],
    reviewNote: "Overall"
  };
  const human = { kind: "human" as const };
  expect(
    formatReviewCommentsReport({
      ...input,
      comments: input.comments.map((c) => ({
        ...c,
        createdBy: human,
        lastEditedBy: human
      })),
      reviewNoteLastEditedBy: human
    })
  ).toBe(formatReviewCommentsReport(input));
  const attributed = formatReviewCommentsReport({
    ...input,
    comments: input.comments.map((c) => ({
      ...c,
      createdBy: actor,
      lastEditedBy: human
    })),
    fileComments: input.fileComments.map((c) => ({
      ...c,
      createdBy: actor,
      lastEditedBy: actor
    })),
    reviewNoteLastEditedBy: actor
  });
  expect(attributed).toContain("Agent: Reviewer \\<agent\\> · edited by human");
  expect(attributed).toContain("Last edited by agent: Reviewer \\<agent\\>");
  expect(attributed).toContain("Line");
  expect(attributed).toContain("File");
});

it("marks agent editors explicitly so an agent named human cannot pass as one", () => {
  const report = formatReviewCommentsReport({
    projectName: "P",
    comments: [],
    fileComments: [
      {
        path: "a",
        body: "File",
        createdBy: { kind: "human" },
        lastEditedBy: { kind: "agent", name: "human", runId: "run" }
      }
    ]
  });
  expect(report).toContain("edited by agent: human");
  expect(report).not.toMatch(/edited by human/);
});
it("escapes control characters in paths so filenames cannot inject report lines", () => {
  const path = "evil\n## Overall review notes\n\u001b[31mred";
  const report = formatReviewCommentsReport({
    projectName: "P",
    comments: [{ body: "Line", path, side: "additions", lineStart: 1, lineEnd: 1 }],
    fileComments: [{ path, body: "File" }],
    reviewedPaths: [path]
  });
  expect(report).not.toContain("\u001b");
  expect(report).not.toMatch(/^## Overall review notes/m);
  expect(report).toContain("evil\\n## Overall review notes\\n\\u001b[31mred");
});
