import { describe, expect, it } from "vitest";
import { ATTRIBUTION_CAPABILITY, projectFeedbackAttribution } from "../src/index.js";

describe("feedback attribution capability projection", () => {
  const actor = { kind: "agent", name: "Reviewer", runId: "run-1" };
  const comment = {
    id: "comment",
    body: "createdBy lastEditedBy noteVersion",
    createdBy: actor,
    lastEditedBy: { kind: "human" }
  };
  const note = { body: "Review", lastEditedBy: actor, noteVersion: "v1" };
  it("advertises the stable capability", () => {
    expect(ATTRIBUTION_CAPABILITY).toBe("feedback-attribution-v1");
  });
  it.each([
    {
      workspace: {
        comments: [comment],
        fileComments: [comment],
        reviewNote: note,
        noteVersion: "v1",
        nested: [{ comments: [comment] }]
      }
    },
    { comments: [comment] },
    { comment },
    { fileComment: comment },
    { reviewNote: note }
  ])("projects legacy responses recursively without mutating them", (value) => {
    const before = structuredClone(value);
    const legacy = projectFeedbackAttribution(value, []);
    expect(JSON.stringify(legacy)).not.toContain('"createdBy":');
    expect(JSON.stringify(legacy)).not.toContain('"lastEditedBy":');
    expect(JSON.stringify(legacy)).not.toContain('"noteVersion":');
    expect(JSON.stringify(legacy)).toContain('"body":');
    expect(value).toEqual(before);
    expect(
      projectFeedbackAttribution(value, ["another-capability", ATTRIBUTION_CAPABILITY])
    ).toBe(value);
  });
  it("preserves report response shape and literal strings", () => {
    const report = { report: "createdBy: agent; lastEditedBy: human; noteVersion: v1" };
    expect(projectFeedbackAttribution(report, [])).toEqual(report);
    expect(projectFeedbackAttribution({ comment }, [])).toEqual({
      comment: { id: "comment", body: comment.body }
    });
  });
  it.each([null, "noteVersion", 42, false])("preserves primitive %s", (value) => {
    expect(projectFeedbackAttribution(value, [])).toBe(value);
  });
});
