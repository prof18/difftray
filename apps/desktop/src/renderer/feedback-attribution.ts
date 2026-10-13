import type { FeedbackActor } from "@difftray/companion-protocol";

export function commentAttributionLabel(feedback: {
  readonly createdBy?: FeedbackActor;
  readonly lastEditedBy?: FeedbackActor;
}): string | undefined {
  const author = feedback.createdBy ?? { kind: "human" };
  const editor = feedback.lastEditedBy ?? author;
  const unchanged =
    author.kind === editor.kind &&
    (author.kind === "human" ||
      (editor.kind === "agent" &&
        author.name === editor.name &&
        author.runId === editor.runId));
  const authorLabel = author.kind === "agent" ? `Agent: ${author.name}` : undefined;
  const editorLabel = unchanged
    ? undefined
    : `edited by ${editor.kind === "human" ? "human" : editor.name}`;
  return [authorLabel, editorLabel].filter(Boolean).join(" · ") || undefined;
}

export function noteAttributionLabel(editor?: FeedbackActor): string | undefined {
  return editor === undefined
    ? undefined
    : editor.kind === "human"
      ? "Last edited by human"
      : `Last edited by agent: ${editor.name}`;
}
