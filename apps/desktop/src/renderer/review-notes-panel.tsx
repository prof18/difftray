import { useEffect, useRef, useState } from "react";
import { EyeOff, NotebookPen, Pencil, Save, Trash2, Undo2 } from "lucide-react";

import styles from "./review-notes-panel.module.css";
import { commentEditorShortcut, growingTextareaRows } from "./review-comments.js";

export type ReviewNotesPanelProps = {
  readonly note: ReviewNoteView | null;
  readonly editing: boolean;
  readonly pending: boolean;
  readonly onStartEdit: () => void;
  readonly onCancelEdit: () => void;
  readonly onSave: (body: string) => void;
  readonly onSetDismissed: (dismissed: boolean) => void;
  readonly onDelete: () => void;
};

export function ReviewNotesPanel({
  editing,
  note,
  onCancelEdit,
  onDelete,
  onSave,
  onSetDismissed,
  onStartEdit,
  pending
}: ReviewNotesPanelProps): React.JSX.Element {
  const [draft, setDraft] = useState(note?.body ?? "");
  const [draftStarted, setDraftStarted] = useState(editing);
  const [expanded, setExpanded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Seed the draft once per edit session so live note updates never clobber typing.
  if (editing !== draftStarted) {
    setDraftStarted(editing);
    if (editing) {
      setDraft(note?.body ?? "");
    }
  }

  useEffect(() => {
    if (editing) {
      window.setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [editing]);

  function save(): void {
    if (pending || draft.trim().length === 0) {
      return;
    }

    onSave(draft);
  }

  function confirmDelete(): void {
    if (window.confirm("Delete review notes? This can't be undone.")) {
      onDelete();
    }
  }

  const deleteButton = (
    <button
      aria-label="Delete review notes"
      className={styles.iconButton}
      disabled={pending}
      onClick={confirmDelete}
      title="Delete review notes"
      type="button"
    >
      <Trash2 size={13} strokeWidth={1.4} aria-hidden />
    </button>
  );

  if (editing) {
    return (
      <section className={styles.panel} data-state="editing" aria-label="Review notes">
        <PanelHeader />
        <textarea
          aria-label="Review notes"
          className={styles.textarea}
          disabled={pending}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onKeyDown={(event) => {
            const shortcut = commentEditorShortcut(event);

            if (shortcut === "save") {
              event.preventDefault();
              save();
            } else if (shortcut === "cancel") {
              event.preventDefault();
              onCancelEdit();
            }
          }}
          placeholder="Overall feedback for the whole change. Use new lines for separate points."
          ref={textareaRef}
          rows={growingTextareaRows(draft, 4, 12)}
          value={draft}
        />
        <div className={styles.actions}>
          <button
            className={styles.secondaryButton}
            disabled={pending}
            onClick={onCancelEdit}
            type="button"
          >
            Cancel
          </button>
          <button
            className={styles.primaryButton}
            disabled={pending || draft.trim().length === 0}
            onClick={save}
            type="button"
          >
            <Save size={13} strokeWidth={1.4} aria-hidden />
            Save
          </button>
        </div>
      </section>
    );
  }

  if (!note) {
    return (
      <button
        className={styles.addButton}
        disabled={pending}
        onClick={onStartEdit}
        type="button"
      >
        <NotebookPen size={14} strokeWidth={1.4} aria-hidden />
        Add review notes
      </button>
    );
  }

  if (note.dismissedAt) {
    return (
      <section className={styles.panel} data-state="dismissed" aria-label="Review notes">
        <p className={styles.dismissedText}>
          Review notes dismissed. They won&apos;t be included in the prompt.
        </p>
        <div className={styles.iconActions}>
          <button
            className={styles.secondaryButton}
            disabled={pending}
            onClick={() => {
              onSetDismissed(false);
            }}
            type="button"
          >
            <Undo2 size={13} strokeWidth={1.4} aria-hidden />
            Restore
          </button>
          {deleteButton}
        </div>
      </section>
    );
  }

  return (
    <section className={styles.panel} data-state="active" aria-label="Review notes">
      <div className={styles.headerRow}>
        <PanelHeader count={1} />
        <div className={styles.iconActions}>
          <button
            aria-label="Edit review notes"
            className={styles.iconButton}
            disabled={pending}
            onClick={onStartEdit}
            title="Edit review notes"
            type="button"
          >
            <Pencil size={13} strokeWidth={1.4} aria-hidden />
          </button>
          <button
            aria-label="Dismiss review notes"
            className={styles.iconButton}
            disabled={pending}
            onClick={() => {
              onSetDismissed(true);
            }}
            title="Dismiss review notes"
            type="button"
          >
            <EyeOff size={13} strokeWidth={1.4} aria-hidden />
          </button>
          {deleteButton}
        </div>
      </div>
      <button
        aria-expanded={expanded}
        className={styles.body}
        data-expanded={expanded}
        disabled={pending}
        onClick={() => {
          setExpanded((current) => !current);
        }}
        type="button"
      >
        {note.body}
      </button>
    </section>
  );
}

function PanelHeader({ count }: { readonly count?: number }): React.JSX.Element {
  return (
    <div className={styles.header}>
      <NotebookPen size={13} strokeWidth={1.4} aria-hidden />
      <span className={styles.title}>Review notes</span>
      <span className={styles.subtitle}>· Whole change</span>
      {count === undefined ? null : <span className={styles.countPill}>{count}</span>}
    </div>
  );
}
