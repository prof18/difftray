import styles from "./workspace-loading.module.css";
import { type WorkspaceLoadStatus } from "./workspace-load-status.js";

export function TabLoadBanner({
  status
}: {
  readonly status: WorkspaceLoadStatus;
}): React.JSX.Element {
  return (
    <div className={styles.tabLoadBanner} role="status" aria-live="polite">
      <div className={styles.tabLoadCopy}>
        <span className={styles.loadingMiniMark} aria-hidden />
        <span className={styles.tabLoadTitle}>{status.title}</span>
        <span className={styles.tabLoadDetail}>{status.detail}</span>
      </div>
      <LoadingProgress status={status} />
    </div>
  );
}

export function LoadingProgress({
  status
}: {
  readonly status: WorkspaceLoadStatus;
}): React.JSX.Element | null {
  if (
    status.loadedFiles === undefined ||
    status.totalFiles === undefined ||
    status.totalFiles <= 0
  ) {
    return null;
  }

  const progress = Math.min(1, Math.max(0, status.loadedFiles / status.totalFiles));

  return (
    <div
      className={styles.loadingProgress}
      aria-label={`${String(status.loadedFiles)} of ${String(status.totalFiles)} files loaded`}
    >
      <div
        className={styles.loadingProgressBar}
        style={{ width: `${String(progress * 100)}%` }}
      />
    </div>
  );
}
