import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  GitBranch,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  X
} from "lucide-react";

import styles from "./App.module.css";
import {
  fileListRowHeight,
  fileListVisibleWindow,
  nextFileListScrollTopForSelection
} from "./file-list-virtualization.js";
import {
  classList,
  fileListHeaderMetrics,
  reviewState,
  splitPath,
  type ReviewDiffTargetMode
} from "./review-view-model.js";

export function FileListHeader({
  attentionCount,
  baseRefDraft,
  branchRefs,
  disabled,
  files,
  onBaseRefDraftChange,
  onCollapse,
  onUseBranchDiff,
  onUseWorkingTreeDiff,
  onRefresh,
  progress,
  reviewTarget
}: {
  readonly attentionCount: number;
  readonly baseRefDraft: string;
  readonly branchRefs: readonly string[];
  readonly disabled: boolean;
  readonly files: readonly ReviewFileView[];
  readonly onBaseRefDraftChange: (baseRefName: string) => void;
  readonly onCollapse: () => void;
  readonly onUseBranchDiff: (baseRefName: string) => void;
  readonly onUseWorkingTreeDiff: () => void;
  readonly onRefresh: () => void;
  readonly progress: ReviewWorkspaceView["progress"];
  readonly reviewTarget: ReviewWorkspaceView["reviewTarget"];
}): React.JSX.Element {
  const fileProgress = fileListHeaderMetrics({ attentionCount, files });

  return (
    <div className={styles.fileHeader}>
      <div className={styles.fileHeaderTop}>
        <div className={styles.changedCount}>
          <span>{files.length}</span> changed
        </div>
        {attentionCount > 0 ? (
          <div className={styles.needAttention}>
            <span className={styles.attentionPulse} aria-hidden />
            <span>{attentionCount}</span> need attention
          </div>
        ) : null}
        <div className={styles.headerActions}>
          <button
            aria-label="Refresh project"
            className={styles.iconButton}
            onClick={onRefresh}
            title="Refresh"
            type="button"
          >
            <RefreshCw size={14} strokeWidth={1.4} aria-hidden />
          </button>
          <button
            aria-label="Hide file list"
            className={styles.iconButton}
            onClick={onCollapse}
            title="Hide file list"
            type="button"
          >
            <PanelLeftClose size={14} strokeWidth={1.4} aria-hidden />
          </button>
        </div>
      </div>
      <DiffTargetControl
        baseRefDraft={baseRefDraft}
        branchRefs={branchRefs}
        disabled={disabled}
        mode={reviewTarget.kind}
        onBaseRefDraftChange={onBaseRefDraftChange}
        onUseBranchDiff={onUseBranchDiff}
        onUseWorkingTreeDiff={onUseWorkingTreeDiff}
      />
      <div className={styles.progressTrack}>
        <span
          className={styles.progressReviewed}
          style={{
            flexGrow: fileProgress.reviewedCount,
            width: `${String(fileProgress.reviewedPercent)}%`
          }}
        />
        <span
          className={styles.progressAttention}
          style={{
            flexGrow: fileProgress.attentionCount,
            width: `${String(fileProgress.attentionPercent)}%`
          }}
        />
        <span
          className={styles.progressPending}
          style={{
            flexGrow: fileProgress.pendingCount,
            width: `${String(fileProgress.pendingPercent)}%`
          }}
        />
      </div>
      <span className={styles.srOnly}>
        {progress.reviewedVisibleFiles} of {progress.totalVisibleReviewableFiles} files
        reviewed
      </span>
    </div>
  );
}

function DiffTargetControl({
  baseRefDraft,
  branchRefs,
  disabled,
  mode,
  onBaseRefDraftChange,
  onUseBranchDiff,
  onUseWorkingTreeDiff
}: {
  readonly baseRefDraft: string;
  readonly branchRefs: readonly string[];
  readonly disabled: boolean;
  readonly mode: ReviewDiffTargetMode;
  readonly onBaseRefDraftChange: (baseRefName: string) => void;
  readonly onUseBranchDiff: (baseRefName: string) => void;
  readonly onUseWorkingTreeDiff: () => void;
}): React.JSX.Element {
  const selectedBaseRef = mode === "branch" ? baseRefDraft : "";
  const selectBranchRefs = [
    ...new Set([...(baseRefDraft.length > 0 ? [baseRefDraft] : []), ...branchRefs])
  ];

  return (
    <div
      className={classList(
        styles.diffTargetControl,
        mode === "branch" ? styles.diffTargetControlWithReset : undefined
      )}
    >
      <span className={styles.diffTargetLabel}>
        <GitBranch size={13} strokeWidth={1.4} aria-hidden />
        Against
      </span>
      <select
        aria-label="Compare against branch"
        className={styles.baseRefSelect}
        disabled={disabled || selectBranchRefs.length === 0}
        onChange={(event) => {
          const nextBaseRef = event.target.value;

          onBaseRefDraftChange(nextBaseRef);
          if (nextBaseRef.length > 0) {
            onUseBranchDiff(nextBaseRef);
          } else {
            onUseWorkingTreeDiff();
          }
        }}
        title="Compare current state against branch"
        value={selectedBaseRef}
      >
        <option value="">Git changes</option>
        {selectBranchRefs.map((branchRef) => (
          <option key={branchRef} value={branchRef}>
            {branchRef}
          </option>
        ))}
      </select>
      {mode === "branch" ? (
        <button
          aria-label="Reset to Git changes"
          className={styles.iconButton}
          disabled={disabled}
          onClick={onUseWorkingTreeDiff}
          title="Reset to Git changes"
          type="button"
        >
          <X size={14} strokeWidth={1.4} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

export function CollapsedRail({
  files,
  onExpand,
  progress
}: {
  readonly files: readonly ReviewFileView[];
  readonly onExpand: () => void;
  readonly progress: ReviewWorkspaceView["progress"];
}): React.JSX.Element {
  return (
    <aside className={styles.collapsedRail} aria-label="Collapsed file list">
      <button
        aria-label="Show file list"
        className={styles.railButton}
        onClick={onExpand}
        title="Show file list"
        type="button"
      >
        <PanelLeftOpen size={14} strokeWidth={1.4} aria-hidden />
      </button>
      <div className={styles.railDivider} />
      <div className={styles.railDots}>
        {files.map((file) => (
          <span
            className={styles.statusDot}
            data-state={reviewState(file)}
            key={file.path}
            title={file.path}
          />
        ))}
      </div>
      <div className={styles.railReviewLabel}>
        {progress.reviewedVisibleFiles} / {progress.totalVisibleReviewableFiles} reviewed
      </div>
    </aside>
  );
}

export function FileList({
  commentCountByPath,
  files,
  onSelect,
  selectedPath
}: {
  readonly commentCountByPath: ReadonlyMap<string, number>;
  readonly files: readonly ReviewFileView[];
  readonly onSelect: (path: string) => void;
  readonly selectedPath: string | undefined;
}): React.JSX.Element {
  const listRef = useRef<HTMLDivElement>(null);
  const shouldMoveFileListFocusRef = useRef(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const selectedIndex = selectedPath
    ? files.findIndex((file) => file.path === selectedPath)
    : -1;
  const { endIndex, startIndex } = fileListVisibleWindow({
    fileCount: files.length,
    scrollTop,
    viewportHeight
  });
  const renderedFiles = files.slice(startIndex, endIndex);

  useLayoutEffect(() => {
    const listElement = listRef.current;

    if (!listElement) {
      return;
    }

    const updateViewport = (): void => {
      setViewportHeight(listElement.clientHeight);
      setScrollTop(listElement.scrollTop);
    };

    updateViewport();

    const resizeObserver = new ResizeObserver(updateViewport);
    resizeObserver.observe(listElement);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const listElement = listRef.current;

    if (!listElement || selectedIndex < 0) {
      return;
    }

    shouldMoveFileListFocusRef.current =
      document.activeElement instanceof HTMLElement &&
      listElement.contains(document.activeElement) &&
      document.activeElement.matches("button");

    const nextScrollTop = nextFileListScrollTopForSelection({
      clientHeight: listElement.clientHeight,
      currentScrollTop: listElement.scrollTop,
      selectedIndex
    });

    if (nextScrollTop !== listElement.scrollTop) {
      listElement.scrollTop = nextScrollTop;
      setScrollTop(nextScrollTop);
    }
  }, [selectedIndex]);

  useLayoutEffect(() => {
    const listElement = listRef.current;

    if (!listElement || !selectedPath || !shouldMoveFileListFocusRef.current) {
      return;
    }

    const selectedButton = [
      ...listElement.querySelectorAll<HTMLButtonElement>("button[data-file-path]")
    ].find((button) => button.dataset.filePath === selectedPath);

    if (!selectedButton) {
      return;
    }

    selectedButton.focus({ preventScroll: true });
    shouldMoveFileListFocusRef.current = false;
  }, [endIndex, selectedPath, startIndex]);

  return (
    <div
      className={styles.fileList}
      onScroll={(event) => {
        setScrollTop(event.currentTarget.scrollTop);
      }}
      ref={listRef}
    >
      <div
        className={styles.fileListVirtualSpacer}
        style={{ height: `${String(files.length * fileListRowHeight)}px` }}
      >
        <div
          className={styles.fileListVirtualItems}
          style={{
            transform: `translateY(${String(startIndex * fileListRowHeight)}px)`
          }}
        >
          {renderedFiles.map((file, index) => (
            <FileButton
              commentCount={commentCountByPath.get(file.path) ?? 0}
              file={file}
              isSelected={selectedPath === file.path}
              key={file.path}
              onSelect={onSelect}
              position={startIndex + index + 1}
              total={files.length}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export const FileButton = memo(function FileButton({
  commentCount,
  file,
  isSelected,
  onSelect,
  position,
  total
}: {
  readonly commentCount: number;
  readonly file: ReviewFileView;
  readonly isSelected: boolean;
  readonly onSelect: (path: string) => void;
  readonly position: number;
  readonly total: number;
}): React.JSX.Element {
  const parts = splitPath(file.path);

  return (
    <button
      aria-label={`${parts.filename} ${file.status}${file.invalidated ? " changed after review" : ""}`}
      aria-posinset={position}
      aria-setsize={total}
      className={styles.fileItem}
      data-file-path={file.path}
      data-selected={isSelected}
      onClick={() => {
        onSelect(file.path);
      }}
      type="button"
    >
      <span className={styles.statusDot} data-state={reviewState(file)} />
      <span className={styles.fileCopy}>
        <span className={styles.fileNameLine}>
          <span className={styles.fileName}>{parts.filename}</span>
          {file.invalidated ? (
            <span className={styles.attentionPulse} aria-hidden />
          ) : null}
          {commentCount > 0 ? (
            <span className={styles.commentBadge} title="Review comments">
              <MessageSquare size={11} strokeWidth={1.5} aria-hidden />
              {commentCount}
            </span>
          ) : null}
        </span>
        <span className={styles.fileDir}>{parts.dirname}</span>
      </span>
      <DiffStats additions={file.additions} deletions={file.deletions} />
    </button>
  );
});

function DiffStats({
  additions,
  deletions
}: {
  readonly additions: number;
  readonly deletions: number;
}): React.JSX.Element {
  const total = Math.max(additions + deletions, 1);
  const addBlocks = Math.round((additions / total) * 5);

  return (
    <span className={styles.fileStats}>
      <span className={styles.addText}>+{additions}</span>
      <span className={styles.delText}>-{deletions}</span>
      <span className={styles.statsBar} aria-hidden>
        {Array.from({ length: 5 }, (_, index) => (
          <span data-kind={index < addBlocks ? "add" : "del"} key={String(index)} />
        ))}
      </span>
    </span>
  );
}
