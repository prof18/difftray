import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { X } from "lucide-react";

import styles from "./App.module.css";
import {
  defaultAppSettings,
  defaultCompanionState,
  defaultProjectSettings,
  defaultWorkspaceLoadStatus,
  delayedCommentSaveIndicatorMs,
  delayedFileDiffLoaderMs
} from "./app-defaults.js";
import { buildCommands } from "./command-builders.js";
import {
  createDiffScrollKey,
  normalizeDiffScrollPosition,
  topDiffScrollPosition,
  type DiffScrollPosition
} from "./diff-scroll-state.js";
import { DiffSurface } from "./diff-surface.js";
import { DiffLoadingState, DiffToolbar } from "./diff-toolbar.js";
import { CollapsedRail, FileList, FileListHeader } from "./file-list.js";
import {
  DriftToast,
  EmptyState,
  SimpleToast,
  UpdateRestartBanner
} from "./app-status-views.js";
import {
  mergeProjectTabs,
  prepareProjectTabReorderUpdate,
  createProjectTabOrderSaveQueue
} from "./project-tabs.js";
import { ProjectTabBar } from "./project-tab-bar.js";
import { LoadingProgress, TabLoadBanner } from "./workspace-loading.js";
import {
  applyLoadedFileDiffToWorkspace,
  carryLoadedDiffsForward,
  isFileDiffLoaded,
  shouldRefreshCachedWorkspaceAfterTabSwitch,
  shouldApplySilentWorkspaceRefresh
} from "./workspace-refresh.js";
import type { DiffSideFocus } from "./diffs-renderer.js";
import { filterCommands, type PaletteMode } from "./command-palette.js";
import { CommandPalette } from "./command-palette-view.js";
import {
  commentCountsByPath,
  sameCommentSavePending,
  sortReviewComments,
  type CommentSavePending,
  type ReviewCommentDraft
} from "./review-comments.js";
import {
  clampIndex,
  clampNumber,
  diffTargetLabel,
  diffSideFocusForFile,
  errorMessage,
  nextPendingPath,
  omitProjectReviewSummary,
  projectReviewSummary,
  reviewSummariesEqual,
  suggestedBaseRef,
  visiblePathOrFirst,
  type DiffMode,
  type ReviewDiffTargetMode
} from "./review-view-model.js";
import { SettingsPanel } from "./settings-panel.js";
import {
  loadStatusFromProgress,
  tabSwitchLoaderDelayMs,
  type WorkspaceLoadStatus
} from "./workspace-load-status.js";
import { editorSettingsError, updateAppSettingsInput } from "./editor-settings.js";
import { elapsedSince, logRendererPerformance } from "./renderer-performance.js";

type LoadState = "idle" | "loading";
type ResolvedTheme = "dark" | "light";

type ReviewNavigationPerformance = {
  readonly diffLoadedLogged: boolean;
  readonly fromPath: string;
  readonly id: number;
  readonly renderReadyLogged: boolean;
  readonly startedAt: number;
  readonly toPath: string | undefined;
};

type WorkspaceCacheEntry = {
  readonly branchRefs: readonly string[];
  readonly recentCommits: readonly RecentCommitView[];
  readonly projectSettings: ProjectSettingsView;
  readonly workspace: ReviewWorkspaceView;
};

type ApplyWorkspaceOptions = {
  readonly appSettings?: AppSettingsView;
  readonly branchRefs?: readonly string[];
  readonly recentCommits?: readonly RecentCommitView[];
  readonly projectSettings?: ProjectSettingsView;
};

export function App(): React.JSX.Element {
  const [appSettings, setAppSettings] = useState<AppSettingsView>(defaultAppSettings);
  const [appSettingsDraft, setAppSettingsDraft] =
    useState<AppSettingsView>(defaultAppSettings);
  const [baseRefDraft, setBaseRefDraft] = useState("");
  const [branchRefs, setBranchRefs] = useState<readonly string[]>([]);
  const [commitRefDraft, setCommitRefDraft] = useState("");
  const [commentDraft, setCommentDraft] = useState<ReviewCommentDraft | undefined>();
  const [commentSavePending, setCommentSavePending] = useState<
    CommentSavePending | undefined
  >();
  const [commentReportCopyPending, setCommentReportCopyPending] = useState(false);
  const [commentToast, setCommentToast] = useState<string | undefined>();
  const [companionPairing, setCompanionPairing] =
    useState<CompanionPairingStateView | null>(null);
  const [companionState, setCompanionState] =
    useState<CompanionStateView>(defaultCompanionState);
  const [diffMode, setDiffMode] = useState<DiffMode>("split");
  const [diffSideFocus, setDiffSideFocus] = useState<DiffSideFocus>("both");
  const [error, setError] = useState<string | undefined>();
  const [editorOptions, setEditorOptions] = useState<readonly EditorPresetView[]>([]);
  const [fileListCollapsed, setFileListCollapsed] = useState(false);
  const [fileListWidth, setFileListWidth] = useState(340);
  const [hasBootstrapped, setHasBootstrapped] = useState(false);
  const [loadingDiffPath, setLoadingDiffPath] = useState<string | undefined>();
  const [recentCommits, setRecentCommits] = useState<readonly RecentCommitView[]>([]);
  const [visibleLoadingDiffPath, setVisibleLoadingDiffPath] = useState<
    string | undefined
  >();
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [loadStatus, setLoadStatus] = useState<WorkspaceLoadStatus>(
    defaultWorkspaceLoadStatus
  );
  const [paletteMode, setPaletteMode] = useState<PaletteMode>("all");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [paletteSelected, setPaletteSelected] = useState(0);
  const [projectSettings, setProjectSettings] =
    useState<ProjectSettingsView>(defaultProjectSettings);
  const [recentProjects, setRecentProjects] = useState<readonly RecentProjectView[]>([]);
  const [tabDragCancelKey, setTabDragCancelKey] = useState(0);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("dark");
  const [selectedPath, setSelectedPath] = useState<string | undefined>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tabSummaryLoadingProjectIds, setTabSummaryLoadingProjectIds] = useState<
    ReadonlySet<string>
  >(new Set());
  const [loadingProject, setLoadingProject] = useState<RecentProjectView | undefined>();
  const [pendingLoadingProjectId, setPendingLoadingProjectId] = useState<
    string | undefined
  >();
  const [toastDismissedFor, setToastDismissedFor] = useState<string | undefined>();
  const [updatePhase, setUpdatePhase] = useState<UpdatePhase>({ kind: "idle" });
  const [workspace, setWorkspace] = useState<ReviewWorkspaceView | undefined>();
  const diffSurfaceRef = useRef<HTMLDivElement>(null);
  const diffScrollPositionsRef = useRef<Map<string, DiffScrollPosition>>(new Map());
  const paletteInputRef = useRef<HTMLInputElement>(null);
  const commentReportCopyPendingRef = useRef(false);
  const commentSavePendingRef = useRef<CommentSavePending | undefined>(undefined);
  const focusRefreshRunningRef = useRef(false);
  const lastFocusRefreshAtRef = useRef(0);
  const loadStateRef = useRef<LoadState>("idle");
  const paletteOpenRef = useRef(false);
  const selectedPathRef = useRef<string | undefined>(undefined);
  const nextReviewNavigationPerformanceIdRef = useRef(0);
  const reviewNavigationPerformanceRef = useRef<ReviewNavigationPerformance | undefined>(
    undefined
  );
  const settingsOpenRef = useRef(false);
  const selectedPathByProjectRef = useRef<Map<string, string>>(new Map());
  const tabSummaryInvalidationRef = useRef<Map<string, number>>(new Map());
  const tabSummaryLoadQueueRef = useRef<Promise<void>>(Promise.resolve());
  const projectTabOrderSaveQueueRef = useRef(createProjectTabOrderSaveQueue());
  const tabSummaryLoadsInFlightRef = useRef<Set<string>>(new Set());
  const tabSummaryLoadSkippedRef = useRef<Set<string>>(new Set());
  const visibleCommentSavePendingRef = useRef<CommentSavePending | undefined>(undefined);
  const [visibleCommentSavePending, setVisibleCommentSavePending] = useState<
    CommentSavePending | undefined
  >();
  const workspaceApplyVersionRef = useRef(0);
  const workspaceCacheRef = useRef<Map<string, WorkspaceCacheEntry>>(new Map());
  const workspaceRef = useRef<ReviewWorkspaceView | undefined>(undefined);
  const resizeStartRef = useRef<{
    readonly startWidth: number;
    readonly x: number;
  } | null>(null);

  useLayoutEffect(() => {
    void bootstrapApp();
  }, []);

  useEffect(() => {
    loadStateRef.current = loadState;
    paletteOpenRef.current = paletteOpen;
    selectedPathRef.current = selectedPath;
    settingsOpenRef.current = settingsOpen;
    workspaceRef.current = workspace;
  }, [loadState, paletteOpen, selectedPath, settingsOpen, workspace]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    function applyTheme(): void {
      const nextTheme =
        appSettings.themeMode === "system"
          ? media.matches
            ? "dark"
            : "light"
          : appSettings.themeMode;

      document.documentElement.dataset.theme = nextTheme;
      setResolvedTheme(nextTheme);
    }

    applyTheme();
    media.addEventListener("change", applyTheme);

    return () => {
      media.removeEventListener("change", applyTheme);
    };
  }, [appSettings.themeMode]);

  useLayoutEffect(() => {
    if (paletteOpen) {
      setPaletteSelected(0);
      paletteInputRef.current?.focus();
    }
  }, [paletteOpen, paletteMode, paletteQuery]);

  useEffect(() => {
    if (workspace && selectedPath) {
      selectedPathByProjectRef.current.set(workspace.project.id, selectedPath);
    }
  }, [selectedPath, workspace]);

  useEffect(() => {
    let cancelled = false;

    void window.difftray
      .getCompanionState()
      .then((state) => {
        if (!cancelled) {
          setCompanionState(state);
          setCompanionPairing(state.activePairing);
        }
      })
      .catch((caughtError: unknown) => {
        console.error("Failed to read companion state", caughtError);
      });

    const unsubscribeCompanion = window.difftray.onCompanionStateChanged((state) => {
      setCompanionState(state);
      setCompanionPairing(state.activePairing);
    });

    return () => {
      cancelled = true;
      unsubscribeCompanion();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void window.difftray
      .getUpdatePhase()
      .then((phase) => {
        if (!cancelled) {
          setUpdatePhase(phase);
        }
      })
      .catch((caughtError: unknown) => {
        console.error("Failed to read update phase", caughtError);
      });

    const unsubscribe = window.difftray.onUpdatePhase((phase) => {
      setUpdatePhase(phase);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!commentToast) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setCommentToast(undefined);
    }, 2_400);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [commentToast]);

  useEffect(() => {
    if (!hasBootstrapped || loadState === "loading") {
      return;
    }

    for (const project of recentProjects) {
      if (
        project.id === workspace?.project.id ||
        project.reviewSummary ||
        tabSummaryLoadsInFlightRef.current.has(project.id) ||
        tabSummaryLoadSkippedRef.current.has(project.id)
      ) {
        continue;
      }

      queueProjectReviewSummary(project.id);
    }
  }, [hasBootstrapped, loadState, recentProjects, workspace?.project.id]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.defaultPrevented || loadState === "loading") {
        return;
      }

      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const target = event.target;
      const isTextInput =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable);

      if (event.metaKey && key === "k") {
        event.preventDefault();
        openPalette("all");
        return;
      }

      if (event.metaKey && key === "p") {
        event.preventDefault();
        openPalette("files");
        return;
      }

      if (event.metaKey && key === "o") {
        event.preventDefault();
        void openProject();
        return;
      }

      if (event.metaKey && event.key === "1") {
        event.preventDefault();
        toggleFileListCollapsed();
        return;
      }

      if (paletteOpen) {
        if (key === "Escape") {
          event.preventDefault();
          closePalette();
          return;
        }

        if (event.key === "ArrowDown") {
          event.preventDefault();
          setPaletteSelected((index) => clampIndex(index + 1, filteredCommands.length));
          return;
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          setPaletteSelected((index) => clampIndex(index - 1, filteredCommands.length));
          return;
        }

        if (event.key === "Enter") {
          event.preventDefault();
          const activeCommands = filterCommands(
            commands,
            paletteMode,
            paletteInputRef.current?.value ?? paletteQuery
          );
          activeCommands[clampIndex(paletteSelected, activeCommands.length)]?.run();
          closePalette();
          return;
        }
      }

      if (settingsOpen) {
        if (key === "Escape") {
          event.preventDefault();
          closeSettings();
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
        case "ArrowDown":
        case "j":
          event.preventDefault();
          selectRelativeFile(1);
          break;
        case "ArrowUp":
        case "k":
          event.preventDefault();
          selectRelativeFile(-1);
          break;
        case "r":
          event.preventDefault();
          void toggleSelectedReviewed();
          break;
        case "Escape":
          event.preventDefault();
          setToastDismissedFor(toastKey);
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  });

  const visibleFiles = useMemo(() => {
    return workspace ? workspace.files.filter((file) => file.visible) : [];
  }, [workspace]);

  const selectedFile =
    visibleFiles.find((file) => file.path === selectedPath) ?? visibleFiles[0];
  const selectedDiffSideFocus = selectedFile
    ? diffSideFocusForFile(selectedFile, diffMode, diffSideFocus)
    : diffSideFocus;
  const loadSelectedFileImage = useMemo(() => {
    const projectId = workspace?.project.id;
    const path = selectedFile?.path;
    const diffHash = selectedFile?.diffHash;
    const previousPath = selectedFile?.previousPath;

    if (!projectId || !path || !diffHash) {
      return undefined;
    }

    return (side: FileImageSide): Promise<FileImageView | null> =>
      window.difftray.loadFileImage({
        diffHash,
        path,
        ...(previousPath ? { previousPath } : {}),
        projectId,
        side,
        status: selectedFile.status
      });
  }, [
    selectedFile?.diffHash,
    selectedFile?.path,
    selectedFile?.previousPath,
    selectedFile?.status,
    workspace?.project.id
  ]);

  useEffect(() => {
    setCommentDraft((draft) =>
      draft?.path === selectedFile?.path && draft?.diffHash === selectedFile?.diffHash
        ? draft
        : undefined
    );
  }, [selectedFile]);

  useEffect(() => {
    const action = reviewNavigationPerformanceRef.current;

    if (
      !action ||
      action.diffLoadedLogged ||
      !selectedFile?.diffLoaded ||
      selectedFile.path !== action.toPath
    ) {
      return;
    }

    logRendererPerformance("review.mark.next_diff_loaded", {
      actionId: action.id,
      elapsedMs: elapsedSince(action.startedAt),
      fromPath: action.fromPath,
      toPath: action.toPath
    });
    reviewNavigationPerformanceRef.current = {
      ...action,
      diffLoadedLogged: true
    };
  }, [selectedFile]);

  const selectedDiffScrollKey =
    workspace && selectedFile
      ? createDiffScrollKey({
          diffHash: selectedFile.diffHash,
          filePath: selectedFile.path,
          projectId: workspace.project.id,
          reviewTargetId: workspace.reviewTarget.id
        })
      : undefined;
  const selectedComments = useMemo(
    () =>
      workspace && selectedFile
        ? workspace.comments.filter(
            (comment) =>
              comment.path === selectedFile.path &&
              comment.diffHash === selectedFile.diffHash
          )
        : [],
    [selectedFile, workspace]
  );
  const commentCountByPath = useMemo(
    () => commentCountsByPath(workspace?.comments ?? []),
    [workspace?.comments]
  );
  const attentionFiles = visibleFiles.filter((file) => file.invalidated);
  const toastKey =
    workspace && attentionFiles.length > 0
      ? `${workspace.project.id}:${attentionFiles.map((file) => file.diffHash).join("|")}`
      : undefined;
  const showDriftToast =
    appSettings.notifyOnDrift && Boolean(toastKey) && toastDismissedFor !== toastKey;
  const activeProject = loadingProject ?? workspace?.project;
  const activeReviewSummary = loadingProject
    ? loadingProject.reviewSummary
    : workspace
      ? {
          attentionCount: attentionFiles.length,
          progress: workspace.progress
        }
      : undefined;
  const isPendingProjectSwitch =
    loadState === "loading" &&
    pendingLoadingProjectId !== undefined &&
    loadingProject === undefined;
  const showActiveWorkspaceLoading = loadState === "loading" && !isPendingProjectSwitch;

  const rememberDiffScrollPosition = useCallback(
    (scrollKey: string, position: DiffScrollPosition) => {
      diffScrollPositionsRef.current.set(
        scrollKey,
        normalizeDiffScrollPosition(position)
      );
    },
    []
  );
  const rememberCurrentDiffScrollPosition = useCallback(() => {
    if (!selectedDiffScrollKey || !diffSurfaceRef.current) {
      return;
    }

    rememberDiffScrollPosition(selectedDiffScrollKey, {
      left: diffSurfaceRef.current.scrollLeft,
      top: diffSurfaceRef.current.scrollTop
    });
  }, [rememberDiffScrollPosition, selectedDiffScrollKey]);
  const selectPath = useCallback(
    (path: string | undefined) => {
      rememberCurrentDiffScrollPosition();
      selectedPathRef.current = path;
      setSelectedPath(path);
    },
    [rememberCurrentDiffScrollPosition]
  );

  const handleDiffRenderModelReady = useCallback((filePath: string, parseMs: number) => {
    const action = reviewNavigationPerformanceRef.current;

    if (!action || action.renderReadyLogged || filePath !== action.toPath) {
      return;
    }

    logRendererPerformance("review.mark.next_diff_render_ready", {
      actionId: action.id,
      elapsedMs: elapsedSince(action.startedAt),
      fromPath: action.fromPath,
      parseMs,
      toPath: action.toPath
    });
    reviewNavigationPerformanceRef.current = {
      ...action,
      renderReadyLogged: true
    };
  }, []);

  const loadFileDiffIntoWorkspace = useCallback(
    async ({
      filePath,
      projectId,
      reviewTargetId,
      showDelayedLoader
    }: {
      readonly filePath: string;
      readonly projectId: string;
      readonly reviewTargetId: string;
      readonly showDelayedLoader: boolean;
    }): Promise<ReviewWorkspaceView | undefined> => {
      if (isFileDiffLoaded(workspaceRef.current, filePath)) {
        return workspaceRef.current;
      }

      let loaderTimerId: number | undefined;

      if (showDelayedLoader) {
        loaderTimerId = window.setTimeout(() => {
          setVisibleLoadingDiffPath(filePath);
        }, delayedFileDiffLoaderMs);
      }

      setLoadingDiffPath(filePath);

      try {
        const loadedDiff = await window.difftray.loadFileDiff({
          path: filePath,
          projectId
        });

        if (!loadedDiff) {
          return workspaceRef.current;
        }

        const currentWorkspace = workspaceRef.current;

        if (
          currentWorkspace?.project.id !== projectId ||
          currentWorkspace.reviewTarget.id !== reviewTargetId
        ) {
          return currentWorkspace;
        }

        const nextWorkspace = applyLoadedFileDiffToWorkspace(
          currentWorkspace,
          loadedDiff
        );

        workspaceRef.current = nextWorkspace;
        setWorkspace(nextWorkspace);
        workspaceCacheRef.current.set(projectId, {
          branchRefs,
          recentCommits,
          projectSettings,
          workspace: nextWorkspace
        });

        return nextWorkspace;
      } finally {
        if (loaderTimerId !== undefined) {
          window.clearTimeout(loaderTimerId);
        }

        setLoadingDiffPath((currentPath) =>
          currentPath === filePath ? undefined : currentPath
        );
        setVisibleLoadingDiffPath((currentPath) =>
          currentPath === filePath ? undefined : currentPath
        );
      }
    },
    [branchRefs, projectSettings, recentCommits]
  );

  useEffect(() => {
    if (!workspace || !selectedFile || selectedFile.diffLoaded) {
      return;
    }

    const projectId = workspace.project.id;
    const reviewTargetId = workspace.reviewTarget.id;
    const filePath = selectedFile.path;
    let cancelled = false;

    void loadFileDiffIntoWorkspace({
      filePath,
      projectId,
      reviewTargetId,
      showDelayedLoader: true
    }).catch((caughtError: unknown) => {
      if (!cancelled) {
        setError(errorMessage(caughtError));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [loadFileDiffIntoWorkspace, selectedFile, workspace]);

  useEffect(() => {
    function handleWindowFocus(): void {
      if (
        !workspace ||
        loadState === "loading" ||
        settingsOpen ||
        paletteOpen ||
        focusRefreshRunningRef.current
      ) {
        return;
      }

      const now = Date.now();

      if (now - lastFocusRefreshAtRef.current < 750) {
        return;
      }

      lastFocusRefreshAtRef.current = now;
      focusRefreshRunningRef.current = true;

      void refreshWorkspaceSilently(workspace.project.id).finally(() => {
        focusRefreshRunningRef.current = false;
      });
    }

    window.addEventListener("focus", handleWindowFocus);

    return () => {
      window.removeEventListener("focus", handleWindowFocus);
    };
  });

  useEffect(() => {
    return window.difftray.onProjectChanged((event) => {
      void handleProjectChanged(event);
    });
  }, [loadState, paletteOpen, selectedFile, settingsOpen, workspace]);

  useEffect(() => {
    return window.difftray.onProjectLoadProgress((progress) => {
      setLoadStatus(loadStatusFromProgress(progress));
    });
  }, []);

  const commands = useMemo(
    () =>
      buildCommands({
        activeFile: selectedFile,
        closePalette,
        diffMode,
        files: visibleFiles,
        loadProject,
        toggleReview: () => {
          void toggleSelectedReviewed();
        },
        openProject: () => {
          void openProject();
        },
        openSettings: () => {
          void openSettings();
        },
        projects: recentProjects,
        refresh: () => {
          void refreshWorkspace();
        },
        selectFile: selectPath,
        setDiffMode: setAndPersistDiffMode,
        toggleFileList: toggleFileListCollapsed,
        workspace
      }),
    [
      appSettings,
      diffMode,
      recentProjects,
      selectPath,
      selectedFile,
      visibleFiles,
      workspace
    ]
  );

  const filteredCommands = useMemo(() => {
    return filterCommands(commands, paletteMode, paletteQuery);
  }, [commands, paletteMode, paletteQuery]);

  async function bootstrapApp(): Promise<void> {
    setError(undefined);
    setLoadState("loading");
    setLoadStatus(defaultWorkspaceLoadStatus);
    await nextPaint();

    try {
      const [projects, settings, installedEditors, nextCompanionState] =
        await Promise.all([
          window.difftray.listRecentProjects(),
          window.difftray.getAppSettings(),
          window.difftray.listInstalledEditors(),
          window.difftray.getCompanionState()
        ]);

      setRecentProjects(projects);
      setAppSettings(settings);
      setAppSettingsDraft(settings);
      setEditorOptions(installedEditors);
      setCompanionState(nextCompanionState);
      setCompanionPairing(nextCompanionState.activePairing);
      setDiffMode(settings.defaultDiffMode);

      for (const project of projects) {
        const nextWorkspace = await window.difftray.loadProject(project.id);

        if (!nextWorkspace) {
          continue;
        }

        await applyWorkspace(nextWorkspace, undefined, { appSettings: settings });
        break;
      }

      await refreshRecentProjects();
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    } finally {
      setHasBootstrapped(true);
      setLoadState("idle");
      setLoadStatus(defaultWorkspaceLoadStatus);
    }
  }

  async function refreshRecentProjects(): Promise<void> {
    const nextProjects = await window.difftray.listRecentProjects();

    setRecentProjects((currentProjects) =>
      mergeProjectTabs(currentProjects, nextProjects)
    );
  }

  function queueProjectReviewSummary(projectId: string): void {
    if (
      tabSummaryLoadsInFlightRef.current.has(projectId) ||
      tabSummaryLoadSkippedRef.current.has(projectId)
    ) {
      return;
    }

    const requestVersion = tabSummaryInvalidationRef.current.get(projectId) ?? 0;

    tabSummaryLoadsInFlightRef.current.add(projectId);
    setTabSummaryLoadingProjectIds((currentIds) => {
      const nextIds = new Set(currentIds);

      nextIds.add(projectId);

      return nextIds;
    });

    tabSummaryLoadQueueRef.current = tabSummaryLoadQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const summary = await window.difftray.getProjectReviewSummary(projectId);

        if ((tabSummaryInvalidationRef.current.get(projectId) ?? 0) !== requestVersion) {
          return;
        }

        if (!summary) {
          tabSummaryLoadSkippedRef.current.add(projectId);
          return;
        }

        setRecentProjects((currentProjects) =>
          currentProjects.map((project) =>
            project.id === projectId ? { ...project, reviewSummary: summary } : project
          )
        );
      })
      .catch(() => {
        if ((tabSummaryInvalidationRef.current.get(projectId) ?? 0) === requestVersion) {
          tabSummaryLoadSkippedRef.current.add(projectId);
        }
      })
      .finally(() => {
        tabSummaryLoadsInFlightRef.current.delete(projectId);
        setTabSummaryLoadingProjectIds((currentIds) => {
          const nextIds = new Set(currentIds);

          nextIds.delete(projectId);

          return nextIds;
        });
      });
  }

  function invalidateProjectReviewSummary(projectId: string): void {
    tabSummaryInvalidationRef.current.set(
      projectId,
      (tabSummaryInvalidationRef.current.get(projectId) ?? 0) + 1
    );
    tabSummaryLoadSkippedRef.current.delete(projectId);
    setRecentProjects((currentProjects) =>
      currentProjects.map((project) =>
        project.id === projectId ? omitProjectReviewSummary(project) : project
      )
    );
  }

  function updateRecentProjectReviewSummary(
    projectId: string,
    summary: ProjectReviewSummaryView
  ): void {
    tabSummaryLoadSkippedRef.current.delete(projectId);
    setRecentProjects((currentProjects) =>
      currentProjects.map((project) => {
        if (
          project.id !== projectId ||
          reviewSummariesEqual(project.reviewSummary, summary)
        ) {
          return project;
        }

        return { ...project, reviewSummary: summary };
      })
    );
  }

  async function applyWorkspace(
    nextWorkspace: ReviewWorkspaceView,
    nextPath?: string,
    options: ApplyWorkspaceOptions = {}
  ): Promise<void> {
    rememberCurrentDiffScrollPosition();

    const workspaceToApply = carryLoadedDiffsForward(workspaceRef.current, nextWorkspace);

    setLoadStatus({
      detail: workspaceToApply.project.name,
      title: "Preparing workspace"
    });
    const [nextSettings, nextBranchRefs, nextRecentCommits] = await Promise.all([
      options.projectSettings
        ? Promise.resolve(options.projectSettings)
        : window.difftray.getProjectSettings(workspaceToApply.project.id),
      options.branchRefs
        ? Promise.resolve(options.branchRefs)
        : window.difftray.listProjectBranchRefs(workspaceToApply.project.id),
      options.recentCommits
        ? Promise.resolve(options.recentCommits)
        : window.difftray.listProjectRecentCommits(workspaceToApply.project.id)
    ]);
    const nextAppSettings = options.appSettings ?? appSettings;

    workspaceCacheRef.current.set(workspaceToApply.project.id, {
      branchRefs: nextBranchRefs,
      recentCommits: nextRecentCommits,
      projectSettings: nextSettings,
      workspace: workspaceToApply
    });
    workspaceRef.current = workspaceToApply;
    setWorkspace(workspaceToApply);
    setProjectSettings(nextSettings);
    setBranchRefs(nextBranchRefs);
    setRecentCommits(nextRecentCommits);
    setBaseRefDraft(
      workspaceToApply.reviewTarget.baseRefName ??
        suggestedBaseRef(nextBranchRefs, workspaceToApply.reviewTarget.headRefName) ??
        ""
    );
    setCommitRefDraft(
      workspaceToApply.reviewTarget.kind === "commit"
        ? (workspaceToApply.reviewTarget.commitSha ?? "")
        : (nextRecentCommits[0]?.sha ?? "")
    );
    setDiffMode(nextAppSettings.defaultDiffMode);
    setFileListWidth(nextSettings.fileListWidth);
    setFileListCollapsed(nextSettings.fileListCollapsed);
    const nextSelectedPath = visiblePathOrFirst(workspaceToApply, nextPath);

    selectedPathRef.current = nextSelectedPath;
    setSelectedPath(nextSelectedPath);
    updateRecentProjectReviewSummary(
      workspaceToApply.project.id,
      projectReviewSummary(workspaceToApply)
    );
    setSettingsOpen(false);
  }

  function invalidatePendingSilentWorkspaceRefreshes(): void {
    workspaceApplyVersionRef.current += 1;
  }

  function canApplySilentWorkspaceRefresh(
    projectId: string,
    requestApplyVersion: number
  ): boolean {
    return shouldApplySilentWorkspaceRefresh({
      activeProjectId: workspaceRef.current?.project.id,
      applyVersion: workspaceApplyVersionRef.current,
      loadState: loadStateRef.current,
      paletteOpen: paletteOpenRef.current,
      requestApplyVersion,
      requestProjectId: projectId,
      settingsOpen: settingsOpenRef.current
    });
  }

  async function refreshWorkspaceSilently(projectId: string): Promise<void> {
    const requestApplyVersion = workspaceApplyVersionRef.current;

    try {
      const nextWorkspace = await window.difftray.loadProject(projectId, {
        reportProgress: false
      });

      if (!canApplySilentWorkspaceRefresh(projectId, requestApplyVersion)) {
        return;
      }

      if (!nextWorkspace) {
        await refreshRecentProjects();
        return;
      }

      const [nextSettings, nextBranchRefs, nextRecentCommits] = await Promise.all([
        window.difftray.getProjectSettings(nextWorkspace.project.id),
        window.difftray.listProjectBranchRefs(nextWorkspace.project.id),
        window.difftray.listProjectRecentCommits(nextWorkspace.project.id)
      ]);

      if (!canApplySilentWorkspaceRefresh(projectId, requestApplyVersion)) {
        return;
      }

      await applyWorkspace(nextWorkspace, selectedPathRef.current, {
        branchRefs: nextBranchRefs,
        recentCommits: nextRecentCommits,
        projectSettings: nextSettings
      });
      await refreshRecentProjects();
    } catch (caughtError) {
      if (canApplySilentWorkspaceRefresh(projectId, requestApplyVersion)) {
        setError(errorMessage(caughtError));
      }
    }
  }

  async function runWorkspaceLoad(
    loadWorkspace: () => Promise<ReviewWorkspaceView | null>,
    nextPath?: string,
    initialStatus: WorkspaceLoadStatus = defaultWorkspaceLoadStatus,
    projectToShowWhileLoading?: RecentProjectView,
    projectLoadingDelayMs = 0
  ): Promise<void> {
    let loadingProjectTimeout: number | undefined;

    invalidatePendingSilentWorkspaceRefreshes();
    setError(undefined);
    if (projectToShowWhileLoading && projectLoadingDelayMs <= 0) {
      setPendingLoadingProjectId(undefined);
      setLoadingProject(projectToShowWhileLoading);
    } else if (projectToShowWhileLoading) {
      setPendingLoadingProjectId(projectToShowWhileLoading.id);
      loadingProjectTimeout = window.setTimeout(() => {
        setPendingLoadingProjectId(undefined);
        setLoadingProject(projectToShowWhileLoading);
      }, projectLoadingDelayMs);
    } else {
      setPendingLoadingProjectId(undefined);
      setLoadingProject(undefined);
    }
    setLoadState("loading");
    setLoadStatus(initialStatus);
    await nextPaint();

    try {
      const nextWorkspace = await loadWorkspace();

      if (nextWorkspace) {
        await applyWorkspace(nextWorkspace, nextPath);
        await refreshRecentProjects();
      } else {
        await refreshRecentProjects();
      }
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    } finally {
      if (loadingProjectTimeout !== undefined) {
        window.clearTimeout(loadingProjectTimeout);
      }

      setLoadState("idle");
      setLoadStatus(defaultWorkspaceLoadStatus);
      setPendingLoadingProjectId((currentProjectId) =>
        currentProjectId === projectToShowWhileLoading?.id ? undefined : currentProjectId
      );
      setLoadingProject((currentProject) =>
        currentProject?.id === projectToShowWhileLoading?.id ? undefined : currentProject
      );
    }
  }

  async function openProject(): Promise<void> {
    await runWorkspaceLoad(() => window.difftray.openProject(), undefined, {
      detail: "Waiting for repository selection",
      title: "Opening repository"
    });
  }

  async function loadProject(projectId: string): Promise<void> {
    const cachedWorkspace = workspaceCacheRef.current.get(projectId);

    if (cachedWorkspace) {
      const refreshAfterSwitch = shouldRefreshCachedWorkspaceAfterTabSwitch({
        activeProjectId: workspaceRef.current?.project.id,
        loadState: loadStateRef.current,
        nextProjectId: projectId,
        paletteOpen: paletteOpenRef.current,
        settingsOpen: settingsOpenRef.current
      });

      invalidatePendingSilentWorkspaceRefreshes();
      setError(undefined);
      await applyWorkspace(
        cachedWorkspace.workspace,
        selectedPathByProjectRef.current.get(projectId),
        {
          branchRefs: cachedWorkspace.branchRefs,
          recentCommits: cachedWorkspace.recentCommits,
          projectSettings: cachedWorkspace.projectSettings
        }
      );

      if (refreshAfterSwitch) {
        void refreshWorkspaceSilently(projectId);
      }

      return;
    }

    const projectToLoad = recentProjects.find((project) => project.id === projectId);

    await runWorkspaceLoad(
      () => window.difftray.loadProject(projectId),
      undefined,
      {
        detail: projectToLoad?.name ?? "Repository",
        title: "Loading repository"
      },
      projectToLoad,
      tabSwitchLoaderDelayMs(projectToLoad)
    );
  }

  async function closeProject(projectId: string): Promise<void> {
    const closingActiveProject = workspace?.project.id === projectId;
    const closedProjectIndex = recentProjects.findIndex(
      (project) => project.id === projectId
    );

    setError(undefined);
    invalidatePendingSilentWorkspaceRefreshes();
    setLoadState("loading");
    setLoadStatus({
      detail: "Updating open repositories",
      title: "Closing repository"
    });
    await nextPaint();

    try {
      workspaceCacheRef.current.delete(projectId);
      selectedPathByProjectRef.current.delete(projectId);
      const nextProjects = await window.difftray.closeProject(projectId);
      const orderedNextProjects = mergeProjectTabs(recentProjects, nextProjects);

      setRecentProjects(orderedNextProjects);

      if (!closingActiveProject) {
        return;
      }

      const replacementIndex =
        orderedNextProjects.length === 0
          ? 0
          : Math.min(Math.max(closedProjectIndex, 0), orderedNextProjects.length - 1);
      const candidateProjects =
        orderedNextProjects.length === 0
          ? []
          : [
              ...orderedNextProjects.slice(replacementIndex),
              ...orderedNextProjects.slice(0, replacementIndex)
            ];

      for (const project of candidateProjects) {
        const nextWorkspace = await window.difftray.loadProject(project.id);

        if (nextWorkspace) {
          await applyWorkspace(nextWorkspace);
          await refreshRecentProjects();
          return;
        }
      }

      setWorkspace(undefined);
      setSelectedPath(undefined);
      setProjectSettings(defaultProjectSettings);
      setBranchRefs([]);
      setBaseRefDraft("");
      setDiffMode(appSettings.defaultDiffMode);
      setFileListWidth(defaultProjectSettings.fileListWidth);
      setFileListCollapsed(defaultProjectSettings.fileListCollapsed);
      setSettingsOpen(false);
      setPaletteOpen(false);
      setToastDismissedFor(undefined);
      await refreshRecentProjects();
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    } finally {
      setLoadState("idle");
      setLoadStatus(defaultWorkspaceLoadStatus);
    }
  }

  async function refreshWorkspace(): Promise<void> {
    if (!workspace) {
      return;
    }

    await runWorkspaceLoad(
      () => window.difftray.loadProject(workspace.project.id),
      selectedFile?.path,
      {
        detail: workspace.project.name,
        title: "Refreshing repository"
      }
    );
  }

  async function handleProjectChanged(event: ProjectChangedEvent): Promise<void> {
    workspaceCacheRef.current.delete(event.projectId);
    invalidateProjectReviewSummary(event.projectId);

    if (loadState === "loading") {
      return;
    }

    if (workspace?.project.id === event.projectId && !settingsOpen && !paletteOpen) {
      await runWorkspaceLoad(
        () => window.difftray.loadProject(event.projectId),
        selectedFile?.path,
        {
          detail: "Local changes changed",
          title: "Refreshing repository"
        }
      );
      return;
    }

    await refreshRecentProjects();
  }

  async function openSettings(): Promise<void> {
    if (!workspace) {
      return;
    }

    setError(undefined);
    setLoadState("loading");
    setLoadStatus({
      detail: "Reading current preferences",
      title: "Opening settings"
    });
    await nextPaint();

    try {
      const [nextAppSettings, nextProjectSettings, nextCompanionState] =
        await Promise.all([
          window.difftray.getAppSettings(),
          window.difftray.getProjectSettings(workspace.project.id),
          window.difftray.getCompanionState()
        ]);

      setAppSettings(nextAppSettings);
      setAppSettingsDraft(nextAppSettings);
      setProjectSettings(nextProjectSettings);
      setCompanionState(nextCompanionState);
      setCompanionPairing(nextCompanionState.activePairing);
      setSettingsOpen(true);
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    } finally {
      setLoadState("idle");
      setLoadStatus(defaultWorkspaceLoadStatus);
    }
  }

  function closeSettings(): void {
    setSettingsOpen(false);
    setAppSettingsDraft(appSettings);
  }

  function openPalette(mode: PaletteMode): void {
    setPaletteMode(mode);
    setPaletteQuery("");
    setPaletteOpen(true);
  }

  function closePalette(): void {
    setPaletteOpen(false);
    setPaletteQuery("");
  }

  function updateAppSettingsDraft(patch: Partial<AppSettingsView>): void {
    setAppSettingsDraft((draft) => ({ ...draft, ...patch }));
  }

  async function toggleCompanion(enabled: boolean): Promise<void> {
    const nextSettings = {
      ...appSettings,
      companionEnabled: enabled
    };
    setAppSettings(nextSettings);
    setAppSettingsDraft((draft) => ({ ...draft, companionEnabled: enabled }));

    try {
      const nextState = await window.difftray.setCompanionEnabled(enabled);
      setCompanionState(nextState);
      setCompanionPairing(nextState.activePairing);
      setAppSettings((settings) => ({
        ...settings,
        companionEnabled: nextState.enabled
      }));
      setAppSettingsDraft((draft) => ({
        ...draft,
        companionEnabled: nextState.enabled
      }));
    } catch (caughtError) {
      setError(errorMessage(caughtError));
      const restoredState = await window.difftray.getCompanionState();
      setCompanionState(restoredState);
      setCompanionPairing(restoredState.activePairing);
      setAppSettings(appSettings);
      setAppSettingsDraft((draft) => ({
        ...draft,
        companionEnabled: appSettings.companionEnabled
      }));
    }
  }

  async function startCompanionPairing(): Promise<void> {
    try {
      const pairing = await window.difftray.startCompanionPairing();
      setCompanionPairing(pairing);
      const nextState = await window.difftray.getCompanionState();
      setCompanionState(nextState);
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    }
  }

  async function cancelCompanionPairing(): Promise<void> {
    try {
      const nextState = await window.difftray.cancelCompanionPairing();
      setCompanionState(nextState);
      setCompanionPairing(nextState.activePairing);
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    }
  }

  async function respondToCompanionPairRequest(
    input: RespondToCompanionPairRequestInput
  ): Promise<void> {
    try {
      const nextState = await window.difftray.respondToCompanionPairRequest(input);
      setCompanionState(nextState);
      setCompanionPairing(nextState.activePairing);
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    }
  }

  async function revokeCompanionDevice(id: string): Promise<void> {
    try {
      const nextState = await window.difftray.revokeCompanionDevice(id);
      setCompanionState(nextState);
      setCompanionPairing(nextState.activePairing);
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    }
  }

  async function saveSettings(): Promise<void> {
    if (!workspace) {
      return;
    }

    const settingsError = editorSettingsError(appSettingsDraft);

    if (settingsError) {
      setError(settingsError);
      return;
    }

    setError(undefined);
    invalidatePendingSilentWorkspaceRefreshes();
    setLoadState("loading");
    setLoadStatus({
      detail: "Refreshing review after preferences change",
      title: "Saving settings"
    });
    await nextPaint();

    try {
      const [savedAppSettings, savedSettings] = await Promise.all([
        window.difftray.updateAppSettings(updateAppSettingsInput(appSettingsDraft)),
        window.difftray.updateProjectSettings({
          fileListCollapsed: projectSettings.fileListCollapsed,
          fileListWidth: projectSettings.fileListWidth,
          projectId: workspace.project.id
        })
      ]);
      const nextWorkspace = await window.difftray.loadProject(workspace.project.id);

      setAppSettings(savedAppSettings);
      setAppSettingsDraft(savedAppSettings);
      setProjectSettings(savedSettings);
      setDiffMode(savedAppSettings.defaultDiffMode);
      setFileListWidth(savedSettings.fileListWidth);
      setFileListCollapsed(savedSettings.fileListCollapsed);
      setSettingsOpen(false);
      if (nextWorkspace) {
        await applyWorkspace(
          nextWorkspace,
          visiblePathOrFirst(nextWorkspace, selectedPath),
          {
            appSettings: savedAppSettings
          }
        );
      } else {
        setWorkspace(undefined);
        setSelectedPath(undefined);
        setBranchRefs([]);
        setBaseRefDraft("");
      }
      await refreshRecentProjects();
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    } finally {
      setLoadState("idle");
      setLoadStatus(defaultWorkspaceLoadStatus);
    }
  }

  async function persistProjectSettings(
    patch: Partial<ProjectSettingsView>
  ): Promise<void> {
    if (!workspace) {
      return;
    }

    const nextSettings = {
      ...projectSettings,
      ...patch,
      projectId: workspace.project.id
    };
    setProjectSettings(nextSettings);

    try {
      const savedSettings = await window.difftray.updateProjectSettings({
        fileListCollapsed: nextSettings.fileListCollapsed,
        fileListWidth: nextSettings.fileListWidth,
        projectId: workspace.project.id
      });

      setProjectSettings(savedSettings);
      workspaceCacheRef.current.set(workspace.project.id, {
        branchRefs,
        recentCommits,
        projectSettings: savedSettings,
        workspace
      });
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    }
  }

  async function persistAppSettings(patch: Partial<AppSettingsView>): Promise<void> {
    const nextSettings = {
      ...appSettings,
      ...patch
    };
    setAppSettings(nextSettings);
    setAppSettingsDraft(nextSettings);

    try {
      const savedSettings = await window.difftray.updateAppSettings(
        updateAppSettingsInput(nextSettings)
      );

      setAppSettings(savedSettings);
      setAppSettingsDraft(savedSettings);
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    }
  }

  function setAndPersistDiffMode(mode: DiffMode): void {
    const scrollPosition = diffSurfaceRef.current
      ? normalizeDiffScrollPosition({
          left: diffSurfaceRef.current.scrollLeft,
          top: diffSurfaceRef.current.scrollTop
        })
      : topDiffScrollPosition;

    if (selectedDiffScrollKey) {
      rememberDiffScrollPosition(selectedDiffScrollKey, scrollPosition);
    }

    setDiffMode(mode);
    window.setTimeout(() => {
      if (diffSurfaceRef.current) {
        diffSurfaceRef.current.scrollLeft = scrollPosition.left;
        diffSurfaceRef.current.scrollTop = scrollPosition.top;
      }
    }, 0);
    void persistAppSettings({ defaultDiffMode: mode });
  }

  async function setProjectDiffTarget(
    mode: ReviewDiffTargetMode,
    refName?: string
  ): Promise<void> {
    if (!workspace) {
      return;
    }

    if (mode === "branch") {
      const nextBaseRef = (refName ?? baseRefDraft).trim();

      if (nextBaseRef.length === 0) {
        setError("Choose a base branch before switching to branch diff.");
        return;
      }

      setBaseRefDraft(nextBaseRef);
      await runWorkspaceLoad(
        () =>
          window.difftray.updateProjectDiffTarget({
            baseRefName: nextBaseRef,
            mode: "branch",
            projectId: workspace.project.id
          }),
        selectedFile?.path,
        {
          detail: nextBaseRef,
          title: "Switching diff target"
        }
      );
      return;
    }

    if (mode === "commit") {
      const nextCommitRef = (refName ?? commitRefDraft).trim();

      if (nextCommitRef.length === 0) {
        setError("Choose a commit before switching to commit diff.");
        return;
      }

      setCommitRefDraft(nextCommitRef);
      await runWorkspaceLoad(
        () =>
          window.difftray.updateProjectDiffTarget({
            commitRef: nextCommitRef,
            mode: "commit",
            projectId: workspace.project.id
          }),
        selectedFile?.path,
        {
          detail: nextCommitRef,
          title: "Switching diff target"
        }
      );
      return;
    }

    await runWorkspaceLoad(
      () =>
        window.difftray.updateProjectDiffTarget({
          mode: "working_tree",
          projectId: workspace.project.id
        }),
      selectedFile?.path,
      {
        detail: workspace.project.name,
        title: "Switching diff target"
      }
    );
  }

  function toggleFileListCollapsed(): void {
    const nextCollapsed = !fileListCollapsed;
    setFileListCollapsed(nextCollapsed);
    void persistProjectSettings({ fileListCollapsed: nextCollapsed });
  }

  function selectRelativeFile(offset: 1 | -1): void {
    if (visibleFiles.length === 0) {
      return;
    }

    const selectedIndex = selectedFile
      ? visibleFiles.findIndex((file) => file.path === selectedFile.path)
      : -1;
    const nextIndex =
      selectedIndex === -1
        ? offset > 0
          ? 0
          : visibleFiles.length - 1
        : clampIndex(selectedIndex + offset, visibleFiles.length);
    const nextFile = visibleFiles[nextIndex];

    if (nextFile) {
      selectPath(nextFile.path);
    }
  }

  async function markSelectedReviewed(): Promise<void> {
    if (
      !workspace ||
      !selectedFile ||
      selectedFile.reviewed ||
      !selectedFile.diffLoaded
    ) {
      return;
    }

    const optimisticFile = selectedFile;
    const actionId = nextReviewNavigationPerformanceIdRef.current + 1;
    const startedAt = performance.now();
    const optimisticWorkspace = {
      ...workspace,
      files: workspace.files.map((file) =>
        file.path === optimisticFile.path
          ? { ...file, invalidated: false, reviewed: true }
          : file
      )
    };
    const optimisticNextPath =
      nextPendingPath(optimisticWorkspace, optimisticFile.path) ??
      visiblePathOrFirst(optimisticWorkspace, optimisticFile.path);

    nextReviewNavigationPerformanceIdRef.current = actionId;
    reviewNavigationPerformanceRef.current = {
      diffLoadedLogged: false,
      fromPath: optimisticFile.path,
      id: actionId,
      renderReadyLogged: false,
      startedAt,
      toPath: optimisticNextPath
    };
    setError(undefined);
    invalidatePendingSilentWorkspaceRefreshes();
    const markApplyVersion = workspaceApplyVersionRef.current;
    setWorkspace(optimisticWorkspace);
    workspaceRef.current = optimisticWorkspace;
    workspaceCacheRef.current.set(optimisticWorkspace.project.id, {
      branchRefs,
      recentCommits,
      projectSettings,
      workspace: optimisticWorkspace
    });
    logRendererPerformance("review.mark.optimistic_advance", {
      actionId,
      elapsedMs: elapsedSince(startedAt),
      fromPath: optimisticFile.path,
      toPath: optimisticNextPath
    });

    if (
      optimisticNextPath &&
      !isFileDiffLoaded(optimisticWorkspace, optimisticNextPath)
    ) {
      try {
        await loadFileDiffIntoWorkspace({
          filePath: optimisticNextPath,
          projectId: optimisticWorkspace.project.id,
          reviewTargetId: optimisticWorkspace.reviewTarget.id,
          showDelayedLoader: false
        });
      } catch (caughtError) {
        setError(errorMessage(caughtError));
      }
    }

    if (workspaceApplyVersionRef.current !== markApplyVersion) {
      return;
    }

    if (selectedPathRef.current === optimisticFile.path) {
      selectPath(optimisticNextPath);
    }

    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        resolve();
      });
    });

    try {
      const result = await window.difftray.markFileReviewed({
        displayedDiffHash: optimisticFile.diffHash,
        path: optimisticFile.path,
        projectId: workspace.project.id,
        reviewTargetId: workspace.reviewTarget.id
      });
      const nextWorkspace = carryLoadedDiffsForward(
        workspaceRef.current,
        result.workspace
      );
      const userSelectedPath = selectedPathRef.current;
      const nextPath =
        userSelectedPath === optimisticFile.path
          ? (nextPendingPath(nextWorkspace, optimisticFile.path) ??
            visiblePathOrFirst(nextWorkspace, optimisticFile.path))
          : visiblePathOrFirst(nextWorkspace, userSelectedPath);

      logRendererPerformance("review.mark.ipc_result", {
        actionId,
        elapsedMs: elapsedSince(startedAt),
        fromPath: optimisticFile.path,
        status: result.status,
        toPath: nextPath
      });
      if (workspaceApplyVersionRef.current !== markApplyVersion) {
        return;
      }

      setWorkspace(nextWorkspace);
      workspaceRef.current = nextWorkspace;
      selectPath(nextPath);
      updateRecentProjectReviewSummary(
        nextWorkspace.project.id,
        projectReviewSummary(nextWorkspace)
      );
      workspaceCacheRef.current.set(nextWorkspace.project.id, {
        branchRefs,
        recentCommits,
        projectSettings,
        workspace: nextWorkspace
      });

      if (result.status === "rejected") {
        setError(
          result.reason === "stale_diff"
            ? "The diff changed before it could be marked reviewed."
            : "The selected file is no longer present in this review."
        );
      }
    } catch (caughtError) {
      if (workspaceApplyVersionRef.current !== markApplyVersion) {
        return;
      }

      setError(errorMessage(caughtError));
      await refreshWorkspace();
    }
  }

  async function unmarkSelectedReviewed(): Promise<void> {
    if (!workspace || selectedFile?.reviewed !== true || !selectedFile.diffLoaded) {
      return;
    }

    const optimisticFile = selectedFile;
    const optimisticWorkspace = {
      ...workspace,
      files: workspace.files.map((file) =>
        file.path === optimisticFile.path
          ? { ...file, invalidated: false, reviewed: false }
          : file
      )
    };

    setError(undefined);
    invalidatePendingSilentWorkspaceRefreshes();
    setWorkspace(optimisticWorkspace);
    workspaceRef.current = optimisticWorkspace;

    try {
      const result = await window.difftray.unmarkFileReviewed({
        displayedDiffHash: optimisticFile.diffHash,
        path: optimisticFile.path,
        projectId: workspace.project.id,
        reviewTargetId: workspace.reviewTarget.id
      });

      const nextWorkspace = carryLoadedDiffsForward(
        optimisticWorkspace,
        result.workspace
      );
      const userSelectedPath = selectedPathRef.current;
      const nextPath =
        userSelectedPath === optimisticFile.path
          ? visiblePathOrFirst(nextWorkspace, optimisticFile.path)
          : visiblePathOrFirst(nextWorkspace, userSelectedPath);

      setWorkspace(nextWorkspace);
      workspaceRef.current = nextWorkspace;
      selectPath(nextPath);
      updateRecentProjectReviewSummary(
        nextWorkspace.project.id,
        projectReviewSummary(nextWorkspace)
      );
      workspaceCacheRef.current.set(nextWorkspace.project.id, {
        branchRefs,
        recentCommits,
        projectSettings,
        workspace: nextWorkspace
      });

      if (result.status === "rejected") {
        setError(
          result.reason === "stale_diff"
            ? "The diff changed before it could be unmarked."
            : "The selected file is no longer present in this review."
        );
      }
    } catch (caughtError) {
      setError(errorMessage(caughtError));
      await refreshWorkspace();
    }
  }

  async function toggleSelectedReviewed(): Promise<void> {
    if (selectedFile?.reviewed) {
      await unmarkSelectedReviewed();
    } else {
      await markSelectedReviewed();
    }
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

  function applyWorkspaceComments(
    updateComments: (
      comments: readonly ReviewCommentView[]
    ) => readonly ReviewCommentView[]
  ): void {
    setWorkspace((currentWorkspace) => {
      if (!currentWorkspace) {
        return currentWorkspace;
      }

      const nextWorkspace = {
        ...currentWorkspace,
        comments: sortReviewComments(updateComments(currentWorkspace.comments))
      };

      workspaceCacheRef.current.set(nextWorkspace.project.id, {
        branchRefs,
        recentCommits,
        projectSettings,
        workspace: nextWorkspace
      });

      return nextWorkspace;
    });
  }

  function startComment(side: ReviewCommentSide, lineNumber: number): void {
    if (!selectedFile?.diffLoaded) {
      return;
    }

    setCommentDraft({
      body: "",
      diffHash: selectedFile.diffHash,
      lineEnd: lineNumber,
      lineStart: lineNumber,
      path: selectedFile.path,
      side
    });
  }

  async function runWithCommentSavePending(
    pending: CommentSavePending,
    action: () => Promise<boolean>
  ): Promise<boolean> {
    if (commentSavePendingRef.current) {
      return false;
    }

    commentSavePendingRef.current = pending;
    setCommentSavePending(pending);

    const loaderTimerId = window.setTimeout(() => {
      if (sameCommentSavePending(commentSavePendingRef.current, pending)) {
        visibleCommentSavePendingRef.current = pending;
        setVisibleCommentSavePending(pending);
      }
    }, delayedCommentSaveIndicatorMs);

    try {
      return await action();
    } finally {
      window.clearTimeout(loaderTimerId);

      if (sameCommentSavePending(commentSavePendingRef.current, pending)) {
        commentSavePendingRef.current = undefined;
        setCommentSavePending(undefined);
      }

      if (sameCommentSavePending(visibleCommentSavePendingRef.current, pending)) {
        visibleCommentSavePendingRef.current = undefined;
        setVisibleCommentSavePending(undefined);
      }
    }
  }

  async function saveCommentDraft(): Promise<boolean> {
    if (!workspace || !selectedFile || !commentDraft) {
      return false;
    }

    const body = commentDraft.body.trim();

    if (body.length === 0) {
      return false;
    }

    setError(undefined);

    return runWithCommentSavePending(
      {
        diffHash: commentDraft.diffHash,
        kind: "draft",
        lineEnd: commentDraft.lineEnd,
        lineStart: commentDraft.lineStart,
        path: commentDraft.path,
        side: commentDraft.side
      },
      async () => {
        try {
          const result = await window.difftray.createReviewComment({
            body,
            displayedDiffHash: selectedFile.diffHash,
            lineEnd: commentDraft.lineEnd,
            lineStart: commentDraft.lineStart,
            path: selectedFile.path,
            projectId: workspace.project.id,
            reviewTargetId: workspace.reviewTarget.id,
            side: commentDraft.side
          });

          if (result.status === "rejected") {
            setError(
              result.reason === "stale_diff"
                ? "The diff changed before the comment could be saved."
                : "The selected file is no longer present in this review."
            );
            await refreshWorkspace();
            return false;
          }

          applyWorkspaceComments((comments) => [...comments, result.comment]);
          setCommentDraft(undefined);
          return true;
        } catch (caughtError) {
          setError(errorMessage(caughtError));
          return false;
        }
      }
    );
  }

  async function updateComment(commentId: string, body: string): Promise<boolean> {
    const trimmedBody = body.trim();

    if (trimmedBody.length === 0) {
      return false;
    }

    setError(undefined);

    return runWithCommentSavePending(
      {
        commentId,
        kind: "update"
      },
      async () => {
        try {
          const result = await window.difftray.updateReviewComment({
            body: trimmedBody,
            id: commentId
          });

          if (result.status === "rejected") {
            applyWorkspaceComments((comments) =>
              comments.filter((comment) => comment.id !== commentId)
            );
            setError("That review comment is no longer present.");
            return false;
          }

          applyWorkspaceComments((comments) =>
            comments.map((comment) =>
              comment.id === result.comment.id ? result.comment : comment
            )
          );
          return true;
        } catch (caughtError) {
          setError(errorMessage(caughtError));
          return false;
        }
      }
    );
  }

  async function installDownloadedUpdate(): Promise<void> {
    try {
      await window.difftray.installAndRelaunch();
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    }
  }

  async function checkForUpdates(): Promise<void> {
    setError(undefined);

    try {
      const phase = await window.difftray.checkForUpdates();

      setUpdatePhase(phase);

      if (phase.kind === "idle") {
        setCommentToast("Difftray is up to date");
      } else if (phase.kind === "error") {
        setError(phase.message);
      }
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    }
  }

  async function deleteComment(commentId: string): Promise<void> {
    setError(undefined);

    try {
      const result = await window.difftray.deleteReviewComment({ id: commentId });

      if (result.status === "rejected") {
        setError("That review comment is no longer present.");
      }

      applyWorkspaceComments((comments) =>
        comments.filter((comment) => comment.id !== commentId)
      );
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    }
  }

  async function copyReviewCommentsReport(): Promise<void> {
    if (
      !workspace ||
      workspace.comments.length === 0 ||
      commentReportCopyPendingRef.current
    ) {
      return;
    }

    setError(undefined);
    commentReportCopyPendingRef.current = true;
    setCommentReportCopyPending(true);

    try {
      const result = await window.difftray.copyReviewCommentsReport({
        expectedCommentIds: workspace.comments.map((comment) => comment.id),
        projectId: workspace.project.id,
        reviewTargetId: workspace.reviewTarget.id
      });

      if (result.status === "rejected") {
        setError("The diff changed before the comment report could be copied.");
        await refreshWorkspace();
        return;
      }

      setCommentToast(
        result.commentCount === 1
          ? "Copied 1 review comment"
          : `Copied ${String(result.commentCount)} review comments`
      );
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    } finally {
      commentReportCopyPendingRef.current = false;
      setCommentReportCopyPending(false);
    }
  }

  function startResize(event: React.PointerEvent<HTMLDivElement>): void {
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeStartRef.current = { startWidth: fileListWidth, x: event.clientX };
  }

  function updateResize(event: React.PointerEvent<HTMLDivElement>): void {
    if (!resizeStartRef.current) {
      return;
    }

    setFileListWidth(
      clampNumber(
        resizeStartRef.current.startWidth + event.clientX - resizeStartRef.current.x,
        220,
        540
      )
    );
  }

  function endResize(): void {
    if (!resizeStartRef.current) {
      return;
    }

    resizeStartRef.current = null;
    void persistProjectSettings({ fileListWidth });
  }

  return (
    <main className={styles.windowShell}>
      <div className={styles.titlebarDragArea}>
        {activeProject ? (
          <div className={styles.titlebarProjectName}>{activeProject.name}</div>
        ) : null}
      </div>

      {workspace && activeProject ? (
        <ProjectTabBar
          activeProjectId={activeProject.id}
          {...(activeReviewSummary ? { activeReviewSummary } : {})}
          disabled={loadState === "loading"}
          {...(loadState === "loading" ? { loadingStatus: loadStatus } : {})}
          tabDragCancelKey={tabDragCancelKey}
          onOpenProject={() => {
            void openProject();
          }}
          onCloseActiveProject={() => {
            void closeProject(workspace.project.id);
          }}
          onOpenSettings={() => {
            void openSettings();
          }}
          onReorderProjects={(nextProjects) => {
            setRecentProjects(nextProjects);
          }}
          onCommitProjectOrder={({ nextProjects, rollbackProjects }) => {
            const reorderUpdate = prepareProjectTabReorderUpdate(
              rollbackProjects,
              nextProjects
            );

            if (!reorderUpdate) {
              return;
            }

            setRecentProjects(reorderUpdate.nextProjects);
            projectTabOrderSaveQueueRef.current.enqueue({
              onFailure: (caughtError: unknown) => {
                setRecentProjects(reorderUpdate.rollbackProjects);
                setError(errorMessage(caughtError));
                setTabDragCancelKey((key) => key + 1);
              },
              projectIds: reorderUpdate.nextProjects.map((project) => project.id),
              save: (projectIds) => window.difftray.saveProjectTabOrder(projectIds)
            });
          }}
          onSelectProject={(projectId) => {
            void loadProject(projectId);
          }}
          projects={recentProjects}
          summaryLoadingProjectIds={tabSummaryLoadingProjectIds}
        />
      ) : null}

      {error ? (
        <div className={styles.errorBanner} role="status">
          <span className={styles.errorBannerMessage}>{error}</span>
          <button
            type="button"
            className={styles.errorBannerClose}
            aria-label="Dismiss error"
            onClick={() => {
              setError(undefined);
            }}
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      ) : null}

      {updatePhase.kind === "downloaded" ? (
        <UpdateRestartBanner
          onRestart={() => {
            void installDownloadedUpdate();
          }}
          version={updatePhase.version}
        />
      ) : null}

      {workspace ? (
        <section className={styles.workspaceBody} aria-label="Review workspace">
          {showActiveWorkspaceLoading ? <TabLoadBanner status={loadStatus} /> : null}
          <section className={styles.mainLayout} aria-busy={showActiveWorkspaceLoading}>
            {fileListCollapsed ? (
              <CollapsedRail
                disabled={showActiveWorkspaceLoading}
                files={visibleFiles}
                onExpand={toggleFileListCollapsed}
                progress={workspace.progress}
              />
            ) : (
              <nav
                className={styles.filePane}
                style={{ width: `${String(fileListWidth)}px` }}
                aria-label="Changed files"
              >
                <FileListHeader
                  attentionCount={attentionFiles.length}
                  baseRefDraft={baseRefDraft}
                  branchRefs={branchRefs}
                  commitRefDraft={commitRefDraft}
                  disabled={loadState === "loading"}
                  files={visibleFiles}
                  onBaseRefDraftChange={setBaseRefDraft}
                  onCommitRefDraftChange={setCommitRefDraft}
                  onCollapse={toggleFileListCollapsed}
                  onUseBranchDiff={(baseRefName) => {
                    void setProjectDiffTarget("branch", baseRefName);
                  }}
                  onUseCommitDiff={(commitRef) => {
                    void setProjectDiffTarget("commit", commitRef);
                  }}
                  onUseWorkingTreeDiff={() => {
                    void setProjectDiffTarget("working_tree");
                  }}
                  onRefresh={() => {
                    void refreshWorkspace();
                  }}
                  progress={workspace.progress}
                  recentCommits={recentCommits}
                  reviewTarget={workspace.reviewTarget}
                />
                <FileList
                  commentCountByPath={commentCountByPath}
                  files={visibleFiles}
                  onSelect={selectPath}
                  selectedPath={selectedFile?.path}
                />
                <div className={styles.fileFooter}>
                  <span>
                    <kbd>↑</kbd> <kbd>↓</kbd> navigate
                  </span>
                  <span>
                    <kbd>R</kbd> review
                  </span>
                </div>
                <div
                  aria-label="Resize file list"
                  className={styles.resizeHandle}
                  onPointerDown={startResize}
                  onPointerMove={updateResize}
                  onPointerUp={endResize}
                  role="separator"
                />
              </nav>
            )}

            <article
              className={styles.diffPane}
              aria-label="Diff preview"
              data-loading={showActiveWorkspaceLoading ? true : undefined}
            >
              {selectedFile ? (
                <>
                  <DiffToolbar
                    commentCount={selectedComments.length}
                    copyDisabled={loadState === "loading" || commentReportCopyPending}
                    copyPending={commentReportCopyPending}
                    diffMode={diffMode}
                    diffSideFocus={selectedDiffSideFocus}
                    disabled={loadState === "loading" || !selectedFile.diffLoaded}
                    file={selectedFile}
                    onCheckForUpdates={() => {
                      void checkForUpdates();
                    }}
                    onCopyCommentsReport={() => {
                      void copyReviewCommentsReport();
                    }}
                    onDiffSideFocusChange={setDiffSideFocus}
                    onToggleReviewed={() => {
                      void toggleSelectedReviewed();
                    }}
                    onOpenEditor={() => {
                      void openSelectedInEditor();
                    }}
                    refName={diffTargetLabel(workspace.reviewTarget)}
                    reportCommentCount={workspace.comments.length}
                    updatePhase={updatePhase}
                  />
                  {selectedFile.patch ? (
                    <DiffSurface
                      commentDraft={
                        commentDraft?.path === selectedFile.path &&
                        commentDraft.diffHash === selectedFile.diffHash
                          ? commentDraft
                          : undefined
                      }
                      comments={selectedComments}
                      diffHash={selectedFile.diffHash}
                      diffMode={diffMode}
                      diffSideFocus={selectedDiffSideFocus}
                      filePath={selectedFile.path}
                      key={selectedDiffScrollKey ?? selectedFile.diffHash}
                      {...(loadSelectedFileImage
                        ? { loadImage: loadSelectedFileImage }
                        : {})}
                      newText={selectedFile.newText}
                      oldText={selectedFile.oldText}
                      patch={selectedFile.patch}
                      pendingCommentSave={commentSavePending}
                      previousPath={selectedFile.previousPath}
                      resolvedTheme={resolvedTheme}
                      status={selectedFile.status}
                      visiblePendingCommentSave={visibleCommentSavePending}
                      onCancelComment={() => {
                        setCommentDraft(undefined);
                      }}
                      onCommentDraftBodyChange={(body) => {
                        setCommentDraft((draft) => (draft ? { ...draft, body } : draft));
                      }}
                      onDeleteComment={(commentId) => {
                        void deleteComment(commentId);
                      }}
                      onRenderModelReady={handleDiffRenderModelReady}
                      onSaveComment={() => {
                        return saveCommentDraft();
                      }}
                      refObject={diffSurfaceRef}
                      onScrollPositionChange={rememberDiffScrollPosition}
                      onStartComment={startComment}
                      onUpdateComment={(commentId, body) => {
                        return updateComment(commentId, body);
                      }}
                      scrollKey={selectedDiffScrollKey ?? ""}
                      scrollPosition={
                        selectedDiffScrollKey
                          ? diffScrollPositionsRef.current.get(selectedDiffScrollKey)
                          : undefined
                      }
                      wrapLines={appSettings.wrapDiffLines}
                    />
                  ) : (
                    <DiffLoadingState
                      filePath={selectedFile.path}
                      status={
                        visibleLoadingDiffPath === selectedFile.path
                          ? "loading"
                          : loadingDiffPath === selectedFile.path
                            ? "deferred"
                            : "idle"
                      }
                    />
                  )}
                </>
              ) : (
                <div className={styles.noFileState}>No changed files</div>
              )}
            </article>

            {showDriftToast ? (
              <DriftToast
                files={attentionFiles}
                onClose={() => {
                  setToastDismissedFor(toastKey);
                }}
                onReviewNow={() => {
                  selectPath(attentionFiles[0]?.path);
                  setToastDismissedFor(toastKey);
                }}
              />
            ) : null}
            {commentToast ? <SimpleToast message={commentToast} /> : null}
          </section>
        </section>
      ) : loadState === "loading" || !hasBootstrapped || recentProjects.length > 0 ? (
        <section className={styles.launchState} aria-label={loadStatus.title}>
          <div className={styles.loadingMark} aria-hidden />
          <div className={styles.loadingTitle}>{loadStatus.title}</div>
          <div className={styles.loadingMeta}>{loadStatus.detail}</div>
          <LoadingProgress status={loadStatus} />
        </section>
      ) : (
        <EmptyState
          disabled={false}
          onOpenProject={() => {
            void openProject();
          }}
          onSelectProject={(projectId) => {
            void loadProject(projectId);
          }}
          projects={recentProjects}
        />
      )}

      {paletteOpen ? (
        <CommandPalette
          commands={filteredCommands}
          mode={paletteMode}
          onClose={closePalette}
          onQueryChange={setPaletteQuery}
          query={paletteQuery}
          selectedIndex={paletteSelected}
          setSelectedIndex={setPaletteSelected}
          inputRef={paletteInputRef}
        />
      ) : null}

      {settingsOpen ? (
        <SettingsPanel
          appSettings={appSettingsDraft}
          companionPairing={companionPairing}
          companionState={companionState}
          disabled={loadState === "loading"}
          editorOptions={editorOptions}
          onCancel={closeSettings}
          onCancelCompanionPairing={() => {
            void cancelCompanionPairing();
          }}
          onChangeAppSettings={updateAppSettingsDraft}
          onRespondToCompanionPairRequest={(input) => {
            void respondToCompanionPairRequest(input);
          }}
          onRevokeCompanionDevice={(id) => {
            void revokeCompanionDevice(id);
          }}
          onSave={() => {
            void saveSettings();
          }}
          onStartCompanionPairing={() => {
            void startCompanionPairing();
          }}
          onToggleCompanion={(enabled) => {
            void toggleCompanion(enabled);
          }}
        />
      ) : null}
    </main>
  );
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        resolve();
      });
    });
  });
}
