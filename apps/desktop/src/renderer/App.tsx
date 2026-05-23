import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  ExternalLink,
  FolderOpen,
  GitBranch,
  PanelLeft,
  RefreshCw,
  Save,
  Search,
  Settings,
  X
} from "lucide-react";

import styles from "./App.module.css";

type LoadState = "idle" | "loading";

export function App(): React.JSX.Element {
  const [error, setError] = useState<string | undefined>();
  const [filter, setFilter] = useState("");
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [appSettings, setAppSettings] = useState<AppSettingsView>({
    themeMode: "system"
  });
  const [appSettingsDraft, setAppSettingsDraft] = useState<AppSettingsView>({
    themeMode: "system"
  });
  const [recentProjects, setRecentProjects] = useState<readonly RecentProjectView[]>([]);
  const [reviewedExpanded, setReviewedExpanded] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | undefined>();
  const [settingsDraft, setSettingsDraft] = useState<ProjectSettingsView | undefined>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [workspace, setWorkspace] = useState<ReviewWorkspaceView | undefined>();
  const filterInputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    void refreshRecentProjects();
    void refreshAppSettings();
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    function applyTheme(): void {
      document.documentElement.dataset.theme =
        appSettings.themeMode === "system"
          ? media.matches
            ? "dark"
            : "light"
          : appSettings.themeMode;
    }

    applyTheme();
    media.addEventListener("change", applyTheme);

    return () => {
      media.removeEventListener("change", applyTheme);
    };
  }, [appSettings.themeMode]);

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
  const projectRailVisible = !workspace || sidebarOpen;

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

      if (settingsOpen) {
        if (key === "Escape") {
          event.preventDefault();
          setSettingsOpen(false);
          setSettingsDraft(undefined);
          setAppSettingsDraft(appSettings);
        }

        return;
      }

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

  async function refreshAppSettings(): Promise<void> {
    const settings = await window.difftray.getAppSettings();

    setAppSettings(settings);
    setAppSettingsDraft(settings);
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
        setSettingsDraft(undefined);
        setSettingsOpen(false);
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

  async function openSettings(): Promise<void> {
    if (!workspace) {
      return;
    }

    setError(undefined);
    setLoadState("loading");

    try {
      const [nextAppSettings, nextProjectSettings] = await Promise.all([
        window.difftray.getAppSettings(),
        window.difftray.getProjectSettings(workspace.project.id)
      ]);

      setAppSettings(nextAppSettings);
      setAppSettingsDraft(nextAppSettings);
      setSettingsDraft(nextProjectSettings);
      setSettingsOpen(true);
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    } finally {
      setLoadState("idle");
    }
  }

  function updateSettingsDraft(patch: Partial<ProjectSettingsView>): void {
    setSettingsDraft((draft) => (draft ? { ...draft, ...patch } : draft));
  }

  function updateAppSettingsDraft(patch: Partial<AppSettingsView>): void {
    setAppSettingsDraft((draft) => ({ ...draft, ...patch }));
  }

  async function saveSettings(): Promise<void> {
    if (!workspace || !settingsDraft) {
      return;
    }

    if (
      settingsDraft.editorMode === "custom" &&
      settingsDraft.editorCommand.trim().length === 0
    ) {
      setError("Custom editor command is required.");
      return;
    }

    const preferredPath = selectedPath;

    setError(undefined);
    setLoadState("loading");

    try {
      const [savedAppSettings, savedSettings] = await Promise.all([
        window.difftray.updateAppSettings({
          themeMode: appSettingsDraft.themeMode
        }),
        window.difftray.updateProjectSettings({
          editorArgs: settingsDraft.editorArgs,
          editorCommand: settingsDraft.editorCommand,
          editorMode: settingsDraft.editorMode,
          projectId: workspace.project.id,
          showGeneratedFiles: settingsDraft.showGeneratedFiles
        })
      ]);
      const nextWorkspace = await window.difftray.loadProject(workspace.project.id);

      setAppSettings(savedAppSettings);
      setAppSettingsDraft(savedAppSettings);
      setSettingsDraft(savedSettings);
      setSettingsOpen(false);
      setWorkspace(nextWorkspace);
      setSelectedPath(visiblePathOrFirst(nextWorkspace, preferredPath));
      await refreshRecentProjects();
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    } finally {
      setLoadState("idle");
    }
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
    <main className={styles.shell} data-sidebar-open={projectRailVisible}>
      {projectRailVisible ? (
        <aside className={styles.projectRail} aria-label="Projects">
          <div className={styles.railChrome}>
            <span className={styles.chromeSpacer} />
            {workspace ? (
              <button
                aria-label="Hide sidebar"
                className={styles.chromeButton}
                onClick={() => {
                  setSidebarOpen(false);
                }}
                title="Hide sidebar"
                type="button"
              >
                <PanelLeft size={17} aria-hidden />
              </button>
            ) : null}
          </div>

          <div className={styles.railHeader}>
            <div>
              <div className={styles.productName}>Difftray</div>
              <div className={styles.productMeta}>local diff review</div>
            </div>
            {workspace ? <div className={styles.modeLabel}>Worktree</div> : null}
          </div>

          {workspace ? (
            <div className={styles.projectSummary}>
              <div className={styles.summaryTopline}>
                <span className={styles.summaryTitle}>{workspace.project.name}</span>
                <span className={styles.summaryCount}>
                  {workspace.progress.reviewedVisibleFiles}/
                  {workspace.progress.totalVisibleReviewableFiles}
                </span>
              </div>
              <div className={styles.progressTrack}>
                <span
                  className={styles.progressFill}
                  style={{
                    width: `${String(progressPercent(workspace.progress))}%`
                  }}
                />
              </div>
              <div className={styles.projectMeta}>{workspace.project.path}</div>
            </div>
          ) : null}

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

          <div className={styles.railSectionLabel}>Projects</div>
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
                <span className={styles.projectAccent} />
                <span className={styles.projectCopy}>
                  <span className={styles.projectName}>{project.name}</span>
                  <span className={styles.projectMeta}>{project.path}</span>
                </span>
                <ChevronRight size={15} aria-hidden />
              </button>
            ))}
          </div>
        </aside>
      ) : null}

      {error ? <div className={styles.errorBanner}>{error}</div> : null}

      {workspace ? (
        <>
          <nav className={styles.fileQueue} aria-label="Changed files">
            <div className={styles.queueToolbar}>
              <div className={styles.queueHeading}>
                {!projectRailVisible ? (
                  <button
                    aria-label="Show sidebar"
                    className={styles.iconButton}
                    onClick={() => {
                      setSidebarOpen(true);
                    }}
                    title="Show sidebar"
                    type="button"
                  >
                    <PanelLeft size={16} aria-hidden />
                  </button>
                ) : null}
                <div className={styles.queueTitleBlock}>
                  <div className={styles.queueTitle}>Changed files</div>
                  <div className={styles.queueMeta}>
                    {pendingFiles.length} waiting · {reviewedFiles.length} reviewed
                  </div>
                </div>
              </div>
              <div className={styles.queueActions}>
                <button
                  aria-label="Refresh project"
                  className={styles.iconButton}
                  disabled={loadState === "loading"}
                  onClick={() => {
                    void refreshWorkspace();
                  }}
                  title="Refresh"
                  type="button"
                >
                  <RefreshCw size={16} aria-hidden />
                </button>
                <button
                  aria-label="Project settings"
                  className={styles.iconButton}
                  disabled={loadState === "loading"}
                  onClick={() => {
                    void openSettings();
                  }}
                  title="Settings"
                  type="button"
                >
                  <Settings size={16} aria-hidden />
                </button>
              </div>
            </div>

            <label className={styles.searchBox}>
              <Search size={15} aria-hidden />
              <input
                ref={filterInputRef}
                onChange={(event) => {
                  setFilter(event.target.value);
                }}
                placeholder="Filter files"
                type="search"
                value={filter}
              />
            </label>

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

          <article className={styles.diffCanvas} aria-label="Diff preview">
            {selectedFile ? (
              <>
                <div className={styles.diffToolbar}>
                  <div className={styles.diffTitleBlock}>
                    <span className={styles.diffPath}>{selectedFile.path}</span>
                    <span className={styles.diffMeta}>
                      <GitBranch size={14} aria-hidden />
                      {workspace.reviewTarget.headRefName ?? "detached"} ·{" "}
                      {selectedFile.status} · +{selectedFile.additions} -
                      {selectedFile.deletions}
                      {selectedFile.invalidated ? " · changed after review" : ""}
                    </span>
                  </div>
                  <div className={styles.diffActions}>
                    <button
                      aria-label="Open selected file in editor"
                      className={styles.iconButton}
                      disabled={loadState === "loading"}
                      onClick={() => {
                        void openSelectedInEditor();
                      }}
                      title="Open in editor"
                      type="button"
                    >
                      <ExternalLink size={16} aria-hidden />
                    </button>
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
                </div>
                <DiffSurface patch={selectedFile.patch} />
              </>
            ) : (
              <div className={styles.emptyState}>No changed files</div>
            )}
          </article>

          {settingsOpen && settingsDraft ? (
            <div className={styles.settingsOverlay}>
              <SettingsPanel
                appSettings={appSettingsDraft}
                disabled={loadState === "loading"}
                onCancel={() => {
                  setSettingsOpen(false);
                  setSettingsDraft(undefined);
                  setAppSettingsDraft(appSettings);
                }}
                onChangeAppSettings={updateAppSettingsDraft}
                onChange={updateSettingsDraft}
                onSave={() => {
                  void saveSettings();
                }}
                settings={settingsDraft}
              />
            </div>
          ) : null}
        </>
      ) : (
        <section className={styles.emptyWorkspace} aria-label="Review workspace">
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
        </section>
      )}
    </main>
  );
}

function SettingsPanel({
  appSettings,
  disabled,
  onCancel,
  onChangeAppSettings,
  onChange,
  onSave,
  settings
}: {
  readonly appSettings: AppSettingsView;
  readonly disabled: boolean;
  readonly onCancel: () => void;
  readonly onChangeAppSettings: (patch: Partial<AppSettingsView>) => void;
  readonly onChange: (patch: Partial<ProjectSettingsView>) => void;
  readonly onSave: () => void;
  readonly settings: ProjectSettingsView;
}): React.JSX.Element {
  const customEditor = settings.editorMode === "custom";

  return (
    <section
      aria-labelledby="project-settings-title"
      aria-modal="true"
      className={styles.settingsPanel}
      role="dialog"
    >
      <form
        className={styles.settingsForm}
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <div className={styles.settingsHeader}>
          <div>
            <div className={styles.settingsTitle} id="project-settings-title">
              Project settings
            </div>
            <div className={styles.settingsMeta}>Stored per repository</div>
          </div>
          <button
            aria-label="Close settings"
            className={styles.iconButton}
            disabled={disabled}
            onClick={onCancel}
            title="Close"
            type="button"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <label className={styles.toggleRow}>
          <input
            checked={settings.showGeneratedFiles}
            disabled={disabled}
            onChange={(event) => {
              onChange({ showGeneratedFiles: event.target.checked });
            }}
            type="checkbox"
          />
          <span>Show generated files</span>
        </label>

        <label className={styles.fieldGroup}>
          <span className={styles.fieldLabel}>Appearance</span>
          <select
            className={styles.selectInput}
            disabled={disabled}
            onChange={(event) => {
              onChangeAppSettings({
                themeMode: themeModeFromValue(event.target.value)
              });
            }}
            value={appSettings.themeMode}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>

        <label className={styles.fieldGroup}>
          <span className={styles.fieldLabel}>Editor</span>
          <select
            className={styles.selectInput}
            disabled={disabled}
            onChange={(event) => {
              onChange({
                editorMode: event.target.value === "custom" ? "custom" : "system"
              });
            }}
            value={settings.editorMode}
          >
            <option value="system">System default</option>
            <option value="custom">Custom command</option>
          </select>
        </label>

        {customEditor ? (
          <div className={styles.customEditorGrid}>
            <label className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>Command</span>
              <input
                className={styles.textInput}
                disabled={disabled}
                onChange={(event) => {
                  onChange({ editorCommand: event.target.value });
                }}
                placeholder="code"
                type="text"
                value={settings.editorCommand}
              />
            </label>

            <label className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>Arguments</span>
              <input
                className={styles.textInput}
                disabled={disabled}
                onChange={(event) => {
                  onChange({ editorArgs: event.target.value });
                }}
                placeholder="--goto {path}:{line}"
                type="text"
                value={settings.editorArgs}
              />
            </label>
          </div>
        ) : null}

        <div className={styles.settingsActions}>
          <button
            className={styles.secondaryButton}
            disabled={disabled}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button className={styles.saveButton} disabled={disabled} type="submit">
            <Save size={15} aria-hidden />
            Save
          </button>
        </div>
      </form>
    </section>
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
      data-generated={file.generated}
      data-invalidated={file.invalidated}
      data-selected={isSelected}
      onClick={() => {
        onSelect(file.path);
      }}
      type="button"
    >
      {file.invalidated ? (
        <AlertTriangle className={styles.invalidatedIcon} size={17} aria-hidden />
      ) : file.reviewed ? (
        <CheckCircle2 className={styles.reviewedIcon} size={17} aria-hidden />
      ) : (
        <Circle className={styles.pendingIcon} size={17} aria-hidden />
      )}
      <span className={styles.fileCopy}>
        <span className={styles.filePath}>{file.path}</span>
        <span className={styles.fileMeta}>
          {file.status} · +{file.additions} -{file.deletions}
          {file.invalidated ? " · changed after review" : ""}
          {file.generated ? " · generated" : ""}
        </span>
      </span>
      <ChevronRight size={15} aria-hidden />
    </button>
  );
}

function DiffSurface({ patch }: { readonly patch: string }): React.JSX.Element {
  const rows = useMemo(() => parseUnifiedDiff(patch), [patch]);

  return (
    <div className={styles.diffSurface}>
      <div className={styles.diffTable}>
        {rows.map((row) =>
          isCodeDiffRow(row) ? (
            <div className={styles.diffRow} data-kind={row.kind} key={row.key}>
              <span className={styles.diffNumber}>{row.oldNumber ?? ""}</span>
              <code className={styles.diffCode}>{row.oldText ?? ""}</code>
              <span className={styles.diffNumber}>{row.newNumber ?? ""}</span>
              <code className={styles.diffCode}>{row.newText ?? ""}</code>
            </div>
          ) : (
            <div
              className={row.kind === "hunk" ? styles.diffHunkRow : styles.diffMetaRow}
              key={row.key}
            >
              {row.text}
            </div>
          )
        )}
      </div>
    </div>
  );
}

function firstVisiblePath(workspace: ReviewWorkspaceView): string | undefined {
  return workspace.files.find((file) => file.visible)?.path;
}

function visiblePathOrFirst(
  workspace: ReviewWorkspaceView,
  preferredPath: string | undefined
): string | undefined {
  return workspace.files.some((file) => file.path === preferredPath && file.visible)
    ? preferredPath
    : firstVisiblePath(workspace);
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

type ParsedDiffRow =
  | {
      readonly key: string;
      readonly kind: "meta" | "hunk";
      readonly text: string;
    }
  | {
      readonly key: string;
      readonly kind: "added" | "context" | "deleted";
      readonly newNumber: number | undefined;
      readonly newText: string | undefined;
      readonly oldNumber: number | undefined;
      readonly oldText: string | undefined;
    };

function isCodeDiffRow(
  row: ParsedDiffRow
): row is Extract<ParsedDiffRow, { readonly kind: "added" | "context" | "deleted" }> {
  return row.kind === "added" || row.kind === "context" || row.kind === "deleted";
}

function parseUnifiedDiff(patch: string): readonly ParsedDiffRow[] {
  const rows: ParsedDiffRow[] = [];
  let oldLine: number | undefined;
  let newLine: number | undefined;

  for (const [index, line] of patch.split("\n").entries()) {
    const key = `${String(index)}-${line}`;

    if (line.startsWith("@@")) {
      const hunk = /^@@ -(?<oldStart>\d+)(?:,\d+)? \+(?<newStart>\d+)(?:,\d+)? @@/.exec(
        line
      );

      oldLine = hunk?.groups?.oldStart ? Number(hunk.groups.oldStart) : undefined;
      newLine = hunk?.groups?.newStart ? Number(hunk.groups.newStart) : undefined;
      rows.push({ key, kind: "hunk", text: line });
      continue;
    }

    if (line.startsWith("diff --git") || line.startsWith("index ")) {
      rows.push({ key, kind: "meta", text: line });
      continue;
    }

    if (line.startsWith("---") || line.startsWith("+++")) {
      rows.push({ key, kind: "meta", text: line });
      continue;
    }

    if (line.startsWith("+")) {
      rows.push({
        key,
        kind: "added",
        newNumber: newLine,
        newText: line.slice(1),
        oldNumber: undefined,
        oldText: undefined
      });
      newLine = incrementLine(newLine);
      continue;
    }

    if (line.startsWith("-")) {
      rows.push({
        key,
        kind: "deleted",
        newNumber: undefined,
        newText: undefined,
        oldNumber: oldLine,
        oldText: line.slice(1)
      });
      oldLine = incrementLine(oldLine);
      continue;
    }

    rows.push({
      key,
      kind: "context",
      newNumber: newLine,
      newText: line.startsWith(" ") ? line.slice(1) : line,
      oldNumber: oldLine,
      oldText: line.startsWith(" ") ? line.slice(1) : line
    });
    oldLine = incrementLine(oldLine);
    newLine = incrementLine(newLine);
  }

  return rows;
}

function incrementLine(line: number | undefined): number | undefined {
  return line === undefined ? undefined : line + 1;
}

function progressPercent(progress: ReviewWorkspaceView["progress"]): number {
  if (progress.totalVisibleReviewableFiles === 0) {
    return 0;
  }

  return Math.round(
    (progress.reviewedVisibleFiles / progress.totalVisibleReviewableFiles) * 100
  );
}

function themeModeFromValue(value: string): ThemeMode {
  return value === "dark" || value === "light" || value === "system" ? value : "system";
}
