import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  FolderOpen,
  GitBranch,
  RefreshCw,
  Search
} from "lucide-react";

import styles from "./App.module.css";

type LoadState = "idle" | "loading";

export function App(): React.JSX.Element {
  const [error, setError] = useState<string | undefined>();
  const [filter, setFilter] = useState("");
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [recentProjects, setRecentProjects] = useState<readonly RecentProjectView[]>([]);
  const [reviewedExpanded, setReviewedExpanded] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | undefined>();
  const [workspace, setWorkspace] = useState<ReviewWorkspaceView | undefined>();
  const filterInputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    void refreshRecentProjects();
  }, []);

  const visibleFiles = useMemo(() => {
    const normalizedFilter = filter.trim().toLowerCase();

    return workspace
      ? workspace.files.filter(
          (file) =>
            file.visible &&
            (normalizedFilter.length === 0 ||
              file.path.toLowerCase().includes(normalizedFilter))
        )
      : [];
  }, [filter, workspace]);
  const pendingFiles = visibleFiles.filter((file) => !file.reviewed);
  const reviewedFiles = visibleFiles.filter((file) => file.reviewed);
  const keyboardFiles = reviewedExpanded ? visibleFiles : pendingFiles;
  const selectedFile =
    visibleFiles.find((file) => file.path === selectedPath) ?? visibleFiles[0];

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.defaultPrevented || loadState === "loading") {
        return;
      }

      const target = event.target;
      const isTextInput =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.code;

      if (event.metaKey && event.key.toLowerCase() === "r") {
        event.preventDefault();
        void refreshWorkspace();
        return;
      }

      if (event.metaKey && /^[1-9]$/.test(event.key)) {
        const project = recentProjects[Number(event.key) - 1];

        if (project) {
          event.preventDefault();
          void loadProject(project.id);
        }

        return;
      }

      if (isTextInput) {
        if (key === "Escape" && target instanceof HTMLElement) {
          event.preventDefault();
          target.blur();
        }

        return;
      }

      switch (key) {
        case "j":
        case "KeyJ":
          event.preventDefault();
          selectRelativeFile(1);
          break;
        case "k":
        case "KeyK":
          event.preventDefault();
          selectRelativeFile(-1);
          break;
        case " ":
        case "Space":
          event.preventDefault();
          void markSelectedReviewed();
          break;
        case "u":
        case "KeyU":
          event.preventDefault();
          void toggleSelectedReviewed();
          break;
        case "Enter":
        case "o":
        case "KeyO":
          event.preventDefault();
          void openSelectedInEditor();
          break;
        case "f":
        case "KeyF":
          event.preventDefault();
          filterInputRef.current?.focus();
          filterInputRef.current?.select();
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  });

  async function refreshRecentProjects(): Promise<void> {
    setRecentProjects(await window.difftray.listRecentProjects());
  }

  async function runWorkspaceLoad(
    loadWorkspace: () => Promise<ReviewWorkspaceView | null>,
    nextPath?: string
  ): Promise<void> {
    setError(undefined);
    setLoadState("loading");

    try {
      const nextWorkspace = await loadWorkspace();

      if (nextWorkspace) {
        setWorkspace(nextWorkspace);
        setSelectedPath(nextPath ?? firstVisiblePath(nextWorkspace));
        await refreshRecentProjects();
      }
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    } finally {
      setLoadState("idle");
    }
  }

  async function openProject(): Promise<void> {
    await runWorkspaceLoad(() => window.difftray.openProject());
  }

  async function loadProject(projectId: string): Promise<void> {
    await runWorkspaceLoad(() => window.difftray.loadProject(projectId));
  }

  async function refreshWorkspace(): Promise<void> {
    if (!workspace) {
      return;
    }

    await runWorkspaceLoad(
      () => window.difftray.loadProject(workspace.project.id),
      selectedFile?.path
    );
  }

  function selectRelativeFile(offset: 1 | -1): void {
    if (keyboardFiles.length === 0) {
      return;
    }

    const selectedIndex = selectedFile
      ? keyboardFiles.findIndex((file) => file.path === selectedFile.path)
      : -1;
    const nextIndex =
      selectedIndex === -1
        ? offset > 0
          ? 0
          : keyboardFiles.length - 1
        : clampIndex(selectedIndex + offset, keyboardFiles.length);
    const nextFile = keyboardFiles[nextIndex];

    if (nextFile) {
      setSelectedPath(nextFile.path);
    }
  }

  async function markSelectedReviewed(): Promise<void> {
    if (!workspace || !selectedFile || selectedFile.reviewed) {
      return;
    }

    setError(undefined);
    setLoadState("loading");

    try {
      const result = await window.difftray.markFileReviewed({
        displayedDiffHash: selectedFile.diffHash,
        path: selectedFile.path,
        projectId: workspace.project.id,
        reviewTargetId: workspace.reviewTarget.id
      });
      const nextWorkspace = result.workspace;
      const nextPath =
        nextPendingPath(nextWorkspace, selectedFile.path, filter) ??
        firstVisiblePath(nextWorkspace);

      setWorkspace(nextWorkspace);
      setSelectedPath(nextPath);
      setReviewedExpanded(false);

      if (result.status === "rejected") {
        setError(
          result.reason === "stale_diff"
            ? "The diff changed before it could be marked reviewed."
            : "The selected file is no longer present in this review."
        );
      }
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    } finally {
      setLoadState("idle");
    }
  }

  async function unmarkSelectedReviewed(): Promise<void> {
    if (!workspace || selectedFile?.reviewed !== true) {
      return;
    }

    setError(undefined);
    setLoadState("loading");

    try {
      const result = await window.difftray.unmarkFileReviewed({
        displayedDiffHash: selectedFile.diffHash,
        path: selectedFile.path,
        projectId: workspace.project.id,
        reviewTargetId: workspace.reviewTarget.id
      });

      setWorkspace(result.workspace);
      setSelectedPath(selectedFile.path);
      setReviewedExpanded(false);

      if (result.status === "rejected") {
        setError(
          result.reason === "stale_diff"
            ? "The diff changed before it could be unmarked."
            : "The selected file is no longer present in this review."
        );
      }
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    } finally {
      setLoadState("idle");
    }
  }

  async function toggleSelectedReviewed(): Promise<void> {
    if (selectedFile?.reviewed) {
      await unmarkSelectedReviewed();
      return;
    }

    await markSelectedReviewed();
  }

  async function openSelectedInEditor(): Promise<void> {
    if (!workspace || !selectedFile) {
      return;
    }

    setError(undefined);

    try {
      const result = await window.difftray.openFileInEditor({
        path: selectedFile.path,
        projectId: workspace.project.id
      });

      if (result.status === "rejected") {
        setError(
          result.reason === "file_missing"
            ? "The selected file cannot be opened from the current working tree."
            : "The selected file could not be opened in the configured editor."
        );
      }
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    }
  }

  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar} aria-label="Projects">
        <div className={styles.brandRow}>
          <div className={styles.brandMark}>D</div>
          <div>
            <div className={styles.brandName}>Difftray</div>
            <div className={styles.brandSubtle}>local review desk</div>
          </div>
        </div>

        <button
          className={styles.openButton}
          disabled={loadState === "loading"}
          onClick={() => {
            void openProject();
          }}
          type="button"
        >
          <FolderOpen size={16} aria-hidden />
          Open Repository
        </button>

        <div className={styles.projectList}>
          {recentProjects.map((project) => (
            <button
              className={styles.projectItem}
              data-active={workspace?.project.id === project.id}
              key={project.id}
              onClick={() => {
                void loadProject(project.id);
              }}
              type="button"
            >
              <span className={styles.projectGlyph} />
              <span className={styles.projectCopy}>
                <span className={styles.projectName}>{project.name}</span>
                <span className={styles.projectMeta}>{project.path}</span>
              </span>
              <ChevronRight size={15} aria-hidden />
            </button>
          ))}
        </div>
      </aside>

      <section className={styles.workspace} aria-label="Review workspace">
        <header className={styles.toolbar}>
          <div className={styles.targetBlock}>
            <div className={styles.targetTitle}>
              {workspace ? workspace.project.name : "No repository open"}
            </div>
            <div className={styles.targetMeta}>
              <GitBranch size={14} aria-hidden />
              {workspace
                ? `${workspace.reviewTarget.headRefName ?? "detached"} · working tree`
                : "open a local Git repository"}
            </div>
          </div>

          <div className={styles.toolbarActions}>
            <label className={styles.searchBox}>
              <Search size={15} aria-hidden />
              <input
                disabled={!workspace}
                ref={filterInputRef}
                onChange={(event) => {
                  setFilter(event.target.value);
                }}
                placeholder="Filter files"
                type="search"
                value={filter}
              />
            </label>
            <button
              aria-label="Refresh project"
              className={styles.iconButton}
              disabled={!workspace || loadState === "loading"}
              onClick={() => {
                void refreshWorkspace();
              }}
              title="Refresh"
              type="button"
            >
              <RefreshCw size={16} aria-hidden />
            </button>
          </div>
        </header>

        {error ? <div className={styles.errorBanner}>{error}</div> : null}

        {workspace ? (
          <div className={styles.reviewGrid}>
            <nav className={styles.filePane} aria-label="Changed files">
              <div className={styles.filePaneHeader}>
                <span>Changed files</span>
                <span className={styles.progressPill}>
                  {workspace.progress.reviewedVisibleFiles}/
                  {workspace.progress.totalVisibleReviewableFiles}
                </span>
              </div>

              <div className={styles.fileList}>
                {pendingFiles.map((file) => (
                  <FileButton
                    file={file}
                    isSelected={selectedFile?.path === file.path}
                    key={file.path}
                    onSelect={setSelectedPath}
                  />
                ))}

                {reviewedFiles.length > 0 ? (
                  <div className={styles.reviewedGroup}>
                    <button
                      className={styles.reviewedToggle}
                      onClick={() => {
                        setReviewedExpanded((expanded) => !expanded);
                      }}
                      type="button"
                    >
                      {reviewedExpanded ? (
                        <ChevronDown size={15} aria-hidden />
                      ) : (
                        <ChevronRight size={15} aria-hidden />
                      )}
                      <span>{reviewedFiles.length} reviewed</span>
                    </button>

                    {reviewedExpanded
                      ? reviewedFiles.map((file) => (
                          <FileButton
                            file={file}
                            isSelected={selectedFile?.path === file.path}
                            key={file.path}
                            onSelect={setSelectedPath}
                          />
                        ))
                      : null}
                  </div>
                ) : null}
              </div>
            </nav>

            <article className={styles.diffPane} aria-label="Diff preview">
              {selectedFile ? (
                <>
                  <div className={styles.diffHeader}>
                    <span className={styles.diffPath}>{selectedFile.path}</span>
                    <button
                      className={styles.reviewButton}
                      data-reviewed={selectedFile.reviewed}
                      disabled={loadState === "loading"}
                      onClick={() => {
                        void toggleSelectedReviewed();
                      }}
                      type="button"
                    >
                      {selectedFile.reviewed ? (
                        <CheckCircle2 size={16} aria-hidden />
                      ) : (
                        <Check size={16} aria-hidden />
                      )}
                      {selectedFile.reviewed ? "Reviewed" : "Mark reviewed"}
                    </button>
                  </div>
                  <DiffSurface patch={selectedFile.patch} />
                </>
              ) : (
                <div className={styles.emptyState}>No changed files</div>
              )}
            </article>
          </div>
        ) : (
          <div className={styles.emptyState}>
            <button
              className={styles.emptyOpenButton}
              disabled={loadState === "loading"}
              onClick={() => {
                void openProject();
              }}
              type="button"
            >
              <FolderOpen size={18} aria-hidden />
              Open Repository
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

function FileButton({
  file,
  isSelected,
  onSelect
}: {
  readonly file: ReviewFileView;
  readonly isSelected: boolean;
  readonly onSelect: (path: string) => void;
}): React.JSX.Element {
  return (
    <button
      className={styles.fileItem}
      data-selected={isSelected}
      onClick={() => {
        onSelect(file.path);
      }}
      type="button"
    >
      {file.reviewed ? (
        <CheckCircle2 className={styles.reviewedIcon} size={17} aria-hidden />
      ) : (
        <Circle className={styles.pendingIcon} size={17} aria-hidden />
      )}
      <span className={styles.fileCopy}>
        <span className={styles.filePath}>{file.path}</span>
        <span className={styles.fileMeta}>
          {file.status} · +{file.additions} -{file.deletions}
          {file.generated ? " · generated" : ""}
        </span>
      </span>
      <ChevronRight size={15} aria-hidden />
    </button>
  );
}

function DiffSurface({ patch }: { readonly patch: string }): React.JSX.Element {
  return (
    <div className={styles.diffSurface}>
      <pre>
        {patch.split("\n").map((line, index) => (
          <span className={lineClassName(line)} key={`${String(index)}-${line}`}>
            {line.length > 0 ? line : " "}
            {"\n"}
          </span>
        ))}
      </pre>
    </div>
  );
}

function lineClassName(line: string): string {
  if (line.startsWith("@@")) {
    return cssClass(styles.diffHunk);
  }

  if (line.startsWith("+") && !line.startsWith("+++")) {
    return cssClass(styles.diffAdded);
  }

  if (line.startsWith("-") && !line.startsWith("---")) {
    return cssClass(styles.diffDeleted);
  }

  if (line.startsWith("diff --git") || line.startsWith("index ")) {
    return cssClass(styles.diffMetaLine);
  }

  return cssClass(styles.diffLine);
}

function cssClass(className: string | undefined): string {
  return className ?? "";
}

function firstVisiblePath(workspace: ReviewWorkspaceView): string | undefined {
  return workspace.files.find((file) => file.visible)?.path;
}

function nextPendingPath(
  workspace: ReviewWorkspaceView,
  reviewedPath: string,
  filter: string
): string | undefined {
  const normalizedFilter = filter.trim().toLowerCase();
  const visibleFiles = workspace.files.filter(
    (file) =>
      file.visible &&
      !file.reviewed &&
      (normalizedFilter.length === 0 ||
        file.path.toLowerCase().includes(normalizedFilter))
  );
  const reviewedIndex = workspace.files.findIndex((file) => file.path === reviewedPath);

  return (
    visibleFiles.find(
      (file) =>
        workspace.files.findIndex((candidate) => candidate.path === file.path) >
        reviewedIndex
    )?.path ?? visibleFiles[0]?.path
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected Difftray error.";
}

function clampIndex(index: number, length: number): number {
  if (index < 0) {
    return length - 1;
  }

  if (index >= length) {
    return 0;
  }

  return index;
}
