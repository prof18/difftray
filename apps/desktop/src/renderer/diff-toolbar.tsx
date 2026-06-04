import {
  AlertTriangle,
  Check,
  ClipboardList,
  Columns2,
  ExternalLink,
  GitBranch,
  MessageSquare,
  PanelLeft,
  PanelRight
} from "lucide-react";

import styles from "./diff-toolbar.module.css";
import { type DiffSideFocus } from "./diffs-renderer.js";
import { classList, reviewState, splitPath, type DiffMode } from "./review-view-model.js";

export function DiffToolbar({
  commentCount,
  copyDisabled,
  copyPending,
  diffMode,
  diffSideFocus,
  disabled,
  file,
  onCopyCommentsReport,
  onDiffSideFocusChange,
  onOpenEditor,
  onToggleReviewed,
  refName,
  reportCommentCount
}: {
  readonly commentCount: number;
  readonly copyDisabled: boolean;
  readonly copyPending: boolean;
  readonly diffMode: DiffMode;
  readonly diffSideFocus: DiffSideFocus;
  readonly disabled: boolean;
  readonly file: ReviewFileView;
  readonly onCopyCommentsReport: () => void;
  readonly onDiffSideFocusChange: (sideFocus: DiffSideFocus) => void;
  readonly onOpenEditor: () => void;
  readonly onToggleReviewed: () => void;
  readonly refName: string;
  readonly reportCommentCount: number;
}): React.JSX.Element {
  const parts = splitPath(file.path);
  const canFocusSides = file.status !== "added" && file.status !== "deleted";
  const showSideFocusControls = diffMode === "split";

  return (
    <div className={styles.diffToolbar}>
      <div className={styles.diffTitleBlock}>
        <div className={styles.diffFileTitle}>
          <span className={styles.statusDot} data-state={reviewState(file)} />
          <span className={styles.diffDir}>{parts.dirname}</span>
          <span className={styles.diffFileName}>{parts.filename}</span>
          {file.invalidated ? (
            <span className={styles.diffChangedPill}>
              <AlertTriangle size={12} strokeWidth={1.4} aria-hidden />
              Diff changed
            </span>
          ) : null}
        </div>
        <div className={styles.diffMeta}>
          <GitBranch size={13} strokeWidth={1.4} aria-hidden />
          <span>{refName}</span>
          <span>·</span>
          <span className={styles.addText}>+{file.additions}</span>
          <span className={styles.delText}>-{file.deletions}</span>
          {commentCount > 0 ? (
            <>
              <span>·</span>
              <span className={styles.commentMeta}>
                <MessageSquare size={12} strokeWidth={1.4} aria-hidden />
                {commentCount}
              </span>
            </>
          ) : null}
        </div>
      </div>
      <div className={styles.diffActions}>
        {showSideFocusControls ? (
          <>
            <div
              className={styles.diffSideSegmented}
              role="group"
              aria-label="Diff side focus"
            >
              <button
                aria-label="Show old version"
                data-active={diffSideFocus === "old"}
                disabled={disabled || !canFocusSides}
                onClick={() => {
                  onDiffSideFocusChange("old");
                }}
                title="Show old version"
                type="button"
              >
                <PanelLeft size={14} strokeWidth={1.4} aria-hidden />
              </button>
              <button
                aria-label="Show both diff sides"
                data-active={diffSideFocus === "both"}
                disabled={disabled}
                onClick={() => {
                  onDiffSideFocusChange("both");
                }}
                title="Show both sides"
                type="button"
              >
                <Columns2 size={14} strokeWidth={1.4} aria-hidden />
              </button>
              <button
                aria-label="Show new version"
                data-active={diffSideFocus === "new"}
                disabled={disabled || !canFocusSides}
                onClick={() => {
                  onDiffSideFocusChange("new");
                }}
                title="Show new version"
                type="button"
              >
                <PanelRight size={14} strokeWidth={1.4} aria-hidden />
              </button>
            </div>
            <span className={styles.verticalDivider} />
          </>
        ) : null}
        {reportCommentCount > 0 ? (
          <button
            aria-busy={copyPending}
            aria-label={
              copyPending ? "Generating comments message" : "Copy comments report"
            }
            className={classList(styles.secondaryButton, styles.reportButton)}
            disabled={copyDisabled}
            onClick={onCopyCommentsReport}
            title={
              copyPending
                ? "Generating comments message"
                : "Copy all comments as an agent-ready report"
            }
            type="button"
          >
            {copyPending ? (
              <span className={styles.reportButtonSpinner} aria-hidden />
            ) : (
              <ClipboardList size={14} strokeWidth={1.4} aria-hidden />
            )}
            <span className={styles.reportButtonLabel}>
              {copyPending ? "Generating message" : "Copy comments report"}
            </span>
            {copyPending ? null : (
              <span className={styles.reportButtonCount} aria-hidden>
                {reportCommentCount}
              </span>
            )}
          </button>
        ) : null}
        <button
          aria-label="Open selected file in editor"
          className={styles.iconButton}
          disabled={disabled}
          onClick={onOpenEditor}
          title="Open in editor"
          type="button"
        >
          <ExternalLink size={14} strokeWidth={1.4} aria-hidden />
        </button>
        <span className={styles.verticalDivider} />
        <button
          className={styles.primaryButton}
          data-reviewed={file.reviewed}
          disabled={disabled}
          onClick={onToggleReviewed}
          type="button"
        >
          <Check size={14} strokeWidth={1.4} aria-hidden />
          {file.reviewed ? "Unmark reviewed" : "Mark reviewed"}
          <kbd>R</kbd>
        </button>
      </div>
    </div>
  );
}

export function DiffLoadingState({
  filePath,
  status
}: {
  readonly filePath: string;
  readonly status: "deferred" | "idle" | "loading";
}): React.JSX.Element {
  if (status === "deferred") {
    return <div className={styles.diffPreparingState} aria-hidden="true" />;
  }

  return (
    <div className={styles.diffPreparingState} role="status" aria-live="polite">
      {status === "loading" ? (
        <span className={styles.loadingMiniMark} aria-hidden />
      ) : null}
      <span>{status === "loading" ? "Loading diff" : "Diff not loaded"}</span>
      <span className={styles.diffPreparingPath}>{filePath}</span>
    </div>
  );
}
