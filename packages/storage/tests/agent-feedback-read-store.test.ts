import { expect, it, vi, afterEach } from "vitest";
import { openStorage, StaleAgentFeedbackError } from "../src/index.js";
afterEach(() => vi.useRealTimers());

it("invalidates feedback pages on mutations while preserving no-op revisions", () => {
  const s = openStorage(":memory:");
  s.upsertProject({ id: "p", name: "P", path: "/p" });
  s.upsertReviewTarget({
    id: "t",
    projectId: "p",
    mode: "working_tree",
    headKind: "working_tree"
  });
  const input = {
    projectId: "p",
    reviewTargetId: "t",
    noteScopeId: "scope",
    files: [{ path: "a", diffHash: "h", visible: false }],
    includeInactive: false,
    limit: 1,
    offset: 0
  };
  const zero = s.listAgentFeedbackPage(input);
  expect(zero).toMatchObject({ items: [], total: 0, note: null });
  const c = s.createReviewFileComment({
    projectId: "p",
    reviewTargetId: "t",
    path: "a",
    diffHash: "h",
    body: "hello"
  });
  expect(() =>
    s.listAgentFeedbackPage({ ...input, expectedFeedbackVersion: zero.feedbackVersion })
  ).toThrow(StaleAgentFeedbackError);
  const first = s.listAgentFeedbackPage(input);
  expect(first.items).toHaveLength(1);
  s.updateReviewFileComment(c.id, "hello");
  expect(s.listAgentFeedbackPage(input).feedbackVersion).toBe(first.feedbackVersion);
  s.updateReviewFileComment(c.id, "changed");
  expect(s.listAgentFeedbackPage(input).feedbackVersion).not.toBe(first.feedbackVersion);
  s.deleteReviewFileComment(c.id);
  s.saveReviewNote({ projectId: "p", scopeId: "scope", body: "overall" });
  const note = s.listAgentFeedbackPage(input);
  s.saveReviewNote({ projectId: "p", scopeId: "scope", body: "overall" });
  expect(s.listAgentFeedbackPage(input).feedbackVersion).toBe(note.feedbackVersion);
  s.setReviewNoteDismissed("scope", true);
  const dismissed = s.listAgentFeedbackPage(input);
  expect(dismissed.total).toBe(0);
  expect(dismissed.inactiveCount).toBe(1);
  s.setReviewNoteDismissed("scope", true);
  expect(s.listAgentFeedbackPage(input).feedbackVersion).toBe(dismissed.feedbackVersion);
  s.close();
});

it("bounds retained history and isolates projects with stable equal-time ordering", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-14T00:00:00.000Z"));
  const s = openStorage(":memory:");
  for (const p of ["p", "other"]) {
    s.upsertProject({ id: p, name: p, path: `/${p}` });
    s.upsertReviewTarget({
      id: p,
      projectId: p,
      mode: "working_tree",
      headKind: "working_tree"
    });
  }
  for (let n = 0; n < 120; n++) {
    s.createReviewComment({
      projectId: "p",
      reviewTargetId: "p",
      path: "a",
      diffHash: n < 30 ? "h" : "old",
      side: "additions",
      lineStart: 1,
      lineEnd: 2,
      body: String(n)
    });
  }
  s.createReviewFileComment({
    projectId: "other",
    reviewTargetId: "other",
    path: "a",
    diffHash: "h",
    body: "foreign"
  });
  const input = {
    projectId: "p",
    reviewTargetId: "p",
    noteScopeId: "p-scope",
    files: [{ path: "a", diffHash: "h", visible: true }],
    includeInactive: false,
    limit: 7,
    offset: 0
  };
  const first = s.listAgentFeedbackPage(input);
  expect(first.total).toBe(30);
  expect(first.inactiveCount).toBe(90);
  expect(first.items).toHaveLength(7);
  const ids: string[] = [];
  for (let offset = 0; offset < first.total; offset += 7)
    ids.push(
      ...s
        .listAgentFeedbackPage({
          ...input,
          offset,
          expectedFeedbackVersion: first.feedbackVersion
        })
        .items.map((i) => i.id)
    );
  expect(new Set(ids).size).toBe(30);
  const history = s.listAgentFeedbackPage({ ...input, includeInactive: true });
  expect(history.total).toBe(120);
  expect(history.items).toHaveLength(7);
  expect(history.items.some((i) => i.body === "foreign")).toBe(false);
  const firstItem = first.items[0];
  if (!firstItem) throw new Error("Missing first feedback item");
  s.deleteReviewComment(firstItem.id);
  expect(() =>
    s.listAgentFeedbackPage({
      ...input,
      offset: 7,
      expectedFeedbackVersion: first.feedbackVersion
    })
  ).toThrow(StaleAgentFeedbackError);
  s.close();
});

it("keeps note revisions independent from line feedback and tracks restore/delete", () => {
  const s = openStorage(":memory:");
  s.upsertProject({ id: "p", name: "P", path: "/p" });
  s.upsertReviewTarget({
    id: "t",
    projectId: "p",
    mode: "working_tree",
    headKind: "working_tree"
  });
  const input = {
    projectId: "p",
    reviewTargetId: "t",
    noteScopeId: "scope",
    files: [{ path: "a", diffHash: "h", visible: true }],
    includeInactive: true,
    limit: 10,
    offset: 0
  };
  s.saveReviewNote({ projectId: "p", scopeId: "scope", body: "note" });
  const note = s.listAgentFeedbackPage(input);
  const c = s.createReviewComment({
    projectId: "p",
    reviewTargetId: "t",
    path: "a",
    diffHash: "h",
    side: "additions",
    lineStart: 1,
    lineEnd: 1,
    body: "line"
  });
  expect(s.listAgentFeedbackPage(input).noteVersion).toBe(note.noteVersion);
  const page = s.listAgentFeedbackPage(input);
  s.updateReviewComment(c.id, "line");
  s.deleteReviewComment("missing");
  s.deleteReviewFileComment("missing");
  s.deleteReviewNote("missing");
  expect(s.listAgentFeedbackPage(input).feedbackVersion).toBe(page.feedbackVersion);
  s.updateReviewComment(c.id, "edited");
  expect(() =>
    s.listAgentFeedbackPage({ ...input, expectedFeedbackVersion: page.feedbackVersion })
  ).toThrow(StaleAgentFeedbackError);
  s.setReviewNoteDismissed("scope", true);
  const dismissed = s.listAgentFeedbackPage(input);
  expect(dismissed.items.find((i) => i.kind === "overall")?.inactiveReason).toBe(
    "dismissed"
  );
  s.setReviewNoteDismissed("scope", false);
  expect(s.listAgentFeedbackPage(input).feedbackVersion).not.toBe(
    dismissed.feedbackVersion
  );
  const restored = s.listAgentFeedbackPage(input);
  s.deleteReviewNote("scope");
  expect(s.listAgentFeedbackPage(input).feedbackVersion).not.toBe(
    restored.feedbackVersion
  );
  expect(s.listAgentFeedbackPage(input).note).toBeNull();
  s.close();
});
