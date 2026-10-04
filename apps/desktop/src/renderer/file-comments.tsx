import { useEffect, useRef, useState } from "react";
import { FileText, Pencil, Save, Trash2 } from "lucide-react";

import styles from "./file-comments.module.css";
import {
  commentEditorShortcut,
  growingTextareaRows,
  isFocusLost
} from "./review-comments.js";

export type FileCommentStackProps = {
  readonly comments: readonly ReviewFileCommentView[];
  readonly draft: { readonly body: string } | undefined;
  readonly pending: boolean;
  readonly onDraftBodyChange: (body: string) => void;
  readonly onCancelDraft: () => void;
  readonly onSaveDraft: () => Promise<void> | void;
  /** Resolving to false keeps the inline editor open with the typed text. */
  readonly onUpdate: (id: string, body: string) => Promise<boolean> | boolean;
  readonly onDelete: (id: string) => void;
};

export function FileCommentStack({
  comments,
  draft,
  onCancelDraft,
  onDelete,
  onDraftBodyChange,
  onSaveDraft,
  onUpdate,
  pending
}: FileCommentStackProps): React.JSX.Element | null {
  if (comments.length === 0 && !draft) {
    return null;
  }

  return (
    <div className={styles.stack} aria-label="File comments" role="group">
      {draft ? (
        <FileCommentEditor
          body={draft.body}
          draft
          onBodyChange={onDraftBodyChange}
          onCancel={onCancelDraft}
          onSave={() => {
            void onSaveDraft();
          }}
          pending={pending}
        />
      ) : null}
      {comments.map((comment) => (
        <FileCommentCard
          comment={comment}
          key={comment.id}
          onDelete={onDelete}
          onUpdate={onUpdate}
          pending={pending}
        />
      ))}
    </div>
  );
}

function FileCommentCard({
  comment,
  onDelete,
  onUpdate,
  pending
}: {
  readonly comment: ReviewFileCommentView;
  readonly onDelete: (id: string) => void;
  readonly onUpdate: FileCommentStackProps["onUpdate"];
  readonly pending: boolean;
}): React.JSX.Element {
  const [editingBody, setEditingBody] = useState<string | undefined>();
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);

  useEffect(() => {
    if (wasEditing.current && editingBody === undefined && isFocusLost()) {
      editButtonRef.current?.focus();
    }
    wasEditing.current = editingBody !== undefined;
  }, [editingBody]);

  if (editingBody !== undefined) {
    return (
      <FileCommentEditor
        body={editingBody}
        draft={false}
        onBodyChange={setEditingBody}
        onCancel={() => {
          setEditingBody(undefined);
        }}
        onSave={() => {
          void Promise.resolve(onUpdate(comment.id, editingBody)).then((saved) => {
            if (saved) {
              setEditingBody(undefined);
            }
          });
        }}
        pending={pending}
      />
    );
  }

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span>
          <FileText size={13} strokeWidth={1.4} aria-hidden />
          Whole file
        </span>
        <div className={styles.iconActions}>
          <button
            aria-label="Edit file comment"
            className={styles.iconButton}
            disabled={pending}
            onClick={() => {
              setEditingBody(comment.body);
            }}
            ref={editButtonRef}
            title="Edit comment"
            type="button"
          >
            <Pencil size={13} strokeWidth={1.4} aria-hidden />
          </button>
          <button
            aria-label="Delete file comment"
            className={styles.iconButton}
            disabled={pending}
            onClick={() => {
              onDelete(comment.id);
            }}
            title="Delete comment"
            type="button"
          >
            <Trash2 size={13} strokeWidth={1.4} aria-hidden />
          </button>
        </div>
      </div>
      <p className={styles.body}>{comment.body}</p>
    </div>
  );
}

function FileCommentEditor({
  body,
  draft,
  onBodyChange,
  onCancel,
  onSave,
  pending
}: {
  readonly body: string;
  readonly draft: boolean;
  readonly onBodyChange: (body: string) => void;
  readonly onCancel: () => void;
  readonly onSave: () => void;
  readonly pending: boolean;
}): React.JSX.Element {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSave = !pending && body.trim().length > 0;

  useEffect(() => {
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }, []);

  return (
    <div className={styles.card} data-draft={draft}>
      <div className={styles.header}>
        <span>
          <FileText size={13} strokeWidth={1.4} aria-hidden />
          Whole file
        </span>
      </div>
      <textarea
        aria-label="File comment"
        className={styles.textarea}
        disabled={pending}
        onChange={(event) => {
          onBodyChange(event.target.value);
        }}
        onKeyDown={(event) => {
          const shortcut = commentEditorShortcut(event);

          if (shortcut === "save") {
            event.preventDefault();
            if (canSave) {
              onSave();
            }
          } else if (shortcut === "cancel") {
            event.preventDefault();
            onCancel();
          }
        }}
        ref={textareaRef}
        rows={growingTextareaRows(body, 3, 12)}
        value={body}
      />
      <div className={styles.actions}>
        <button
          className={styles.secondaryButton}
          disabled={pending}
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <button
          className={styles.primaryButton}
          disabled={!canSave}
          onClick={onSave}
          type="button"
        >
          <Save size={13} strokeWidth={1.4} aria-hidden />
          Save
        </button>
      </div>
    </div>
  );
}
