import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  Check,
  ChevronDown,
  ExternalLink,
  FolderOpen,
  GitBranch,
  GitCommitHorizontal,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  X
} from "lucide-react";

import styles from "./file-list.module.css";
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
  commitRefDraft,
  disabled,
  files,
  onBaseRefDraftChange,
  onCommitRefDraftChange,
  onCollapse,
  onUseBranchDiff,
  onUseCommitDiff,
  onUseWorkingTreeDiff,
  onRefresh,
  progress,
  recentCommits,
  reviewTarget
}: {
  readonly attentionCount: number;
  readonly baseRefDraft: string;
  readonly branchRefs: readonly string[];
  readonly commitRefDraft: string;
  readonly disabled: boolean;
  readonly files: readonly ReviewFileView[];
  readonly onBaseRefDraftChange: (baseRefName: string) => void;
  readonly onCommitRefDraftChange: (commitRef: string) => void;
  readonly onCollapse: () => void;
  readonly onUseBranchDiff: (baseRefName: string) => void;
  readonly onUseCommitDiff: (commitRef: string) => void;
  readonly onUseWorkingTreeDiff: () => void;
  readonly onRefresh: () => void;
  readonly progress: ReviewWorkspaceView["progress"];
  readonly recentCommits: readonly RecentCommitView[];
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
        commitRefDraft={commitRefDraft}
        disabled={disabled}
        mode={reviewTarget.kind}
        onBaseRefDraftChange={onBaseRefDraftChange}
        onCommitRefDraftChange={onCommitRefDraftChange}
        onUseBranchDiff={onUseBranchDiff}
        onUseCommitDiff={onUseCommitDiff}
        onUseWorkingTreeDiff={onUseWorkingTreeDiff}
        recentCommits={recentCommits}
        reviewTarget={reviewTarget}
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

type DiffTargetPickerMode = "branch" | "changes" | "commit";

export function DiffTargetControl({
  baseRefDraft,
  branchRefs,
  commitRefDraft,
  disabled,
  initialOpen = false,
  mode,
  onBaseRefDraftChange,
  onCommitRefDraftChange,
  onUseBranchDiff,
  onUseCommitDiff,
  onUseWorkingTreeDiff,
  recentCommits,
  reviewTarget
}: {
  readonly baseRefDraft: string;
  readonly branchRefs: readonly string[];
  readonly commitRefDraft: string;
  readonly disabled: boolean;
  readonly initialOpen?: boolean;
  readonly mode: ReviewDiffTargetMode;
  readonly onBaseRefDraftChange: (baseRefName: string) => void;
  readonly onCommitRefDraftChange: (commitRef: string) => void;
  readonly onUseBranchDiff: (baseRefName: string) => void;
  readonly onUseCommitDiff: (commitRef: string) => void;
  readonly onUseWorkingTreeDiff: () => void;
  readonly recentCommits: readonly RecentCommitView[];
  readonly reviewTarget: ReviewWorkspaceView["reviewTarget"];
}): React.JSX.Element {
  const pickerId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(initialOpen);
  const [activeMode, setActiveMode] = useState<DiffTargetPickerMode>(
    pickerModeForReviewMode(mode)
  );
  const [query, setQuery] = useState("");
  const selectBranchRefs = [
    ...new Set([...(baseRefDraft.length > 0 ? [baseRefDraft] : []), ...branchRefs])
  ];
  const selectCommits = selectedCommitOptions(recentCommits, reviewTarget);
  const filteredBranchRefs = useMemo(
    () => filterTextOptions(selectBranchRefs, query),
    [query, selectBranchRefs]
  );
  const filteredCommits = useMemo(
    () => filterCommitOptions(selectCommits, query),
    [query, selectCommits]
  );
  const hasReset = mode === "branch" || mode === "commit";
  const triggerLabel = diffTargetTriggerLabel({
    baseRefDraft,
    commitRefDraft,
    mode,
    reviewTarget
  });

  useEffect(() => {
    if (disabled) {
      setOpen(false);
    }
  }, [disabled]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function closeOnOutsidePointer(event: PointerEvent): void {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function openPicker(): void {
    if (disabled) {
      return;
    }

    setActiveMode(pickerModeForReviewMode(mode));
    setQuery("");
    setOpen((isOpen) => !isOpen);
  }

  function selectMode(nextMode: DiffTargetPickerMode): void {
    setActiveMode(nextMode);
    setQuery("");
  }

  function selectWorkingTree(): void {
    setOpen(false);

    if (mode !== "working_tree") {
      onUseWorkingTreeDiff();
    }
  }

  function selectBranch(branchRef: string): void {
    setOpen(false);
    onBaseRefDraftChange(branchRef);
    onUseBranchDiff(branchRef);
  }

  function selectCommit(commitRef: string): void {
    const trimmedCommitRef = commitRef.trim();

    if (trimmedCommitRef.length === 0) {
      return;
    }

    setOpen(false);
    onCommitRefDraftChange(trimmedCommitRef);
    onUseCommitDiff(trimmedCommitRef);
  }

  function submitCommitRef(event: { preventDefault: () => void }): void {
    event.preventDefault();
    selectCommit(query.length > 0 ? query : commitRefDraft);
  }

  return (
    <div
      ref={rootRef}
      className={classList(
        styles.diffTargetControl,
        hasReset ? styles.diffTargetControlWithReset : undefined
      )}
    >
      <span className={styles.diffTargetLabel}>
        {mode === "commit" ? (
          <GitCommitHorizontal size={13} strokeWidth={1.4} aria-hidden />
        ) : (
          <GitBranch size={13} strokeWidth={1.4} aria-hidden />
        )}
        {mode === "commit" ? "Commit" : "Against"}
      </span>
      <button
        aria-label="Choose diff target"
        aria-controls={open ? pickerId : undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={styles.diffTargetTrigger}
        disabled={disabled}
        onClick={openPicker}
        title="Choose diff target"
        type="button"
      >
        <span>{triggerLabel}</span>
        <ChevronDown size={13} strokeWidth={1.5} aria-hidden />
      </button>
      {hasReset ? (
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
      {open ? (
        <div
          aria-label="Diff target"
          className={styles.diffTargetPopover}
          id={pickerId}
          role="dialog"
        >
          <div
            aria-label="Diff target type"
            className={styles.diffTargetTabs}
            role="tablist"
          >
            <button
              aria-selected={activeMode === "changes"}
              className={styles.diffTargetTab}
              onClick={selectWorkingTree}
              role="tab"
              type="button"
            >
              Git changes
            </button>
            <button
              aria-selected={activeMode === "branch"}
              className={styles.diffTargetTab}
              onClick={() => {
                selectMode("branch");
              }}
              role="tab"
              type="button"
            >
              Branch
            </button>
            <button
              aria-selected={activeMode === "commit"}
              className={styles.diffTargetTab}
              onClick={() => {
                selectMode("commit");
              }}
              role="tab"
              type="button"
            >
              Commit
            </button>
          </div>
          {activeMode === "branch" ? (
            <div className={styles.diffTargetPanel}>
              <input
                aria-label="Search branches"
                className={styles.diffTargetSearch}
                onChange={(event) => {
                  setQuery(event.target.value);
                }}
                placeholder="Search branches"
                type="search"
                value={query}
              />
              <div
                aria-label="Branches"
                className={styles.diffTargetOptions}
                role="listbox"
              >
                {filteredBranchRefs.map((branchRef) => (
                  <button
                    className={styles.diffTargetOption}
                    data-active={mode === "branch" && branchRef === baseRefDraft}
                    key={branchRef}
                    onClick={() => {
                      selectBranch(branchRef);
                    }}
                    role="option"
                    type="button"
                  >
                    <span className={styles.diffTargetOptionIcon}>
                      {mode === "branch" && branchRef === baseRefDraft ? (
                        <Check size={13} strokeWidth={1.6} aria-hidden />
                      ) : null}
                    </span>
                    <span className={styles.diffTargetOptionMain}>{branchRef}</span>
                  </button>
                ))}
                {filteredBranchRefs.length === 0 ? (
                  <div className={styles.diffTargetEmpty}>No branches</div>
                ) : null}
              </div>
            </div>
          ) : null}
          {activeMode === "commit" ? (
            <div className={styles.diffTargetPanel}>
              <form className={styles.diffTargetCommitForm} onSubmit={submitCommitRef}>
                <input
                  aria-label="Commit SHA or ref"
                  className={styles.diffTargetSearch}
                  onChange={(event) => {
                    setQuery(event.target.value);
                  }}
                  placeholder="Paste SHA or search commits"
                  type="search"
                  value={query}
                />
                <button
                  className={styles.diffTargetUseButton}
                  disabled={
                    query.trim().length === 0 && commitRefDraft.trim().length === 0
                  }
                  type="submit"
                >
                  Use
                </button>
              </form>
              <div
                aria-label="Recent commits"
                className={styles.diffTargetOptions}
                role="listbox"
              >
                {filteredCommits.map((commit) => (
                  <button
                    className={styles.diffTargetOption}
                    data-active={mode === "commit" && commit.sha === commitRefDraft}
                    key={commit.sha}
                    onClick={() => {
                      selectCommit(commit.sha);
                    }}
                    role="option"
                    type="button"
                  >
                    <span className={styles.diffTargetOptionIcon}>
                      {mode === "commit" && commit.sha === commitRefDraft ? (
                        <Check size={13} strokeWidth={1.6} aria-hidden />
                      ) : null}
                    </span>
                    <span className={styles.diffTargetCommitText}>
                      <span className={styles.diffTargetCommitSha}>
                        {commit.shortSha}
                      </span>
                      <span className={styles.diffTargetCommitSubject}>
                        {commit.subject}
                      </span>
                    </span>
                  </button>
                ))}
                {filteredCommits.length === 0 ? (
                  <div className={styles.diffTargetEmpty}>No recent commits</div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function selectedCommitOptions(
  recentCommits: readonly RecentCommitView[],
  reviewTarget: ReviewWorkspaceView["reviewTarget"]
): readonly RecentCommitView[] {
  if (reviewTarget.kind !== "commit" || !reviewTarget.commitSha) {
    return recentCommits;
  }

  if (recentCommits.some((commit) => commit.sha === reviewTarget.commitSha)) {
    return recentCommits;
  }

  return [
    {
      authoredAt: "",
      sha: reviewTarget.commitSha,
      shortSha: reviewTarget.commitShortSha ?? reviewTarget.commitSha.slice(0, 12),
      subject: `Selected: ${reviewTarget.commitSubject ?? "commit outside recent list"}`
    },
    ...recentCommits
  ];
}

export function commitOptionLabel(commit: RecentCommitView): string {
  return `${commit.shortSha} ${commit.subject}`.trim();
}

function pickerModeForReviewMode(mode: ReviewDiffTargetMode): DiffTargetPickerMode {
  return mode === "working_tree" ? "changes" : mode;
}

function diffTargetTriggerLabel({
  baseRefDraft,
  commitRefDraft,
  mode,
  reviewTarget
}: {
  readonly baseRefDraft: string;
  readonly commitRefDraft: string;
  readonly mode: ReviewDiffTargetMode;
  readonly reviewTarget: ReviewWorkspaceView["reviewTarget"];
}): string {
  if (mode === "branch") {
    return firstNonEmptyString(baseRefDraft, reviewTarget.baseRefName, "Branch");
  }

  if (mode === "commit") {
    return firstNonEmptyString(
      reviewTarget.commitSubject?.trim(),
      reviewTarget.commitShortSha,
      commitRefDraft.slice(0, 12),
      "Commit"
    );
  }

  return "Git changes";
}

function firstNonEmptyString(...values: readonly (string | undefined)[]): string {
  return values.find((value) => value !== undefined && value.length > 0) ?? "";
}

function filterTextOptions(options: readonly string[], query: string): readonly string[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (normalizedQuery.length === 0) {
    return options;
  }

  return options.filter((option) => option.toLowerCase().includes(normalizedQuery));
}

function filterCommitOptions(
  commits: readonly RecentCommitView[],
  query: string
): readonly RecentCommitView[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (normalizedQuery.length === 0) {
    return commits;
  }

  return commits.filter((commit) =>
    [commit.sha, commit.shortSha, commit.subject]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery)
  );
}

export function CollapsedRail({
  disabled = false,
  files,
  onExpand,
  progress
}: {
  readonly disabled?: boolean;
  readonly files: readonly ReviewFileView[];
  readonly onExpand: () => void;
  readonly progress: ReviewWorkspaceView["progress"];
}): React.JSX.Element {
  return (
    <aside
      className={styles.collapsedRail}
      aria-disabled={disabled}
      aria-label="Collapsed file list"
    >
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
  onOpenInEditor,
  onSelect,
  onShowInFinder,
  projectId,
  selectedPath
}: {
  readonly commentCountByPath: ReadonlyMap<string, number>;
  readonly files: readonly ReviewFileView[];
  readonly onOpenInEditor: (path: string) => void;
  readonly onSelect: (path: string) => void;
  readonly onShowInFinder: (path: string) => void;
  readonly projectId: string;
  readonly selectedPath: string | undefined;
}): React.JSX.Element {
  const listRef = useRef<HTMLDivElement>(null);
  const contextMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const contextSelectedPathRef = useRef<string | undefined>(undefined);
  const currentSelectedPathRef = useRef(selectedPath);
  const shouldMoveFileListFocusRef = useRef(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [contextMenu, setContextMenu] = useState<{
    readonly disabled: boolean;
    readonly filePath: string;
    readonly left: number;
    readonly top: number;
  }>();
  const [viewportHeight, setViewportHeight] = useState(0);
  const dismissContextMenu = useCallback(() => {
    setContextMenu(undefined);
    contextMenuTriggerRef.current = null;
  }, []);
  const closeContextMenu = useCallback(() => {
    setContextMenu(undefined);

    const trigger = contextMenuTriggerRef.current;
    contextMenuTriggerRef.current = null;

    if (trigger?.isConnected) {
      trigger.focus({ preventScroll: true });
    }
  }, []);
  const openContextMenu = useCallback(
    (file: ReviewFileView, event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      const invokedByKeyboard = event.clientX === 0 && event.clientY === 0;
      const triggerBounds = event.currentTarget.getBoundingClientRect();
      const invocationX = invokedByKeyboard ? triggerBounds.left + 12 : event.clientX;
      const invocationY = invokedByKeyboard ? triggerBounds.bottom : event.clientY;
      contextSelectedPathRef.current =
        currentSelectedPathRef.current === file.path ? undefined : file.path;
      onSelect(file.path);
      contextMenuTriggerRef.current = event.currentTarget;
      setContextMenu({
        disabled: file.status === "deleted",
        filePath: file.path,
        left: Math.max(8, Math.min(invocationX, window.innerWidth - 204)),
        top: Math.max(8, Math.min(invocationY, window.innerHeight - 84))
      });
    },
    [onSelect]
  );
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
    currentSelectedPathRef.current = selectedPath;
  }, [selectedPath]);

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
    dismissContextMenu();
  }, [dismissContextMenu, projectId]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const currentFile = files.find((file) => file.path === contextMenu.filePath);

    if (!currentFile) {
      dismissContextMenu();
      return;
    }

    const disabled = currentFile.status === "deleted";

    if (disabled !== contextMenu.disabled) {
      setContextMenu((currentMenu) =>
        currentMenu?.filePath === contextMenu.filePath
          ? { ...currentMenu, disabled }
          : currentMenu
      );
    }
  }, [contextMenu, dismissContextMenu, files]);

  useEffect(() => {
    const listElement = listRef.current;

    if (!listElement || selectedIndex < 0) {
      return;
    }

    if (contextSelectedPathRef.current === selectedPath) {
      contextSelectedPathRef.current = undefined;
      return;
    }

    contextSelectedPathRef.current = undefined;

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
        closeContextMenu();
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
              onContextMenu={openContextMenu}
              onSelect={onSelect}
              position={startIndex + index + 1}
              total={files.length}
            />
          ))}
        </div>
      </div>
      {contextMenu ? (
        <FileContextMenu
          disabled={contextMenu.disabled}
          filePath={contextMenu.filePath}
          left={contextMenu.left}
          onClose={closeContextMenu}
          onDismiss={dismissContextMenu}
          onOpenInEditor={onOpenInEditor}
          onShowInFinder={onShowInFinder}
          top={contextMenu.top}
        />
      ) : null}
    </div>
  );
}

export function FileContextMenu({
  disabled = false,
  filePath,
  left,
  onClose,
  onDismiss,
  onOpenInEditor,
  onShowInFinder,
  top
}: {
  readonly disabled?: boolean;
  readonly filePath: string;
  readonly left: number;
  readonly onClose: () => void;
  readonly onDismiss: () => void;
  readonly onOpenInEditor: (path: string) => void;
  readonly onShowInFinder: (path: string) => void;
  readonly top: number;
}): React.JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null);
  const filename = splitPath(filePath).filename;

  useEffect(() => {
    const menu = menuRef.current;
    const firstEnabledItem = menu?.querySelector<HTMLButtonElement>(
      "[role='menuitem']:not(:disabled)"
    );
    (firstEnabledItem ?? menu)?.focus();

    function closeOnOutsidePointer(event: PointerEvent): void {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        onClose();
      }
    }

    function closeOnFocusOutside(event: FocusEvent): void {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        onDismiss();
      }
    }

    function closeOnWindowChange(): void {
      onClose();
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("focusin", closeOnFocusOutside);
    window.addEventListener("blur", closeOnWindowChange);
    window.addEventListener("resize", closeOnWindowChange);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("focusin", closeOnFocusOutside);
      window.removeEventListener("blur", closeOnWindowChange);
      window.removeEventListener("resize", closeOnWindowChange);
    };
  }, [onClose, onDismiss]);

  function runAction(action: (path: string) => void): void {
    action(filePath);
    onClose();
  }

  return (
    <div
      aria-label={`File actions for ${filename}`}
      className={styles.fileContextMenu}
      onContextMenu={(event) => {
        event.preventDefault();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
          return;
        }

        const items = [
          ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
            "[role='menuitem']:not(:disabled)"
          )
        ];
        const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
        const direction =
          event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;

        if (direction !== 0 && items.length > 0) {
          event.preventDefault();
          items[(currentIndex + direction + items.length) % items.length]?.focus();
        }
      }}
      ref={menuRef}
      role="menu"
      style={{ left, top }}
      tabIndex={-1}
    >
      <button
        disabled={disabled}
        onClick={() => {
          runAction(onOpenInEditor);
        }}
        role="menuitem"
        tabIndex={-1}
        type="button"
      >
        <ExternalLink size={14} strokeWidth={1.4} aria-hidden />
        Open in Editor
      </button>
      <button
        disabled={disabled}
        onClick={() => {
          runAction(onShowInFinder);
        }}
        role="menuitem"
        tabIndex={-1}
        type="button"
      >
        <FolderOpen size={14} strokeWidth={1.4} aria-hidden />
        Show in Finder
      </button>
    </div>
  );
}

export const FileButton = memo(function FileButton({
  commentCount,
  file,
  isSelected,
  onContextMenu,
  onSelect,
  position,
  total
}: {
  readonly commentCount: number;
  readonly file: ReviewFileView;
  readonly isSelected: boolean;
  readonly onContextMenu?: (
    file: ReviewFileView,
    event: React.MouseEvent<HTMLButtonElement>
  ) => void;
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
      onContextMenu={(event) => {
        onContextMenu?.(file, event);
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
