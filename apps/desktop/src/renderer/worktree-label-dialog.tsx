import { useEffect, useId, useRef, useState } from "react";

import paletteStyles from "./command-palette-view.module.css";
import { useDialogFocusTrap } from "./dialog-focus.js";
import { classList } from "./review-view-model.js";
import styles from "./worktree-label-dialog.module.css";
import buttonStyles from "./styles/buttons.module.css";

export type WorktreeLabelDialogProps = {
  readonly initialLabel?: string;
  readonly onCancel: () => void;
  readonly onRetryTarget?: () => void;
  /** Resolves after the desktop acknowledged the write; rejects with a reason. */
  readonly onSave: (label: string) => Promise<void>;
  /** Git name and path of the worktree being labeled. */
  readonly subject: string;
  readonly targetError?: string;
  readonly targetPending?: boolean;
};

export function WorktreeLabelDialog({
  initialLabel,
  onCancel,
  onRetryTarget,
  onSave,
  subject,
  targetError,
  targetPending = false
}: WorktreeLabelDialogProps): React.JSX.Element {
  const [draft, setDraft] = useState(initialLabel ?? "");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);
  const inputId = `worktree-label-${useId().replaceAll(":", "")}`;
  useDialogFocusTrap(dialogRef);

  useEffect(() => {
    mountedRef.current = true;
    inputRef.current?.focus();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const targetReady = !targetPending && targetError === undefined;
  const visibleError = targetError ?? error;

  async function submit(): Promise<void> {
    if (saving || !targetReady) return;
    if (!draft.trim()) {
      setError("Enter a display name.");
      return;
    }

    setSaving(true);
    setError(undefined);
    try {
      await onSave(draft);
    } catch (caughtError) {
      if (mountedRef.current) {
        setError(
          caughtError instanceof Error ? caughtError.message : String(caughtError)
        );
        inputRef.current?.focus();
      }
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }

  return (
    <div
      className={paletteStyles.paletteOverlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onCancel();
      }}
    >
      <section
        aria-label="Worktree display name"
        aria-modal="true"
        className={classList(paletteStyles.palette, styles.dialog)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            if (!saving) onCancel();
          }
        }}
        ref={dialogRef}
        role="dialog"
      >
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className={styles.header}>
            <strong>Worktree display name</strong>
            <small title={subject}>{subject}</small>
          </div>
          <input
            aria-describedby={`${inputId}-help`}
            aria-label="Display name"
            className={styles.input}
            data-testid="worktree-label-input"
            id={inputId}
            onChange={(event) => {
              setDraft(event.target.value);
              setError(undefined);
            }}
            readOnly={saving}
            ref={inputRef}
            spellCheck={false}
            type="text"
            value={draft}
          />
          <span className={styles.help} id={`${inputId}-help`}>
            Shown in Difftray only.
          </span>
          {visibleError ? (
            <span className={styles.error} role="alert">
              {visibleError}
            </span>
          ) : null}
          <div className={styles.footer}>
            <div className={styles.footerActions}>
              {targetError && onRetryTarget ? (
                <button
                  className={buttonStyles.secondaryButton}
                  onClick={onRetryTarget}
                  type="button"
                >
                  Retry
                </button>
              ) : null}
              <button
                className={buttonStyles.secondaryButton}
                data-testid="worktree-label-cancel"
                disabled={saving}
                onClick={onCancel}
                type="button"
              >
                Cancel
              </button>
              <button
                className={buttonStyles.primaryButton}
                data-testid="worktree-label-save"
                disabled={saving || !targetReady}
                type="submit"
              >
                Save
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}
