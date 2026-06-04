import { useEffect, useRef, useState } from "react";
import type { DiffLineAnnotation } from "@pierre/diffs";
import { MessageSquare, Pencil, Save, Trash2 } from "lucide-react";

import styles from "./review-comment-annotation.module.css";
import {
  formatReviewCommentLocation,
  type ReviewCommentAnnotationMetadata
} from "./review-comments.js";

export function ReviewCommentAnnotation({
  annotation,
  onCancelDraft,
  onDeleteComment,
  onDraftBodyChange,
  onSaveDraft,
  onUpdateComment,
  saving,
  showSaving
}: {
  readonly annotation: DiffLineAnnotation<ReviewCommentAnnotationMetadata>;
  readonly onCancelDraft: () => void;
  readonly onDeleteComment: (commentId: string) => void;
  readonly onDraftBodyChange: (body: string) => void;
  readonly onSaveDraft: () => Promise<boolean>;
  readonly onUpdateComment: (commentId: string, body: string) => Promise<boolean>;
  readonly saving: boolean;
  readonly showSaving: boolean;
}): React.JSX.Element {
  const { metadata } = annotation;
  const [editingBody, setEditingBody] = useState<string | undefined>();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isDraft = metadata.kind === "draft";
  const body =
    metadata.kind === "draft"
      ? metadata.draft.body
      : (editingBody ?? metadata.comment.body);

  useEffect(() => {
    if (isDraft || editingBody !== undefined) {
      window.setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [editingBody, isDraft]);

  if (metadata.kind === "draft" || editingBody !== undefined) {
    return (
      <div className={styles.reviewCommentCard} data-draft={isDraft}>
        <div className={styles.reviewCommentHeader}>
          <span>
            <MessageSquare size={13} strokeWidth={1.4} aria-hidden />
            {formatReviewCommentLocation(annotation)}
          </span>
        </div>
        <textarea
          aria-label="Review comment"
          className={styles.reviewCommentTextarea}
          disabled={saving}
          onChange={(event) => {
            if (metadata.kind === "draft") {
              onDraftBodyChange(event.target.value);
            } else {
              setEditingBody(event.target.value);
            }
          }}
          ref={textareaRef}
          rows={3}
          value={body}
        />
        <div className={styles.reviewCommentActions}>
          <button
            className={styles.secondaryButton}
            disabled={saving}
            onClick={() => {
              if (metadata.kind === "draft") {
                onCancelDraft();
              } else {
                setEditingBody(undefined);
              }
            }}
            type="button"
          >
            Cancel
          </button>
          <button
            className={styles.primaryButton}
            disabled={saving || body.trim().length === 0}
            onClick={() => {
              if (metadata.kind === "draft") {
                void onSaveDraft();
              } else {
                void onUpdateComment(metadata.comment.id, body).then((saved) => {
                  if (saved) {
                    setEditingBody(undefined);
                  }
                });
              }
            }}
            type="button"
          >
            {showSaving ? (
              <span className={styles.loadingMiniMark} aria-hidden />
            ) : (
              <Save size={13} strokeWidth={1.4} aria-hidden />
            )}
            {showSaving ? "Saving" : "Save"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.reviewCommentCard}>
      <div className={styles.reviewCommentHeader}>
        <span>
          <MessageSquare size={13} strokeWidth={1.4} aria-hidden />
          {formatReviewCommentLocation(annotation)}
        </span>
        <div className={styles.reviewCommentIconActions}>
          <button
            aria-label="Edit review comment"
            className={styles.iconButton}
            onClick={() => {
              setEditingBody(metadata.comment.body);
            }}
            title="Edit comment"
            type="button"
          >
            <Pencil size={13} strokeWidth={1.4} aria-hidden />
          </button>
          <button
            aria-label="Delete review comment"
            className={styles.iconButton}
            onClick={() => {
              onDeleteComment(metadata.comment.id);
            }}
            title="Delete comment"
            type="button"
          >
            <Trash2 size={13} strokeWidth={1.4} aria-hidden />
          </button>
        </div>
      </div>
      <p className={styles.reviewCommentBody}>{metadata.comment.body}</p>
    </div>
  );
}
