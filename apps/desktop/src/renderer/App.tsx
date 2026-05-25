import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  parseDiffSegments,
  type CollapsedDiffContextSegment,
  type ParsedDiffHunkSegment,
  type ParsedDiffLine,
  type ParsedDiffSegment
} from "@difftray/core/diff-context";
import { createHighlighterCore } from "shiki/core";
import type { HighlighterCore, ThemedToken } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { bundledLanguages, bundledLanguagesInfo } from "shiki/langs";
import type { BundledLanguage } from "shiki/langs";
import githubDarkTheme from "shiki/themes/github-dark.mjs";
import githubLightTheme from "shiki/themes/github-light.mjs";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Diff,
  ExternalLink,
  FileCode2,
  Folder,
  FolderOpen,
  GitBranch,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  X
} from "lucide-react";

import styles from "./App.module.css";
import {
  mergeProjectTabs,
  reorderProjectTabs,
  type ProjectTabDropPosition
} from "./project-tabs.js";
import {
  carryLoadedDiffsForward,
  shouldApplySilentWorkspaceRefresh
} from "./workspace-refresh.js";

type LoadState = "idle" | "loading";
type DiffMode = "split" | "unified";
type ReviewDiffTargetMode = "branch" | "working_tree";
type ReviewState = "attention" | "pending" | "reviewed" | "unknown";
type PaletteMode = "all" | "files";
type CommandKind = "action" | "file" | "project";
type ResolvedTheme = "dark" | "light";
type HighlightedLineMap = ReadonlyMap<string, readonly ThemedToken[]>;
type SyntaxLanguage = BundledLanguage | "text";

type WorkspaceLoadStatus = {
  readonly detail: string;
  readonly loadedFiles?: number;
  readonly title: string;
  readonly totalFiles?: number;
};

type DiffParseState =
  | {
      readonly key: string;
      readonly status: "parsing";
    }
  | {
      readonly key: string;
      readonly segments: readonly ParsedDiffSegment[];
      readonly status: "ready";
    };

type CommandItem = {
  readonly id: string;
  readonly hint?: string;
  readonly icon: React.JSX.Element;
  readonly kind: CommandKind;
  readonly label: string;
  readonly run: () => void;
  readonly shortcut?: string;
  readonly sub: string;
};

type WorkspaceCacheEntry = {
  readonly branchRefs: readonly string[];
  readonly projectSettings: ProjectSettingsView;
  readonly workspace: ReviewWorkspaceView;
};

type ApplyWorkspaceOptions = {
  readonly appSettings?: AppSettingsView;
  readonly branchRefs?: readonly string[];
  readonly projectSettings?: ProjectSettingsView;
};

const defaultAppSettings: AppSettingsView = {
  autoCollapseHunksOver: 120,
  defaultDiffMode: "split",
  editorArgs: "",
  editorArgList: [],
  editorCommand: "",
  editorMode: "system",
  hideWhitespaceOnlyChanges: false,
  notifyOnDrift: true,
  reviewResetTrigger: "diff_content",
  showGeneratedFiles: false,
  themeMode: "system"
};

const defaultProjectSettings: ProjectSettingsView = {
  fileListCollapsed: false,
  fileListWidth: 340,
  projectId: ""
};

const defaultWorkspaceLoadStatus: WorkspaceLoadStatus = {
  detail: "Preparing local diffs",
  title: "Loading repository"
};

const immediateTabSwitchLoaderFileThreshold = 75;
const delayedTabSwitchLoaderMs = 500;
const delayedFileDiffLoaderMs = 500;
const fileListRowHeight = 54;
const fileListOverscanRows = 8;
const maxHighlightedDiffLines = 800;

const syntaxThemes = {
  dark: "github-dark",
  light: "github-light"
} as const satisfies Record<ResolvedTheme, string>;

const syntaxLanguageAliases = buildSyntaxLanguageAliases();

let highlighterPromise: Promise<HighlighterCore> | undefined;

export function App(): React.JSX.Element {
  const [appSettings, setAppSettings] = useState<AppSettingsView>(defaultAppSettings);
  const [appSettingsDraft, setAppSettingsDraft] =
    useState<AppSettingsView>(defaultAppSettings);
  const [baseRefDraft, setBaseRefDraft] = useState("");
  const [branchRefs, setBranchRefs] = useState<readonly string[]>([]);
  const [diffMode, setDiffMode] = useState<DiffMode>("split");
  const [error, setError] = useState<string | undefined>();
  const [editorOptions, setEditorOptions] = useState<readonly EditorPresetView[]>([]);
  const [fileListCollapsed, setFileListCollapsed] = useState(false);
  const [fileListWidth, setFileListWidth] = useState(340);
  const [hasBootstrapped, setHasBootstrapped] = useState(false);
  const [loadingDiffPath, setLoadingDiffPath] = useState<string | undefined>();
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
  const [workspace, setWorkspace] = useState<ReviewWorkspaceView | undefined>();
  const diffSurfaceRef = useRef<HTMLDivElement>(null);
  const paletteInputRef = useRef<HTMLInputElement>(null);
  const focusRefreshRunningRef = useRef(false);
  const lastFocusRefreshAtRef = useRef(0);
  const loadStateRef = useRef<LoadState>("idle");
  const paletteOpenRef = useRef(false);
  const selectedPathRef = useRef<string | undefined>(undefined);
  const settingsOpenRef = useRef(false);
  const selectedPathByProjectRef = useRef<Map<string, string>>(new Map());
  const tabSummaryInvalidationRef = useRef<Map<string, number>>(new Map());
  const tabSummaryLoadQueueRef = useRef<Promise<void>>(Promise.resolve());
  const tabSummaryLoadsInFlightRef = useRef<Set<string>>(new Set());
  const tabSummaryLoadSkippedRef = useRef<Set<string>>(new Set());
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

  useEffect(() => {
    if (paletteOpen) {
      setPaletteSelected(0);
      window.setTimeout(() => paletteInputRef.current?.focus(), 0);
    }
  }, [paletteOpen, paletteMode, paletteQuery]);

  useEffect(() => {
    if (workspace && selectedPath) {
      selectedPathByProjectRef.current.set(workspace.project.id, selectedPath);
    }
  }, [selectedPath, workspace]);

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
          filteredCommands[paletteSelected]?.run();
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

  useEffect(() => {
    if (!workspace || !selectedFile || selectedFile.diffLoaded) {
      return;
    }

    const projectId = workspace.project.id;
    const reviewTargetId = workspace.reviewTarget.id;
    const filePath = selectedFile.path;
    let cancelled = false;
    const loaderTimerId = window.setTimeout(() => {
      if (!cancelled) {
        setVisibleLoadingDiffPath(filePath);
      }
    }, delayedFileDiffLoaderMs);

    setLoadingDiffPath(filePath);

    void window.difftray
      .loadFileDiff({
        path: filePath,
        projectId
      })
      .then((loadedDiff) => {
        if (cancelled || !loadedDiff) {
          return;
        }

        setWorkspace((currentWorkspace) => {
          if (
            currentWorkspace?.project.id !== projectId ||
            currentWorkspace.reviewTarget.id !== reviewTargetId
          ) {
            return currentWorkspace;
          }

          const nextWorkspace = {
            ...currentWorkspace,
            files: currentWorkspace.files.map((file) =>
              file.path === loadedDiff.path
                ? {
                    ...file,
                    additions: loadedDiff.additions,
                    deletions: loadedDiff.deletions,
                    diffLoaded: true,
                    patch: loadedDiff.patch,
                    status: loadedDiff.status,
                    ...(loadedDiff.newText !== undefined
                      ? { newText: loadedDiff.newText }
                      : {}),
                    ...(loadedDiff.oldText !== undefined
                      ? { oldText: loadedDiff.oldText }
                      : {})
                  }
                : file
            )
          };

          workspaceCacheRef.current.set(projectId, {
            branchRefs,
            projectSettings,
            workspace: nextWorkspace
          });

          return nextWorkspace;
        });
      })
      .catch((caughtError: unknown) => {
        if (!cancelled) {
          setError(errorMessage(caughtError));
        }
      })
      .finally(() => {
        window.clearTimeout(loaderTimerId);
        if (!cancelled) {
          setLoadingDiffPath((currentPath) =>
            currentPath === filePath ? undefined : currentPath
          );
          setVisibleLoadingDiffPath((currentPath) =>
            currentPath === filePath ? undefined : currentPath
          );
        }
      });

    return () => {
      cancelled = true;
      window.clearTimeout(loaderTimerId);
      setLoadingDiffPath((currentPath) =>
        currentPath === filePath ? undefined : currentPath
      );
      setVisibleLoadingDiffPath((currentPath) =>
        currentPath === filePath ? undefined : currentPath
      );
    };
  }, [branchRefs, projectSettings, selectedFile, workspace]);

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
        selectFile: setSelectedPath,
        setDiffMode: setAndPersistDiffMode,
        toggleFileList: toggleFileListCollapsed,
        workspace
      }),
    [appSettings, diffMode, recentProjects, selectedFile, visibleFiles, workspace]
  );

  const filteredCommands = useMemo(() => {
    const normalizedQuery = paletteQuery.trim().toLowerCase();
    const modeCommands =
      paletteMode === "files"
        ? commands.filter((command) => command.kind === "file")
        : commands;

    if (normalizedQuery.length === 0) {
      return modeCommands;
    }

    return modeCommands
      .map((command) => ({
        command,
        rank: commandSearchRank(command, normalizedQuery)
      }))
      .filter((result) => Number.isFinite(result.rank))
      .sort(
        (left, right) =>
          left.rank - right.rank ||
          commandKindSearchWeight(left.command.kind) -
            commandKindSearchWeight(right.command.kind) ||
          left.command.label.localeCompare(right.command.label)
      )
      .map((result) => result.command);
  }, [commands, paletteMode, paletteQuery]);

  async function bootstrapApp(): Promise<void> {
    setError(undefined);
    setLoadState("loading");
    setLoadStatus(defaultWorkspaceLoadStatus);
    await nextPaint();

    try {
      const [projects, settings, installedEditors] = await Promise.all([
        window.difftray.listRecentProjects(),
        window.difftray.getAppSettings(),
        window.difftray.listInstalledEditors()
      ]);

      setRecentProjects(projects);
      setAppSettings(settings);
      setAppSettingsDraft(settings);
      setEditorOptions(installedEditors);
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
    const workspaceToApply = carryLoadedDiffsForward(workspaceRef.current, nextWorkspace);

    setLoadStatus({
      detail: workspaceToApply.project.name,
      title: "Preparing workspace"
    });
    const [nextSettings, nextBranchRefs] = await Promise.all([
      options.projectSettings
        ? Promise.resolve(options.projectSettings)
        : window.difftray.getProjectSettings(workspaceToApply.project.id),
      options.branchRefs
        ? Promise.resolve(options.branchRefs)
        : window.difftray.listProjectBranchRefs(workspaceToApply.project.id)
    ]);
    const nextAppSettings = options.appSettings ?? appSettings;

    workspaceCacheRef.current.set(workspaceToApply.project.id, {
      branchRefs: nextBranchRefs,
      projectSettings: nextSettings,
      workspace: workspaceToApply
    });
    setWorkspace(workspaceToApply);
    setProjectSettings(nextSettings);
    setBranchRefs(nextBranchRefs);
    setBaseRefDraft(
      workspaceToApply.reviewTarget.baseRefName ??
        suggestedBaseRef(nextBranchRefs, workspaceToApply.reviewTarget.headRefName) ??
        ""
    );
    setDiffMode(nextAppSettings.defaultDiffMode);
    setFileListWidth(nextSettings.fileListWidth);
    setFileListCollapsed(nextSettings.fileListCollapsed);
    setSelectedPath(visiblePathOrFirst(workspaceToApply, nextPath));
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

      const [nextSettings, nextBranchRefs] = await Promise.all([
        window.difftray.getProjectSettings(nextWorkspace.project.id),
        window.difftray.listProjectBranchRefs(nextWorkspace.project.id)
      ]);

      if (!canApplySilentWorkspaceRefresh(projectId, requestApplyVersion)) {
        return;
      }

      await applyWorkspace(nextWorkspace, selectedPathRef.current, {
        branchRefs: nextBranchRefs,
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
      invalidatePendingSilentWorkspaceRefreshes();
      setError(undefined);
      await applyWorkspace(
        cachedWorkspace.workspace,
        selectedPathByProjectRef.current.get(projectId),
        {
          branchRefs: cachedWorkspace.branchRefs,
          projectSettings: cachedWorkspace.projectSettings
        }
      );
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
      const [nextAppSettings, nextProjectSettings] = await Promise.all([
        window.difftray.getAppSettings(),
        window.difftray.getProjectSettings(workspace.project.id)
      ]);

      setAppSettings(nextAppSettings);
      setAppSettingsDraft(nextAppSettings);
      setProjectSettings(nextProjectSettings);
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

  async function saveSettings(): Promise<void> {
    if (!workspace) {
      return;
    }

    if (
      appSettingsDraft.editorMode === "preset" &&
      appSettingsDraft.editorCommand.trim().length === 0
    ) {
      setError("Editor preset is required.");
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
        window.difftray.updateAppSettings({
          autoCollapseHunksOver: appSettingsDraft.autoCollapseHunksOver,
          defaultDiffMode: appSettingsDraft.defaultDiffMode,
          editorArgList: appSettingsDraft.editorArgList,
          editorArgs: appSettingsDraft.editorArgs,
          editorCommand: appSettingsDraft.editorCommand,
          editorMode: appSettingsDraft.editorMode,
          hideWhitespaceOnlyChanges: appSettingsDraft.hideWhitespaceOnlyChanges,
          notifyOnDrift: appSettingsDraft.notifyOnDrift,
          reviewResetTrigger: appSettingsDraft.reviewResetTrigger,
          showGeneratedFiles: appSettingsDraft.showGeneratedFiles,
          themeMode: appSettingsDraft.themeMode
        }),
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
      const savedSettings = await window.difftray.updateAppSettings({
        autoCollapseHunksOver: nextSettings.autoCollapseHunksOver,
        defaultDiffMode: nextSettings.defaultDiffMode,
        editorArgList: nextSettings.editorArgList,
        editorArgs: nextSettings.editorArgs,
        editorCommand: nextSettings.editorCommand,
        editorMode: nextSettings.editorMode,
        hideWhitespaceOnlyChanges: nextSettings.hideWhitespaceOnlyChanges,
        notifyOnDrift: nextSettings.notifyOnDrift,
        reviewResetTrigger: nextSettings.reviewResetTrigger,
        showGeneratedFiles: nextSettings.showGeneratedFiles,
        themeMode: nextSettings.themeMode
      });

      setAppSettings(savedSettings);
      setAppSettingsDraft(savedSettings);
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    }
  }

  function setAndPersistDiffMode(mode: DiffMode): void {
    const scrollTop = diffSurfaceRef.current?.scrollTop ?? 0;
    setDiffMode(mode);
    window.setTimeout(() => {
      if (diffSurfaceRef.current) {
        diffSurfaceRef.current.scrollTop = scrollTop;
      }
    }, 0);
    void persistAppSettings({ defaultDiffMode: mode });
  }

  async function setProjectDiffTarget(
    mode: ReviewDiffTargetMode,
    baseRefName?: string
  ): Promise<void> {
    if (!workspace) {
      return;
    }

    if (mode === "branch") {
      const nextBaseRef = (baseRefName ?? baseRefDraft).trim();

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
      setSelectedPath(nextFile.path);
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

    setError(undefined);
    invalidatePendingSilentWorkspaceRefreshes();
    setWorkspace({
      ...workspace,
      files: workspace.files.map((file) =>
        file.path === optimisticFile.path
          ? { ...file, invalidated: false, reviewed: true }
          : file
      )
    });

    try {
      const result = await window.difftray.markFileReviewed({
        displayedDiffHash: optimisticFile.diffHash,
        path: optimisticFile.path,
        projectId: workspace.project.id,
        reviewTargetId: workspace.reviewTarget.id
      });
      const nextWorkspace = result.workspace;
      const nextPath =
        nextPendingPath(nextWorkspace, optimisticFile.path) ??
        visiblePathOrFirst(nextWorkspace, optimisticFile.path);

      setWorkspace(nextWorkspace);
      setSelectedPath(nextPath);
      updateRecentProjectReviewSummary(
        nextWorkspace.project.id,
        projectReviewSummary(nextWorkspace)
      );
      workspaceCacheRef.current.set(nextWorkspace.project.id, {
        branchRefs,
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
      setError(errorMessage(caughtError));
      await refreshWorkspace();
    }
  }

  async function unmarkSelectedReviewed(): Promise<void> {
    if (!workspace || selectedFile?.reviewed !== true || !selectedFile.diffLoaded) {
      return;
    }

    const optimisticFile = selectedFile;

    setError(undefined);
    invalidatePendingSilentWorkspaceRefreshes();
    setWorkspace({
      ...workspace,
      files: workspace.files.map((file) =>
        file.path === optimisticFile.path
          ? { ...file, invalidated: false, reviewed: false }
          : file
      )
    });

    try {
      const result = await window.difftray.unmarkFileReviewed({
        displayedDiffHash: optimisticFile.diffHash,
        path: optimisticFile.path,
        projectId: workspace.project.id,
        reviewTargetId: workspace.reviewTarget.id
      });

      setWorkspace(result.workspace);
      setSelectedPath(visiblePathOrFirst(result.workspace, optimisticFile.path));
      updateRecentProjectReviewSummary(
        result.workspace.project.id,
        projectReviewSummary(result.workspace)
      );
      workspaceCacheRef.current.set(result.workspace.project.id, {
        branchRefs,
        projectSettings,
        workspace: result.workspace
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
          onOpenProject={() => {
            void openProject();
          }}
          onCloseActiveProject={() => {
            void closeProject(workspace.project.id);
          }}
          onOpenSettings={() => {
            void openSettings();
          }}
          onReorderProjects={(draggedProjectId, targetProjectId, position) => {
            setRecentProjects((projects) =>
              reorderProjectTabs(projects, draggedProjectId, targetProjectId, position)
            );
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
          {error}
        </div>
      ) : null}

      {workspace ? (
        <section className={styles.workspaceBody} aria-label="Review workspace">
          {showActiveWorkspaceLoading ? <TabLoadBanner status={loadStatus} /> : null}
          <section className={styles.mainLayout} aria-busy={showActiveWorkspaceLoading}>
            {fileListCollapsed ? (
              <CollapsedRail
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
                  disabled={loadState === "loading"}
                  files={visibleFiles}
                  onBaseRefDraftChange={setBaseRefDraft}
                  onCollapse={toggleFileListCollapsed}
                  onUseBranchDiff={(baseRefName) => {
                    void setProjectDiffTarget("branch", baseRefName);
                  }}
                  onUseWorkingTreeDiff={() => {
                    void setProjectDiffTarget("working_tree");
                  }}
                  onRefresh={() => {
                    void refreshWorkspace();
                  }}
                  progress={workspace.progress}
                  reviewTarget={workspace.reviewTarget}
                />
                <FileList
                  files={visibleFiles}
                  onSelect={setSelectedPath}
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
                    disabled={loadState === "loading" || !selectedFile.diffLoaded}
                    file={selectedFile}
                    onToggleReviewed={() => {
                      void toggleSelectedReviewed();
                    }}
                    onOpenEditor={() => {
                      void openSelectedInEditor();
                    }}
                    refName={diffTargetLabel(workspace.reviewTarget)}
                  />
                  {selectedFile.patch ? (
                    <DiffSurface
                      diffHash={selectedFile.diffHash}
                      diffMode={diffMode}
                      filePath={selectedFile.path}
                      newText={selectedFile.newText}
                      oldText={selectedFile.oldText}
                      patch={selectedFile.patch}
                      resolvedTheme={resolvedTheme}
                      status={selectedFile.status}
                      refObject={diffSurfaceRef}
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
                  setSelectedPath(attentionFiles[0]?.path);
                  setToastDismissedFor(toastKey);
                }}
              />
            ) : null}
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
          disabled={loadState === "loading"}
          editorOptions={editorOptions}
          onCancel={closeSettings}
          onChangeAppSettings={updateAppSettingsDraft}
          onSave={() => {
            void saveSettings();
          }}
        />
      ) : null}
    </main>
  );
}

function ProjectTabBar({
  activeProjectId,
  activeReviewSummary,
  disabled,
  loadingStatus,
  onCloseActiveProject,
  onOpenProject,
  onOpenSettings,
  onReorderProjects,
  onSelectProject,
  projects,
  summaryLoadingProjectIds
}: {
  readonly activeProjectId: string;
  readonly activeReviewSummary?: ProjectReviewSummaryView;
  readonly disabled: boolean;
  readonly loadingStatus?: WorkspaceLoadStatus;
  readonly onCloseActiveProject: () => void;
  readonly onOpenProject: () => void;
  readonly onOpenSettings: () => void;
  readonly onReorderProjects: (
    draggedProjectId: string,
    targetProjectId: string,
    position: ProjectTabDropPosition
  ) => void;
  readonly onSelectProject: (projectId: string) => void;
  readonly projects: readonly RecentProjectView[];
  readonly summaryLoadingProjectIds: ReadonlySet<string>;
}): React.JSX.Element {
  const tabScrollerRef = useRef<HTMLDivElement>(null);
  const inlineOpenButtonRef = useRef<HTMLButtonElement>(null);
  const [draggedProjectId, setDraggedProjectId] = useState<string | undefined>();
  const [dropTarget, setDropTarget] = useState<
    | {
        readonly position: ProjectTabDropPosition;
        readonly projectId: string;
      }
    | undefined
  >();
  const [openButtonInline, setOpenButtonInline] = useState(false);

  useLayoutEffect(() => {
    function updateOpenButtonPlacement(): void {
      const scroller = tabScrollerRef.current;
      const inlineOpenButton = inlineOpenButtonRef.current;

      if (!scroller || !inlineOpenButton) {
        return;
      }

      const fallbackOpenButtonSpace = inlineOpenButton.offsetWidth + 6;
      const nextOpenButtonInline =
        scroller.scrollWidth <= scroller.clientWidth + fallbackOpenButtonSpace;

      setOpenButtonInline(nextOpenButtonInline);
    }

    updateOpenButtonPlacement();

    const resizeObserver = new ResizeObserver(updateOpenButtonPlacement);

    if (tabScrollerRef.current) {
      resizeObserver.observe(tabScrollerRef.current);
    }

    window.addEventListener("resize", updateOpenButtonPlacement);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateOpenButtonPlacement);
    };
  }, [activeProjectId, activeReviewSummary, projects, summaryLoadingProjectIds]);

  function clearDragState(): void {
    setDraggedProjectId(undefined);
    setDropTarget(undefined);
  }

  function projectIdFromDrag(event: React.DragEvent<HTMLElement>): string | undefined {
    if (draggedProjectId) {
      return draggedProjectId;
    }

    const transferredProjectId = event.dataTransfer.getData(
      "application/x-difftray-project-id"
    );

    if (transferredProjectId.length > 0) {
      return transferredProjectId;
    }

    const plainProjectId = event.dataTransfer.getData("text/plain");

    return plainProjectId.length > 0 ? plainProjectId : undefined;
  }

  function dropPositionForEvent(
    event: React.DragEvent<HTMLElement>
  ): ProjectTabDropPosition {
    const bounds = event.currentTarget.getBoundingClientRect();

    return event.clientX < bounds.left + bounds.width / 2 ? "before" : "after";
  }

  return (
    <div className={styles.projectTabs} data-open-inline={openButtonInline}>
      <div className={styles.tabScroller} ref={tabScrollerRef}>
        {projects.map((project) => {
          const isActive = project.id === activeProjectId;
          const isLoading = isActive && loadingStatus !== undefined;
          const isSummaryLoading = !isActive && summaryLoadingProjectIds.has(project.id);
          const reviewSummary = isActive
            ? (activeReviewSummary ?? project.reviewSummary)
            : project.reviewSummary;
          const tabState = reviewSummary ? reviewSummaryState(reviewSummary) : "unknown";

          return (
            <div
              className={styles.projectTab}
              data-active={isActive}
              data-dragging={draggedProjectId === project.id ? true : undefined}
              data-drop-position={
                dropTarget?.projectId === project.id ? dropTarget.position : undefined
              }
              data-project-tab-name={project.name}
              draggable={!disabled}
              key={project.id}
              onDragEnd={clearDragState}
              onDragOver={(event) => {
                const draggedId = projectIdFromDrag(event);

                if (!draggedId || draggedId === project.id) {
                  return;
                }

                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDropTarget({
                  position: dropPositionForEvent(event),
                  projectId: project.id
                });
              }}
              onDragStart={(event) => {
                if (disabled) {
                  event.preventDefault();
                  return;
                }

                setDraggedProjectId(project.id);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData(
                  "application/x-difftray-project-id",
                  project.id
                );
                event.dataTransfer.setData("text/plain", project.id);
              }}
              onDrop={(event) => {
                const draggedId = projectIdFromDrag(event);

                if (!draggedId || draggedId === project.id) {
                  clearDragState();
                  return;
                }

                event.preventDefault();
                onReorderProjects(draggedId, project.id, dropPositionForEvent(event));
                clearDragState();
              }}
            >
              <button
                className={styles.projectTabSelect}
                disabled={disabled}
                draggable={!disabled}
                onClick={() => {
                  onSelectProject(project.id);
                }}
                title={
                  isLoading
                    ? loadingStatus.detail
                    : projectTabTitle(project, reviewSummary, isSummaryLoading)
                }
                type="button"
              >
                {isLoading ? (
                  <span className={styles.tabLoadingMark} aria-hidden />
                ) : (
                  <Folder size={14} strokeWidth={1.4} aria-hidden />
                )}
                <span>{project.name}</span>
                {isLoading ? null : isSummaryLoading ? (
                  <span className={styles.tabSummaryLoadingMark} aria-hidden />
                ) : (
                  <span className={styles.statusDot} data-state={tabState} aria-hidden />
                )}
                <span className={styles.tabCount}>
                  {isLoading
                    ? tabLoadingText(loadingStatus)
                    : tabReviewCountText(reviewSummary)}
                </span>
              </button>
              {isActive ? (
                <button
                  aria-label="Close repository"
                  className={styles.tabCloseButton}
                  disabled={disabled}
                  onClick={onCloseActiveProject}
                  title="Close Repository"
                  type="button"
                >
                  <X size={13} strokeWidth={1.4} aria-hidden />
                </button>
              ) : null}
            </div>
          );
        })}
        <button
          aria-hidden={!openButtonInline}
          aria-label={openButtonInline ? "Open repository" : undefined}
          className={classList(styles.tabIconButton, styles.inlineTabOpenButton)}
          disabled={disabled || !openButtonInline}
          onClick={onOpenProject}
          ref={inlineOpenButtonRef}
          tabIndex={openButtonInline ? undefined : -1}
          title="Open Repository"
          type="button"
        >
          <Plus size={15} strokeWidth={1.4} aria-hidden />
        </button>
      </div>
      <button
        aria-hidden={openButtonInline}
        aria-label="Open repository"
        className={classList(styles.tabIconButton, styles.overflowTabOpenButton)}
        disabled={disabled || openButtonInline}
        onClick={onOpenProject}
        tabIndex={openButtonInline ? -1 : undefined}
        title="Open Repository"
        type="button"
      >
        <Plus size={15} strokeWidth={1.4} aria-hidden />
      </button>
      <button
        aria-label="Project settings"
        className={styles.tabIconButton}
        disabled={disabled}
        onClick={onOpenSettings}
        title="Settings"
        type="button"
      >
        <Settings size={15} strokeWidth={1.4} aria-hidden />
      </button>
    </div>
  );
}

function TabLoadBanner({
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

function LoadingProgress({
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

function FileListHeader({
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
  const pendingCount = files.filter((file) => reviewState(file) === "pending").length;
  const reviewedCount = files.filter((file) => reviewState(file) === "reviewed").length;
  const total = Math.max(files.length, 1);

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
            flexGrow: reviewedCount,
            width: `${String((reviewedCount / total) * 100)}%`
          }}
        />
        <span
          className={styles.progressAttention}
          style={{
            flexGrow: attentionCount,
            width: `${String((attentionCount / total) * 100)}%`
          }}
        />
        <span
          className={styles.progressPending}
          style={{
            flexGrow: pendingCount,
            width: `${String((pendingCount / total) * 100)}%`
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

function CollapsedRail({
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

function FileList({
  files,
  onSelect,
  selectedPath
}: {
  readonly files: readonly ReviewFileView[];
  readonly onSelect: (path: string) => void;
  readonly selectedPath: string | undefined;
}): React.JSX.Element {
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const selectedIndex = selectedPath
    ? files.findIndex((file) => file.path === selectedPath)
    : -1;
  const startIndex = Math.max(
    0,
    Math.floor(scrollTop / fileListRowHeight) - fileListOverscanRows
  );
  const visibleRowCount = Math.ceil(viewportHeight / fileListRowHeight);
  const endIndex = Math.min(
    files.length,
    startIndex + visibleRowCount + fileListOverscanRows * 2
  );
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

    const rowTop = selectedIndex * fileListRowHeight;
    const rowBottom = rowTop + fileListRowHeight;
    const viewportTop = listElement.scrollTop;
    const viewportBottom = viewportTop + listElement.clientHeight;

    if (rowTop < viewportTop) {
      listElement.scrollTop = rowTop;
      setScrollTop(rowTop);
    } else if (rowBottom > viewportBottom) {
      const nextScrollTop = Math.max(0, rowBottom - listElement.clientHeight);
      listElement.scrollTop = nextScrollTop;
      setScrollTop(nextScrollTop);
    }
  }, [selectedIndex]);

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

const FileButton = memo(function FileButton({
  file,
  isSelected,
  onSelect,
  position,
  total
}: {
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
        </span>
        <span className={styles.fileDir}>{parts.dirname}</span>
      </span>
      <DiffStats additions={file.additions} deletions={file.deletions} />
    </button>
  );
});

function DiffToolbar({
  disabled,
  file,
  onOpenEditor,
  onToggleReviewed,
  refName
}: {
  readonly disabled: boolean;
  readonly file: ReviewFileView;
  readonly onOpenEditor: () => void;
  readonly onToggleReviewed: () => void;
  readonly refName: string;
}): React.JSX.Element {
  const parts = splitPath(file.path);

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
        </div>
      </div>
      <div className={styles.diffActions}>
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

function DiffLoadingState({
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

function DiffSurface({
  diffHash,
  diffMode,
  filePath,
  newText,
  oldText,
  patch,
  resolvedTheme,
  status,
  refObject
}: {
  readonly diffHash: string;
  readonly diffMode: DiffMode;
  readonly filePath: string;
  readonly newText: string | undefined;
  readonly oldText: string | undefined;
  readonly patch: string;
  readonly resolvedTheme: ResolvedTheme;
  readonly status: ReviewFileView["status"];
  readonly refObject: React.RefObject<HTMLDivElement | null>;
}): React.JSX.Element {
  const parseKey = `${filePath}:${diffHash}`;
  const [parseState, setParseState] = useState<DiffParseState>(() => ({
    key: parseKey,
    status: "parsing"
  }));
  const segments =
    parseState.key === parseKey && parseState.status === "ready"
      ? parseState.segments
      : undefined;
  const [expandedContextKeys, setExpandedContextKeys] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const visibleSegments = useMemo<readonly ParsedDiffSegment[]>(
    () =>
      segments
        ? segments.map((segment) =>
            segment.kind === "collapsed_context" && !expandedContextKeys.has(segment.key)
              ? { ...segment, lines: [] }
              : segment
          )
        : [],
    [expandedContextKeys, segments]
  );
  const highlightedLines = useHighlightedLines({
    filePath,
    segments: visibleSegments,
    resolvedTheme
  });
  const forceSingleFile = status === "added";

  useEffect(() => {
    setExpandedContextKeys(new Set());
  }, [filePath, newText, oldText, patch]);

  useEffect(() => {
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      const nextSegments = parseDiffSegments({
        ...(newText !== undefined ? { newText } : {}),
        ...(oldText !== undefined ? { oldText } : {}),
        patch
      });

      if (!cancelled) {
        setParseState({
          key: parseKey,
          segments: nextSegments,
          status: "ready"
        });
      }
    }, 0);

    setParseState({
      key: parseKey,
      status: "parsing"
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [newText, oldText, parseKey, patch]);

  function toggleContext(key: string): void {
    setExpandedContextKeys((currentKeys) => {
      const nextKeys = new Set(currentKeys);

      if (nextKeys.has(key)) {
        nextKeys.delete(key);
      } else {
        nextKeys.add(key);
      }

      return nextKeys;
    });
  }

  return (
    <div
      className={styles.diffSurface}
      data-diff-layout={forceSingleFile ? "single" : diffMode}
      ref={refObject}
    >
      {!segments ? (
        <div className={styles.diffPreparingState} role="status">
          <span className={styles.loadingMiniMark} aria-hidden />
          <span>Preparing diff</span>
        </div>
      ) : null}
      {segments?.map((segment) =>
        segment.kind === "collapsed_context" ? (
          <CollapsedContextBlock
            diffMode={diffMode}
            forceSingleFile={forceSingleFile}
            highlightedLines={highlightedLines}
            isExpanded={expandedContextKeys.has(segment.key)}
            key={segment.key}
            onToggle={() => {
              toggleContext(segment.key);
            }}
            segment={segment}
          />
        ) : (
          <DiffHunk
            diffMode={diffMode}
            forceSingleFile={forceSingleFile}
            highlightedLines={highlightedLines}
            hunk={segment}
            key={segment.key}
          />
        )
      )}
      <div className={styles.diffEndSpacer} aria-hidden />
    </div>
  );
}

function DiffHunk({
  diffMode,
  forceSingleFile,
  highlightedLines,
  hunk
}: {
  readonly diffMode: DiffMode;
  readonly forceSingleFile: boolean;
  readonly highlightedLines: HighlightedLineMap;
  readonly hunk: ParsedDiffHunkSegment;
}): React.JSX.Element {
  return (
    <section className={styles.hunk}>
      <div className={styles.hunkHeader}>
        <Diff size={13} strokeWidth={1.4} aria-hidden />
        <span>{hunk.header}</span>
      </div>
      <DiffLineBlock
        diffMode={diffMode}
        forceSingleFile={forceSingleFile}
        highlightedLines={highlightedLines}
        lines={hunk.lines}
      />
    </section>
  );
}

function CollapsedContextBlock({
  diffMode,
  forceSingleFile,
  highlightedLines,
  isExpanded,
  onToggle,
  segment
}: {
  readonly diffMode: DiffMode;
  readonly forceSingleFile: boolean;
  readonly highlightedLines: HighlightedLineMap;
  readonly isExpanded: boolean;
  readonly onToggle: () => void;
  readonly segment: CollapsedDiffContextSegment;
}): React.JSX.Element {
  const lineLabel = segment.lineCount === 1 ? "line" : "lines";

  return (
    <section className={styles.contextBlock} data-expanded={isExpanded}>
      <button
        aria-expanded={isExpanded}
        className={styles.contextExpander}
        onClick={onToggle}
        title={`${isExpanded ? "Hide" : "Show"} ${String(segment.lineCount)} unchanged ${lineLabel}`}
        type="button"
      >
        <MoreHorizontal size={14} strokeWidth={1.5} aria-hidden />
        <span>
          {isExpanded ? "Hide" : "Show"} {segment.lineCount} unchanged {lineLabel}
        </span>
      </button>
      {isExpanded ? (
        <DiffLineBlock
          diffMode={diffMode}
          forceSingleFile={forceSingleFile}
          highlightedLines={highlightedLines}
          lines={segment.lines}
        />
      ) : null}
    </section>
  );
}

function DiffLineBlock({
  diffMode,
  forceSingleFile,
  highlightedLines,
  lines
}: {
  readonly diffMode: DiffMode;
  readonly forceSingleFile: boolean;
  readonly highlightedLines: HighlightedLineMap;
  readonly lines: readonly ParsedDiffLine[];
}): React.JSX.Element {
  if (forceSingleFile) {
    return <AddedFileHunk highlightedLines={highlightedLines} lines={lines} />;
  }

  return diffMode === "split" ? (
    <SplitHunk highlightedLines={highlightedLines} lines={lines} />
  ) : (
    <UnifiedHunk highlightedLines={highlightedLines} lines={lines} />
  );
}

function AddedFileHunk({
  highlightedLines,
  lines
}: {
  readonly highlightedLines: HighlightedLineMap;
  readonly lines: readonly ParsedDiffLine[];
}) {
  return (
    <div className={styles.singleFileDiff}>
      {lines
        .filter((line) => line.kind !== "deleted")
        .map((line) => (
          <div className={styles.singleFileRow} data-kind={line.kind} key={line.key}>
            <span className={styles.lineNumber}>{line.newNumber ?? ""}</span>
            <CodeText
              highlightedTokens={highlightedLines.get(line.key)}
              text={line.text}
            />
          </div>
        ))}
    </div>
  );
}

function SplitHunk({
  highlightedLines,
  lines
}: {
  readonly highlightedLines: HighlightedLineMap;
  readonly lines: readonly ParsedDiffLine[];
}) {
  const rows = pairSplitLines(lines);
  const oldContentColumns = maxLineColumns(rows.map((row) => row.oldLine));
  const newContentColumns = maxLineColumns(rows.map((row) => row.newLine));

  return (
    <div className={styles.splitDiff}>
      <div className={styles.splitPane} data-side="old">
        {rows.map((row) => (
          <SplitCell
            contentColumns={oldContentColumns}
            highlightedTokens={
              row.oldLine ? highlightedLines.get(row.oldLine.key) : undefined
            }
            line={row.oldLine}
            side="old"
            key={`old-${row.key}`}
          />
        ))}
      </div>
      <div className={styles.splitPane} data-side="new">
        {rows.map((row) => (
          <SplitCell
            contentColumns={newContentColumns}
            highlightedTokens={
              row.newLine ? highlightedLines.get(row.newLine.key) : undefined
            }
            line={row.newLine}
            side="new"
            key={`new-${row.key}`}
          />
        ))}
      </div>
    </div>
  );
}

function SplitCell({
  contentColumns,
  highlightedTokens,
  line,
  side
}: {
  readonly contentColumns: number;
  readonly highlightedTokens: readonly ThemedToken[] | undefined;
  readonly line: ParsedDiffLine | undefined;
  readonly side: "new" | "old";
}) {
  return (
    <div
      className={styles.splitCell}
      data-kind={line?.kind ?? "empty"}
      data-side={side}
      style={
        {
          "--diff-row-content-width": `${String(contentColumns)}ch`
        } as React.CSSProperties
      }
    >
      <span className={styles.lineNumber}>
        {side === "old" ? line?.oldNumber : line?.newNumber}
      </span>
      <CodeText highlightedTokens={highlightedTokens} text={line ? line.text : ""} />
    </div>
  );
}

function UnifiedHunk({
  highlightedLines,
  lines
}: {
  readonly highlightedLines: HighlightedLineMap;
  readonly lines: readonly ParsedDiffLine[];
}) {
  return (
    <div className={styles.unifiedDiff}>
      {lines.map((line) => (
        <div className={styles.unifiedRow} data-kind={line.kind} key={line.key}>
          <span className={styles.lineNumber}>{line.oldNumber ?? ""}</span>
          <span className={styles.lineNumber}>{line.newNumber ?? ""}</span>
          <span className={styles.diffGlyph}>{lineGlyph(line.kind)}</span>
          <CodeText highlightedTokens={highlightedLines.get(line.key)} text={line.text} />
        </div>
      ))}
    </div>
  );
}

function CodeText({
  highlightedTokens,
  text
}: {
  readonly highlightedTokens: readonly ThemedToken[] | undefined;
  readonly text: string;
}) {
  return (
    <code className={styles.codeText}>
      {highlightedTokens && highlightedTokens.length > 0
        ? highlightedTokens.map((token, index) => (
            <span
              key={`${String(index)}-${String(token.offset)}`}
              style={styleForToken(token)}
            >
              {token.content}
            </span>
          ))
        : text}
    </code>
  );
}

function useHighlightedLines({
  filePath,
  segments,
  resolvedTheme
}: {
  readonly filePath: string;
  readonly segments: readonly ParsedDiffSegment[];
  readonly resolvedTheme: ResolvedTheme;
}): HighlightedLineMap {
  const [highlightedLines, setHighlightedLines] = useState<HighlightedLineMap>(
    () => new Map()
  );

  useEffect(() => {
    let cancelled = false;
    const language = syntaxLanguageForPath(filePath);
    const theme = syntaxThemes[resolvedTheme];
    const linesToHighlight = segments.flatMap((segment) => segment.lines);

    setHighlightedLines(new Map());

    async function highlight(): Promise<void> {
      try {
        if (linesToHighlight.length > maxHighlightedDiffLines) {
          return;
        }

        const highlighter = await getSyntaxHighlighter();

        if (language !== "text") {
          await loadSyntaxLanguage(highlighter, language);
        }

        const nextLines = new Map<string, readonly ThemedToken[]>();

        for (const segment of segments) {
          if (segment.lines.length === 0) {
            continue;
          }

          const tokenized = highlighter.codeToTokens(
            segment.lines.map((line) => line.text).join("\n"),
            {
              lang: language,
              theme
            }
          ).tokens;

          for (const [index, line] of segment.lines.entries()) {
            nextLines.set(line.key, tokenized[index] ?? []);
          }
        }

        if (!cancelled) {
          setHighlightedLines(nextLines);
        }
      } catch {
        if (!cancelled) {
          setHighlightedLines(new Map());
        }
      }
    }

    void highlight();

    return () => {
      cancelled = true;
    };
  }, [filePath, segments, resolvedTheme]);

  return highlightedLines;
}

async function loadSyntaxLanguage(
  highlighter: HighlighterCore,
  language: Exclude<SyntaxLanguage, "text">
): Promise<void> {
  await highlighter.loadLanguage(bundledLanguages[language]);
}

function getSyntaxHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= createHighlighterCore({
    engine: createJavaScriptRegexEngine(),
    langs: [],
    themes: [githubDarkTheme, githubLightTheme]
  });

  return highlighterPromise;
}

function syntaxLanguageForPath(filePath: string): SyntaxLanguage {
  const normalizedPath = filePath.toLowerCase();
  const filename = normalizedPath.split("/").at(-1) ?? normalizedPath;
  const candidates = syntaxLanguageCandidates(filename);

  for (const candidate of candidates) {
    const language = syntaxLanguageAliases.get(candidate);

    if (language) {
      return language;
    }
  }

  return "text";
}

function syntaxLanguageCandidates(filename: string): readonly string[] {
  const candidates = new Set<string>();
  const basename = filename.startsWith(".") ? filename.slice(1) : filename;

  candidates.add(filename);
  candidates.add(basename);

  const parts = basename.split(".").filter(Boolean);

  for (let index = 0; index < parts.length; index += 1) {
    candidates.add(parts.slice(index).join("."));
  }

  for (const part of parts) {
    candidates.add(part);
  }

  return [...candidates];
}

function buildSyntaxLanguageAliases(): ReadonlyMap<string, BundledLanguage> {
  const aliases = new Map<string, BundledLanguage>();

  for (const language of bundledLanguagesInfo) {
    if (!isBundledLanguage(language.id)) {
      continue;
    }

    aliases.set(language.id.toLowerCase(), language.id);

    for (const alias of language.aliases ?? []) {
      aliases.set(alias.toLowerCase(), language.id);
    }
  }

  return aliases;
}

function isBundledLanguage(language: string): language is BundledLanguage {
  return language in bundledLanguages;
}

function styleForToken(token: ThemedToken): React.CSSProperties {
  return {
    color: token.color,
    fontStyle: token.fontStyle && (token.fontStyle & 1) !== 0 ? "italic" : undefined,
    fontWeight: token.fontStyle && (token.fontStyle & 2) !== 0 ? 600 : undefined,
    textDecoration:
      token.fontStyle && (token.fontStyle & 4) !== 0 ? "underline" : undefined
  };
}

function EmptyState({
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

function CommandPalette({
  commands,
  inputRef,
  mode,
  onClose,
  onQueryChange,
  query,
  selectedIndex,
  setSelectedIndex
}: {
  readonly commands: readonly CommandItem[];
  readonly inputRef: React.RefObject<HTMLInputElement | null>;
  readonly mode: PaletteMode;
  readonly onClose: () => void;
  readonly onQueryChange: (query: string) => void;
  readonly query: string;
  readonly selectedIndex: number;
  readonly setSelectedIndex: (index: number) => void;
}): React.JSX.Element {
  const groupedCommands = groupCommands(commands);

  return (
    <div className={styles.paletteOverlay}>
      <section className={styles.palette} aria-label="Command palette" role="dialog">
        <label className={styles.paletteSearch}>
          <Search size={16} strokeWidth={1.4} aria-hidden />
          <input
            ref={inputRef}
            onChange={(event) => {
              onQueryChange(event.target.value);
            }}
            placeholder="Search projects, files, and actions"
            value={query}
          />
          <span className={styles.paletteScope}>
            {mode === "files" ? "Files" : "All"}
          </span>
          <kbd>esc</kbd>
        </label>
        <div className={styles.paletteResults}>
          {groupedCommands.map((group) => (
            <div className={styles.paletteGroup} key={group.kind}>
              <div className={styles.sectionLabel}>{group.kind}</div>
              {group.items.map((item) => {
                const itemIndex = commands.findIndex((command) => command.id === item.id);

                return (
                  <button
                    className={styles.paletteItem}
                    data-kind={item.kind}
                    data-selected={itemIndex === selectedIndex}
                    key={item.id}
                    onClick={() => {
                      item.run();
                      onClose();
                    }}
                    onMouseEnter={() => {
                      setSelectedIndex(itemIndex);
                    }}
                    type="button"
                  >
                    <span className={styles.paletteItemIcon}>{item.icon}</span>
                    <span className={styles.paletteItemCopy}>
                      <strong>{item.label}</strong>
                      <small>{item.sub}</small>
                    </span>
                    {item.hint ? (
                      <span className={styles.paletteHint}>{item.hint}</span>
                    ) : null}
                    {item.shortcut ? <kbd>{item.shortcut}</kbd> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className={styles.paletteFooter}>
          <span>↑ ↓ navigate</span>
          <span>↵ select</span>
          <span>⌘P files only</span>
          <span>⌘K</span>
        </div>
      </section>
    </div>
  );
}

function SettingsPanel({
  appSettings,
  disabled,
  editorOptions,
  onCancel,
  onChangeAppSettings,
  onSave
}: {
  readonly appSettings: AppSettingsView;
  readonly disabled: boolean;
  readonly editorOptions: readonly EditorPresetView[];
  readonly onCancel: () => void;
  readonly onChangeAppSettings: (patch: Partial<AppSettingsView>) => void;
  readonly onSave: () => void;
}): React.JSX.Element {
  return (
    <div className={styles.settingsOverlay}>
      <section className={styles.settingsWindow} aria-modal="true" role="dialog">
        <form
          className={styles.settingsContent}
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
        >
          <div className={styles.settingsTopline}>
            <div>
              <h2>Settings</h2>
              <p>App appearance, editor launch, and review behavior.</p>
            </div>
            <button
              aria-label="Close settings"
              className={styles.iconButton}
              disabled={disabled}
              onClick={onCancel}
              title="Close"
              type="button"
            >
              <X size={14} strokeWidth={1.4} aria-hidden />
            </button>
          </div>

          <SettingsSection title="General">
            <label className={styles.settingRow}>
              <span>Appearance</span>
              <select
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
          </SettingsSection>

          <SettingsSection allowOverflow title="Editor">
            <div className={styles.settingRow}>
              <span>Editor</span>
              <EditorPicker
                appSettings={appSettings}
                disabled={disabled}
                editorOptions={editorOptions}
                onChangeAppSettings={onChangeAppSettings}
              />
            </div>
          </SettingsSection>

          <SettingsSection title="Review">
            <div className={styles.settingRow}>
              <span>Default diff view</span>
              <div className={styles.segmented}>
                <button
                  data-active={appSettings.defaultDiffMode === "split"}
                  onClick={() => {
                    onChangeAppSettings({ defaultDiffMode: "split" });
                  }}
                  type="button"
                >
                  Split
                </button>
                <button
                  data-active={appSettings.defaultDiffMode === "unified"}
                  onClick={() => {
                    onChangeAppSettings({ defaultDiffMode: "unified" });
                  }}
                  type="button"
                >
                  Unified
                </button>
              </div>
            </div>
            <ToggleRow
              checked={appSettings.showGeneratedFiles}
              label="Show generated files"
              onChange={(checked) => {
                onChangeAppSettings({ showGeneratedFiles: checked });
              }}
            />
            <ToggleRow
              checked={appSettings.notifyOnDrift}
              label="Notify when reviewed file drifts"
              onChange={(checked) => {
                onChangeAppSettings({ notifyOnDrift: checked });
              }}
            />
          </SettingsSection>

          <div className={styles.settingsActions}>
            <button
              className={styles.secondaryButton}
              disabled={disabled}
              onClick={onCancel}
              type="button"
            >
              Cancel
            </button>
            <button className={styles.primaryButton} disabled={disabled} type="submit">
              <Save size={14} strokeWidth={1.4} aria-hidden />
              Save
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function SettingsSection({
  allowOverflow = false,
  children,
  title
}: {
  readonly allowOverflow?: boolean;
  readonly children: React.ReactNode;
  readonly title: string;
}): React.JSX.Element {
  return (
    <section
      className={styles.settingsSection}
      data-overflow={allowOverflow ? "visible" : undefined}
    >
      <div className={styles.sectionLabel}>{title}</div>
      <div
        className={styles.settingsCard}
        data-overflow={allowOverflow ? "visible" : undefined}
      >
        {children}
      </div>
    </section>
  );
}

type EditorChoice = {
  readonly iconDataUrl?: string;
  readonly label: string;
  readonly value: string;
};

function EditorPicker({
  appSettings,
  disabled,
  editorOptions,
  onChangeAppSettings
}: {
  readonly appSettings: AppSettingsView;
  readonly disabled: boolean;
  readonly editorOptions: readonly EditorPresetView[];
  readonly onChangeAppSettings: (patch: Partial<AppSettingsView>) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const choices = useMemo(
    () => [
      { label: "System default", value: "system" },
      ...editorOptions.map((option) => ({
        ...(option.iconDataUrl ? { iconDataUrl: option.iconDataUrl } : {}),
        label: option.name,
        value: `preset:${option.id}`
      }))
    ],
    [editorOptions]
  );
  const selectedValue = editorSelectionValue(appSettings, editorOptions);
  const selectedChoice =
    choices.find((choice) => choice.value === selectedValue) ??
    ({
      label: "System default",
      value: "system"
    } satisfies EditorChoice);

  useEffect(() => {
    if (!open) {
      return;
    }

    function closeOnOutsidePointer(event: PointerEvent): void {
      const target = event.target;

      if (
        target instanceof Node &&
        containerRef.current &&
        !containerRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }

    window.addEventListener("pointerdown", closeOnOutsidePointer);

    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, [open]);

  return (
    <div className={styles.editorPicker} ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Editor: ${selectedChoice.label}`}
        className={styles.editorPickerButton}
        disabled={disabled}
        onClick={() => {
          setOpen((isOpen) => !isOpen);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
          if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        type="button"
      >
        <EditorChoiceIcon choice={selectedChoice} />
        <span>{selectedChoice.label}</span>
        <ChevronDown size={14} strokeWidth={1.5} aria-hidden />
      </button>
      {open ? (
        <div aria-label="Editor" className={styles.editorPickerMenu} role="listbox">
          {choices.map((choice) => (
            <button
              aria-selected={choice.value === selectedValue}
              className={styles.editorPickerOption}
              data-selected={choice.value === selectedValue}
              key={choice.value}
              onClick={() => {
                onChangeAppSettings(
                  editorPatchForSelection(choice.value, appSettings, editorOptions)
                );
                setOpen(false);
              }}
              role="option"
              type="button"
            >
              <EditorChoiceIcon choice={choice} />
              <span>{choice.label}</span>
              {choice.value === selectedValue ? (
                <Check size={13} strokeWidth={1.6} aria-hidden />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EditorChoiceIcon({
  choice
}: {
  readonly choice: EditorChoice;
}): React.JSX.Element {
  if (choice.iconDataUrl) {
    return (
      <img
        alt=""
        className={styles.editorPickerIcon}
        draggable={false}
        src={choice.iconDataUrl}
      />
    );
  }

  return (
    <span className={styles.editorPickerIcon} data-fallback="true">
      <Code2 size={14} strokeWidth={1.5} aria-hidden />
    </span>
  );
}

function editorSelectionValue(
  appSettings: AppSettingsView,
  editorOptions: readonly EditorPresetView[]
): string {
  if (appSettings.editorMode === "system") {
    return "system";
  }

  const matchingOption = editorOptions.find((option) =>
    editorOptionMatchesSettings(option, appSettings)
  );

  return matchingOption ? `preset:${matchingOption.id}` : "system";
}

function editorPatchForSelection(
  value: string,
  appSettings: AppSettingsView,
  editorOptions: readonly EditorPresetView[]
): Partial<AppSettingsView> {
  if (value === "system") {
    return {
      editorArgList: [],
      editorArgs: "",
      editorCommand: "",
      editorMode: "system"
    };
  }

  const presetId = value.replace(/^preset:/, "");
  const option = editorOptions.find((candidate) => candidate.id === presetId);

  if (!option) {
    return {
      editorArgList: [],
      editorArgs: "",
      editorCommand: "",
      editorMode: "system"
    };
  }

  return {
    editorArgList: option.args,
    editorArgs: option.args.join(" "),
    editorCommand: option.command,
    editorMode: "preset"
  };
}

function editorOptionMatchesSettings(
  option: EditorPresetView,
  appSettings: AppSettingsView
): boolean {
  return (
    option.command === appSettings.editorCommand.trim() &&
    arraysAreEqual(option.args, appSettings.editorArgList)
  );
}

function arraysAreEqual(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length && left.every((value, index) => value === right[index])
  );
}

function ToggleRow({
  checked,
  label,
  onChange
}: {
  readonly checked: boolean;
  readonly label: string;
  readonly onChange: (checked: boolean) => void;
}): React.JSX.Element {
  return (
    <label className={styles.settingRow}>
      <span>{label}</span>
      <input
        checked={checked}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
        type="checkbox"
      />
    </label>
  );
}

function DriftToast({
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

function buildCommands({
  activeFile,
  closePalette,
  diffMode,
  files,
  loadProject,
  openProject,
  openSettings,
  projects,
  refresh,
  selectFile,
  setDiffMode,
  toggleFileList,
  toggleReview,
  workspace
}: {
  readonly activeFile: ReviewFileView | undefined;
  readonly closePalette: () => void;
  readonly diffMode: DiffMode;
  readonly files: readonly ReviewFileView[];
  readonly loadProject: (projectId: string) => Promise<void>;
  readonly openProject: () => void;
  readonly openSettings: () => void;
  readonly projects: readonly RecentProjectView[];
  readonly refresh: () => void;
  readonly selectFile: (path: string) => void;
  readonly setDiffMode: (mode: DiffMode) => void;
  readonly toggleFileList: () => void;
  readonly toggleReview: () => void;
  readonly workspace: ReviewWorkspaceView | undefined;
}): readonly CommandItem[] {
  const items: CommandItem[] = [
    {
      icon: <FolderOpen size={14} strokeWidth={1.4} aria-hidden />,
      id: "action-open",
      kind: "action",
      label: "Open Repository",
      run: openProject,
      shortcut: "⌘O",
      sub: "Choose a local Git repository"
    }
  ];

  if (workspace) {
    items.push(
      {
        icon: <RefreshCw size={14} strokeWidth={1.4} aria-hidden />,
        id: "action-refresh",
        kind: "action",
        label: "Refresh project",
        run: refresh,
        sub: workspace.project.name
      },
      {
        icon: <Check size={14} strokeWidth={1.4} aria-hidden />,
        id: "action-review",
        kind: "action",
        label: activeFile?.reviewed ? "Unmark reviewed" : "Mark reviewed",
        run: toggleReview,
        shortcut: "R",
        sub: activeFile?.path ?? "No file selected"
      },
      {
        icon: <PanelLeftClose size={14} strokeWidth={1.4} aria-hidden />,
        id: "action-file-list",
        kind: "action",
        label: "Toggle file list",
        run: toggleFileList,
        shortcut: "⌘1",
        sub: "Collapse or expand the changed file list"
      },
      {
        icon: <Code2 size={14} strokeWidth={1.4} aria-hidden />,
        id: "action-diff-mode",
        kind: "action",
        label: diffMode === "split" ? "Switch to unified diff" : "Switch to split diff",
        run: () => {
          setDiffMode(diffMode === "split" ? "unified" : "split");
        },
        sub: "Diff display mode"
      },
      {
        icon: <Settings size={14} strokeWidth={1.4} aria-hidden />,
        id: "action-settings",
        kind: "action",
        label: "Settings",
        run: openSettings,
        sub: "Review preferences"
      }
    );
  }

  for (const project of projects) {
    items.push({
      icon: <Folder size={14} strokeWidth={1.4} aria-hidden />,
      id: `project-${project.id}`,
      kind: "project",
      label: project.name,
      run: () => {
        closePalette();
        void loadProject(project.id);
      },
      sub: project.path
    });
  }

  for (const file of files) {
    items.push({
      hint: reviewState(file),
      icon: <FileCode2 size={14} strokeWidth={1.4} aria-hidden />,
      id: `file-${file.path}`,
      kind: "file",
      label: splitPath(file.path).filename,
      run: () => {
        selectFile(file.path);
        closePalette();
      },
      sub: file.path
    });
  }

  return items;
}

function groupCommands(commands: readonly CommandItem[]) {
  return (["project", "file", "action"] as const)
    .map((kind) => ({
      items: commands.filter((command) => command.kind === kind),
      kind
    }))
    .filter((group) => group.items.length > 0);
}

function commandSearchRank(command: CommandItem, query: string): number {
  const label = command.label.toLowerCase();
  const sub = command.sub.toLowerCase();
  const hint = command.hint?.toLowerCase() ?? "";

  if (label === query) {
    return 0;
  }

  if (label.startsWith(query)) {
    return 1;
  }

  if (label.includes(query)) {
    return 2;
  }

  if (sub.startsWith(query)) {
    return 10;
  }

  if (sub.includes(query)) {
    return 11;
  }

  if (hint.includes(query)) {
    return 20;
  }

  return Number.POSITIVE_INFINITY;
}

function commandKindSearchWeight(kind: CommandKind): number {
  switch (kind) {
    case "file":
      return 0;
    case "project":
      return 1;
    case "action":
      return 2;
  }
}

function pairSplitLines(lines: readonly ParsedDiffLine[]) {
  const rows: {
    key: string;
    newLine: ParsedDiffLine | undefined;
    oldLine: ParsedDiffLine | undefined;
  }[] = [];
  let pendingDeleted: ParsedDiffLine[] = [];

  for (const line of lines) {
    if (line.kind === "deleted") {
      pendingDeleted.push(line);
      continue;
    }

    if (line.kind === "added") {
      const oldLine = pendingDeleted.shift();
      rows.push({
        key: `${oldLine?.key ?? "blank"}-${line.key}`,
        newLine: line,
        oldLine
      });
      continue;
    }

    for (const deletedLine of pendingDeleted) {
      rows.push({
        key: deletedLine.key,
        newLine: undefined,
        oldLine: deletedLine
      });
    }
    pendingDeleted = [];
    rows.push({ key: line.key, newLine: line, oldLine: line });
  }

  for (const deletedLine of pendingDeleted) {
    rows.push({
      key: deletedLine.key,
      newLine: undefined,
      oldLine: deletedLine
    });
  }

  return rows;
}

function nextPendingPath(
  workspace: ReviewWorkspaceView,
  reviewedPath: string
): string | undefined {
  const visibleFiles = workspace.files.filter((file) => file.visible && !file.reviewed);
  const reviewedIndex = workspace.files.findIndex((file) => file.path === reviewedPath);

  return (
    visibleFiles.find(
      (file) =>
        workspace.files.findIndex((candidate) => candidate.path === file.path) >
        reviewedIndex
    )?.path ?? visibleFiles[0]?.path
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

function loadStatusFromProgress(progress: ProjectLoadProgressView): WorkspaceLoadStatus {
  return {
    detail: loadProgressDetail(progress),
    ...(progress.loadedFiles !== undefined ? { loadedFiles: progress.loadedFiles } : {}),
    title: progress.message,
    ...(progress.totalFiles !== undefined ? { totalFiles: progress.totalFiles } : {})
  };
}

function loadProgressDetail(progress: ProjectLoadProgressView): string {
  if (progress.phase === "loading_files" && progress.totalFiles !== undefined) {
    const loadedFiles = progress.loadedFiles ?? 0;
    const pathSuffix = progress.path ? ` · ${progress.path}` : "";

    return `${String(loadedFiles)} / ${String(progress.totalFiles)} files${pathSuffix}`;
  }

  return progress.projectName;
}

function tabLoadingText(status: WorkspaceLoadStatus): string {
  if (
    status.loadedFiles !== undefined &&
    status.totalFiles !== undefined &&
    status.totalFiles > 0
  ) {
    return `${String(status.loadedFiles)}/${String(status.totalFiles)}`;
  }

  return "Loading";
}

function tabSwitchLoaderDelayMs(project: RecentProjectView | undefined): number {
  const changedFileCount = project?.reviewSummary?.progress.totalVisibleReviewableFiles;

  if (
    changedFileCount !== undefined &&
    changedFileCount > immediateTabSwitchLoaderFileThreshold
  ) {
    return 0;
  }

  return delayedTabSwitchLoaderMs;
}

function tabReviewCountText(summary: ProjectReviewSummaryView | undefined): string {
  if (!summary) {
    return "-/-";
  }

  return `${String(summary.progress.reviewedVisibleFiles)}/${String(
    summary.progress.totalVisibleReviewableFiles
  )}`;
}

function projectTabTitle(
  project: RecentProjectView,
  summary: ProjectReviewSummaryView | undefined,
  isSummaryLoading: boolean
): string {
  if (isSummaryLoading) {
    return `${project.path} · Updating review status`;
  }

  if (!summary) {
    return `${project.path} · Review status not loaded`;
  }

  if (summary.attentionCount > 0) {
    return `${project.path} · ${String(summary.attentionCount)} reviewed files changed`;
  }

  const total = summary.progress.totalVisibleReviewableFiles;
  const reviewed = summary.progress.reviewedVisibleFiles;

  if (total === 0) {
    return `${project.path} · No changed files`;
  }

  if (reviewed >= total) {
    return `${project.path} · All files reviewed`;
  }

  return `${project.path} · ${String(reviewed)} of ${String(total)} files reviewed`;
}

function projectReviewSummary(workspace: ReviewWorkspaceView): ProjectReviewSummaryView {
  return {
    attentionCount: workspace.files.filter((file) => file.visible && file.invalidated)
      .length,
    progress: workspace.progress
  };
}

function reviewSummariesEqual(
  left: ProjectReviewSummaryView | undefined,
  right: ProjectReviewSummaryView
): boolean {
  if (!left) {
    return false;
  }

  return (
    left.attentionCount === right.attentionCount &&
    left.progress.reviewedVisibleFiles === right.progress.reviewedVisibleFiles &&
    left.progress.totalVisibleReviewableFiles ===
      right.progress.totalVisibleReviewableFiles
  );
}

function omitProjectReviewSummary(project: RecentProjectView): RecentProjectView {
  const { reviewSummary, ...projectWithoutSummary } = project;

  void reviewSummary;

  return projectWithoutSummary;
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

function diffTargetLabel(target: ReviewWorkspaceView["reviewTarget"]): string {
  if (target.kind === "branch") {
    return `against ${target.baseRefName ?? "base"}`;
  }

  return target.headRefName ?? "worktree";
}

function suggestedBaseRef(
  branchRefs: readonly string[],
  headRefName: string | undefined
): string | undefined {
  const preferredRefs = ["origin/main", "main", "origin/master", "master", "develop"];

  return (
    preferredRefs.find(
      (branchRef) => branchRef !== headRefName && branchRefs.includes(branchRef)
    ) ?? branchRefs.find((branchRef) => branchRef !== headRefName)
  );
}

function reviewState(file: ReviewFileView): ReviewState {
  if (file.invalidated) {
    return "attention";
  }

  return file.reviewed ? "reviewed" : "pending";
}

function reviewSummaryState(summary: ProjectReviewSummaryView): ReviewState {
  if (summary.attentionCount > 0) {
    return "attention";
  }

  if (
    summary.progress.totalVisibleReviewableFiles > 0 &&
    summary.progress.reviewedVisibleFiles >= summary.progress.totalVisibleReviewableFiles
  ) {
    return "reviewed";
  }

  return "pending";
}

function splitPath(path: string): {
  readonly dirname: string;
  readonly filename: string;
} {
  const segments = path.split("/");
  const filename = segments.at(-1) ?? path;
  const dirname = segments.slice(0, -1).join("/");

  return {
    dirname: dirname.length > 0 ? dirname : ".",
    filename
  };
}

function lineGlyph(kind: ParsedDiffLine["kind"]): string {
  switch (kind) {
    case "added":
      return "+";
    case "deleted":
      return "-";
    case "context":
      return " ";
  }
}

function maxLineColumns(lines: readonly (ParsedDiffLine | undefined)[]): number {
  return Math.max(
    1,
    ...lines.map((line) => (line ? line.text.replaceAll("\t", "    ").length : 0))
  );
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) {
    return 0;
  }

  if (index < 0) {
    return length - 1;
  }

  if (index >= length) {
    return 0;
  }

  return index;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function classList(...classes: readonly (string | undefined)[]): string {
  return classes.filter((className): className is string => Boolean(className)).join(" ");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected Difftray error.";
}

function themeModeFromValue(value: string): ThemeMode {
  return value === "dark" || value === "light" || value === "system" ? value : "system";
}
