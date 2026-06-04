import { useEffect } from "react";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Diff,
  Folder,
  FolderOpen,
  X
} from "lucide-react";

import styles from "./app-status-views.module.css";
import { splitPath } from "./review-view-model.js";

export function EmptyState({
  disabled,
  onOpenProject,
  onSelectProject,
  projects
}: {
  readonly disabled: boolean;
  readonly onOpenProject: () => void;
  readonly onSelectProject: (projectId: string) => void;
  readonly projects: readonly RecentProjectView[];
}): React.JSX.Element {
  return (
    <section className={styles.emptyState} aria-label="No repository open">
      <div className={styles.emptyIcon}>
        <Diff size={30} strokeWidth={1.35} aria-hidden />
      </div>
      <h1>No repository open</h1>
      <p>
        Open a Git repository to start reviewing local changes. Difftray tracks what
        you&apos;ve reviewed and re-flags files when the diff drifts.
      </p>
      <button
        className={styles.primaryButton}
        disabled={disabled}
        onClick={onOpenProject}
        type="button"
      >
        <FolderOpen size={15} strokeWidth={1.4} aria-hidden />
        Open Repository
        <kbd>⌘O</kbd>
      </button>
      {projects.length > 0 ? (
        <div className={styles.recentBox}>
          <div className={styles.sectionLabel}>Recent</div>
          {projects.slice(0, 5).map((project) => (
            <button
              className={styles.recentRow}
              key={project.id}
              onClick={() => {
                onSelectProject(project.id);
              }}
              type="button"
            >
              <Folder size={14} strokeWidth={1.4} aria-hidden />
              <span>
                <strong>{project.name}</strong>
                <small>{project.path}</small>
              </span>
              <ChevronRight size={14} strokeWidth={1.4} aria-hidden />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function DriftToast({
  files,
  onClose,
  onReviewNow
}: {
  readonly files: readonly ReviewFileView[];
  readonly onClose: () => void;
  readonly onReviewNow: () => void;
}): React.JSX.Element {
  useEffect(() => {
    const timeout = window.setTimeout(onClose, 8_000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [onClose]);

  return (
    <aside className={styles.driftToast} role="status">
      <div className={styles.toastStrip} />
      <div className={styles.toastBody}>
        <div className={styles.toastIcon}>
          <AlertTriangle size={16} strokeWidth={1.4} aria-hidden />
        </div>
        <div className={styles.toastContent}>
          <strong>{files.length} reviewed files drifted</strong>
          <p>Previously reviewed diffs changed and need another look.</p>
          <div className={styles.toastFiles}>
            {files.slice(0, 3).map((file) => (
              <div className={styles.toastFile} key={file.path}>
                <span className={styles.attentionPulse} aria-hidden />
                <span>{splitPath(file.path).filename}</span>
                <small>
                  +{file.additions} -{file.deletions}
                </small>
              </div>
            ))}
          </div>
          <div className={styles.toastActions}>
            <button
              className={styles.secondaryButton}
              onClick={onReviewNow}
              type="button"
            >
              Review now
            </button>
            <button className={styles.ghostButton} onClick={onClose} type="button">
              Dismiss
            </button>
          </div>
        </div>
        <button
          aria-label="Dismiss drift notification"
          className={styles.iconButton}
          onClick={onClose}
          title="Dismiss"
          type="button"
        >
          <X size={14} strokeWidth={1.4} aria-hidden />
        </button>
      </div>
    </aside>
  );
}

export function SimpleToast({
  message
}: {
  readonly message: string;
}): React.JSX.Element {
  return (
    <aside className={styles.simpleToast} role="status">
      <Check size={15} strokeWidth={1.5} aria-hidden />
      <span>{message}</span>
    </aside>
  );
}
