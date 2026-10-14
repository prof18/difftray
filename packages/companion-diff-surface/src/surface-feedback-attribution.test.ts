import { describe, expect, it } from "vitest";
import { commentAttributionLabel } from "./surface-feedback-attribution.js";
const agent = { kind: "agent", name: "Codex", runId: "one" } as const;
describe("comment attribution", () => {
  it("keeps legacy and human-only feedback unlabeled", () => {
    expect(commentAttributionLabel({})).toBeUndefined();
    expect(
      commentAttributionLabel({
        createdBy: { kind: "human" },
        lastEditedBy: { kind: "human" }
      })
    ).toBeUndefined();
  });
  it("shows agent creator once when the editor matches or is absent", () => {
    expect(commentAttributionLabel({ createdBy: agent })).toBe("Agent: Codex");
    expect(
      commentAttributionLabel({ createdBy: agent, lastEditedBy: { ...agent } })
    ).toBe("Agent: Codex");
  });
  it("distinguishes creator from human, another agent, and another run", () => {
    expect(
      commentAttributionLabel({ createdBy: agent, lastEditedBy: { kind: "human" } })
    ).toBe("Agent: Codex · edited by human");
    expect(
      commentAttributionLabel({
        createdBy: agent,
        lastEditedBy: { ...agent, name: "Claude" }
      })
    ).toBe("Agent: Codex · edited by agent: Claude");
    expect(
      commentAttributionLabel({
        createdBy: agent,
        lastEditedBy: { ...agent, runId: "two" }
      })
    ).toBe("Agent: Codex · edited by agent: Codex");
    expect(commentAttributionLabel({ lastEditedBy: agent })).toBe(
      "edited by agent: Codex"
    );
    expect(commentAttributionLabel({ lastEditedBy: { ...agent, name: "human" } })).toBe(
      "edited by agent: human"
    );
  });
});
