import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  ChevronRight,
  Code2,
  Diff,
  ExternalLink,
  FileCode2,
  Folder,
  FolderOpen,
  GitBranch,
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

type LoadState = "idle" | "loading";
type DiffMode = "split" | "unified";
type ReviewDiffTargetMode = "branch" | "working_tree";
type ReviewState = "attention" | "pending" | "reviewed";
type PaletteMode = "all" | "files";
type CommandKind = "action" | "file" | "project";
type ResolvedTheme = "dark" | "light";
type HighlightedLineMap = ReadonlyMap<string, readonly ThemedToken[]>;
type SyntaxLanguage = BundledLanguage | "text";

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

const defaultAppSettings: AppSettingsView = {
  autoCollapseHunksOver: 120,
  defaultDiffMode: "split",
  editorArgs: "",
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

const emptyProjectReviewSummary: ProjectReviewSummaryView = {
  attentionCount: 0,
  progress: {
    reviewedVisibleFiles: 0,
    totalVisibleReviewableFiles: 0
  }
};

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
  const [fileListCollapsed, setFileListCollapsed] = useState(false);
  const [fileListWidth, setFileListWidth] = useState(340);
  const [hasBootstrapped, setHasBootstrapped] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>("idle");
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
  const [toastDismissedFor, setToastDismissedFor] = useState<string | undefined>();
  const [workspace, setWorkspace] = useState<ReviewWorkspaceView | undefined>();
  const diffSurfaceRef = useRef<HTMLDivElement>(null);
  const paletteInputRef = useRef<HTMLInputElement>(null);
  const focusRefreshRunningRef = useRef(false);
  const lastFocusRefreshAtRef = useRef(0);
  const resizeStartRef = useRef<{
    readonly startWidth: number;
    readonly x: number;
  } | null>(null);

  useLayoutEffect(() => {
    void bootstrapApp();
  }, []);

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

      void runWorkspaceLoad(
        () => window.difftray.loadProject(workspace.project.id),
        selectedFile?.path
      ).finally(() => {
        focusRefreshRunningRef.current = false;
      });
    }

    window.addEventListener("focus", handleWindowFocus);

    return () => {
      window.removeEventListener("focus", handleWindowFocus);
    };
  });

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

    try {
      const [projects, settings] = await Promise.all([
        window.difftray.listRecentProjects(),
        window.difftray.getAppSettings()
      ]);

      setRecentProjects(projects);
      setAppSettings(settings);
      setAppSettingsDraft(settings);
      setDiffMode(settings.defaultDiffMode);

      for (const project of projects) {
        const nextWorkspace = await window.difftray.loadProject(project.id);

        if (!nextWorkspace) {
          continue;
        }

        await applyWorkspace(nextWorkspace, undefined, settings);
        break;
      }

      await refreshRecentProjects();
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    } finally {
      setHasBootstrapped(true);
      setLoadState("idle");
    }
  }

  async function refreshRecentProjects(): Promise<void> {
    const nextProjects = await window.difftray.listRecentProjects();

    setRecentProjects((currentProjects) =>
      mergeProjectTabs(currentProjects, nextProjects)
    );
  }

  async function applyWorkspace(
    nextWorkspace: ReviewWorkspaceView,
    nextPath?: string,
    nextAppSettings = appSettings
  ): Promise<void> {
    const [nextSettings, nextBranchRefs] = await Promise.all([
      window.difftray.getProjectSettings(nextWorkspace.project.id),
      window.difftray.listProjectBranchRefs(nextWorkspace.project.id)
    ]);

    setWorkspace(nextWorkspace);
    setProjectSettings(nextSettings);
    setBranchRefs(nextBranchRefs);
    setBaseRefDraft(
      nextWorkspace.reviewTarget.baseRefName ??
        suggestedBaseRef(nextBranchRefs, nextWorkspace.reviewTarget.headRefName) ??
        ""
    );
    setDiffMode(nextAppSettings.defaultDiffMode);
    setFileListWidth(nextSettings.fileListWidth);
    setFileListCollapsed(nextSettings.fileListCollapsed);
    setSelectedPath(nextPath ?? firstVisiblePath(nextWorkspace));
    setSettingsOpen(false);
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
        await applyWorkspace(nextWorkspace, nextPath);
        await refreshRecentProjects();
      } else {
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

  async function closeProject(projectId: string): Promise<void> {
    const closingActiveProject = workspace?.project.id === projectId;
    const closedProjectIndex = recentProjects.findIndex(
      (project) => project.id === projectId
    );

    setError(undefined);
    setLoadState("loading");

    try {
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
    }
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
      setProjectSettings(nextProjectSettings);
      setSettingsOpen(true);
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    } finally {
      setLoadState("idle");
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
      appSettingsDraft.editorMode === "custom" &&
      appSettingsDraft.editorCommand.trim().length === 0
    ) {
      setError("Custom editor command is required.");
      return;
    }

    setError(undefined);
    setLoadState("loading");

    try {
      const [savedAppSettings, savedSettings] = await Promise.all([
        window.difftray.updateAppSettings({
          autoCollapseHunksOver: appSettingsDraft.autoCollapseHunksOver,
          defaultDiffMode: appSettingsDraft.defaultDiffMode,
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
          savedAppSettings
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
        selectedFile?.path
      );
      return;
    }

    await runWorkspaceLoad(
      () =>
        window.difftray.updateProjectDiffTarget({
          mode: "working_tree",
          projectId: workspace.project.id
        }),
      selectedFile?.path
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
    if (!workspace || !selectedFile || selectedFile.reviewed) {
      return;
    }

    const optimisticFile = selectedFile;

    setError(undefined);
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
    if (!workspace || selectedFile?.reviewed !== true) {
      return;
    }

    const optimisticFile = selectedFile;

    setError(undefined);
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
        {workspace ? (
          <div className={styles.titlebarProjectName}>{workspace.project.name}</div>
        ) : null}
      </div>

      {workspace ? (
        <ProjectTabBar
          activeProjectId={workspace.project.id}
          activeReviewSummary={{
            attentionCount: attentionFiles.length,
            progress: workspace.progress
          }}
          disabled={loadState === "loading"}
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
        />
      ) : null}

      {error ? (
        <div className={styles.errorBanner} role="status">
          {error}
        </div>
      ) : null}

      {workspace ? (
        <section className={styles.mainLayout}>
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
              <div className={styles.fileList}>
                {visibleFiles.map((file) => (
                  <FileButton
                    file={file}
                    isSelected={selectedFile?.path === file.path}
                    key={file.path}
                    onSelect={setSelectedPath}
                  />
                ))}
              </div>
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

          <article className={styles.diffPane} aria-label="Diff preview">
            {selectedFile ? (
              <>
                <DiffToolbar
                  disabled={loadState === "loading"}
                  file={selectedFile}
                  onToggleReviewed={() => {
                    void toggleSelectedReviewed();
                  }}
                  onOpenEditor={() => {
                    void openSelectedInEditor();
                  }}
                  refName={diffTargetLabel(workspace.reviewTarget)}
                />
                <DiffSurface
                  diffMode={diffMode}
                  filePath={selectedFile.path}
                  patch={selectedFile.patch}
                  resolvedTheme={resolvedTheme}
                  status={selectedFile.status}
                  refObject={diffSurfaceRef}
                />
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
      ) : !hasBootstrapped || recentProjects.length > 0 ? (
        <section className={styles.launchState} aria-label="Loading repository" />
      ) : (
        <EmptyState
          disabled={loadState === "loading"}
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
  onCloseActiveProject,
  onOpenProject,
  onOpenSettings,
  onReorderProjects,
  onSelectProject,
  projects
}: {
  readonly activeProjectId: string;
  readonly activeReviewSummary: ProjectReviewSummaryView;
  readonly disabled: boolean;
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
  }, [activeProjectId, activeReviewSummary, projects]);

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
          const reviewSummary =
            (isActive ? activeReviewSummary : project.reviewSummary) ??
            emptyProjectReviewSummary;
          const tabState = reviewSummaryState(reviewSummary);

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
                onClick={() => {
                  onSelectProject(project.id);
                }}
                type="button"
              >
                <Folder size={14} strokeWidth={1.4} aria-hidden />
                <span>{project.name}</span>
                <span className={styles.statusDot} data-state={tabState} aria-hidden />
                <span className={styles.tabCount}>
                  {`${String(reviewSummary.progress.reviewedVisibleFiles)}/${String(
                    reviewSummary.progress.totalVisibleReviewableFiles
                  )}`}
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

function FileButton({
  file,
  isSelected,
  onSelect
}: {
  readonly file: ReviewFileView;
  readonly isSelected: boolean;
  readonly onSelect: (path: string) => void;
}): React.JSX.Element {
  const parts = splitPath(file.path);

  return (
    <button
      aria-label={`${parts.filename} ${file.status}${file.invalidated ? " changed after review" : ""}`}
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
}

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

function DiffSurface({
  diffMode,
  filePath,
  patch,
  resolvedTheme,
  status,
  refObject
}: {
  readonly diffMode: DiffMode;
  readonly filePath: string;
  readonly patch: string;
  readonly resolvedTheme: ResolvedTheme;
  readonly status: ReviewFileView["status"];
  readonly refObject: React.RefObject<HTMLDivElement | null>;
}): React.JSX.Element {
  const hunks = useMemo(() => parseDiffHunks(patch), [patch]);
  const highlightedLines = useHighlightedLines({
    filePath,
    hunks,
    resolvedTheme
  });
  const forceSingleFile = status === "added";

  return (
    <div
      className={styles.diffSurface}
      data-diff-layout={forceSingleFile ? "single" : diffMode}
      ref={refObject}
    >
      {hunks.map((hunk) => (
        <section className={styles.hunk} key={hunk.key}>
          <div className={styles.hunkHeader}>
            <Diff size={13} strokeWidth={1.4} aria-hidden />
            <span>{hunk.header}</span>
          </div>
          {forceSingleFile ? (
            <AddedFileHunk highlightedLines={highlightedLines} lines={hunk.lines} />
          ) : diffMode === "split" ? (
            <SplitHunk highlightedLines={highlightedLines} lines={hunk.lines} />
          ) : (
            <UnifiedHunk highlightedLines={highlightedLines} lines={hunk.lines} />
          )}
        </section>
      ))}
    </div>
  );
}

function AddedFileHunk({
  highlightedLines,
  lines
}: {
  readonly highlightedLines: HighlightedLineMap;
  readonly lines: readonly ParsedCodeLine[];
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
  readonly lines: readonly ParsedCodeLine[];
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
  readonly line: ParsedCodeLine | undefined;
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
  readonly lines: readonly ParsedCodeLine[];
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
  hunks,
  resolvedTheme
}: {
  readonly filePath: string;
  readonly hunks: readonly ParsedHunk[];
  readonly resolvedTheme: ResolvedTheme;
}): HighlightedLineMap {
  const [highlightedLines, setHighlightedLines] = useState<HighlightedLineMap>(
    () => new Map()
  );

  useEffect(() => {
    let cancelled = false;
    const language = syntaxLanguageForPath(filePath);
    const theme = syntaxThemes[resolvedTheme];

    setHighlightedLines(new Map());

    async function highlight(): Promise<void> {
      try {
        const highlighter = await getSyntaxHighlighter();

        if (language !== "text") {
          await loadSyntaxLanguage(highlighter, language);
        }

        const nextLines = new Map<string, readonly ThemedToken[]>();

        for (const hunk of hunks) {
          const tokenized = highlighter.codeToTokens(
            hunk.lines.map((line) => line.text).join("\n"),
            {
              lang: language,
              theme
            }
          ).tokens;

          for (const [index, line] of hunk.lines.entries()) {
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
  }, [filePath, hunks, resolvedTheme]);

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
      <div className={styles.dragHint}>Drag a folder anywhere to add it</div>
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
  onCancel,
  onChangeAppSettings,
  onSave
}: {
  readonly appSettings: AppSettingsView;
  readonly disabled: boolean;
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

          <SettingsSection title="Editor">
            <label className={styles.settingRow}>
              <span>Editor</span>
              <select
                onChange={(event) => {
                  onChangeAppSettings({
                    editorMode: event.target.value === "custom" ? "custom" : "system"
                  });
                }}
                value={appSettings.editorMode}
              >
                <option value="system">System default</option>
                <option value="custom">Custom command</option>
              </select>
            </label>
            {appSettings.editorMode === "custom" ? (
              <>
                <label className={styles.settingRow}>
                  <span>Command</span>
                  <input
                    onChange={(event) => {
                      onChangeAppSettings({ editorCommand: event.target.value });
                    }}
                    type="text"
                    value={appSettings.editorCommand}
                  />
                </label>
                <label className={styles.settingRow}>
                  <span>Arguments</span>
                  <input
                    onChange={(event) => {
                      onChangeAppSettings({ editorArgs: event.target.value });
                    }}
                    type="text"
                    value={appSettings.editorArgs}
                  />
                </label>
              </>
            ) : null}
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
  children,
  title
}: {
  readonly children: React.ReactNode;
  readonly title: string;
}): React.JSX.Element {
  return (
    <section className={styles.settingsSection}>
      <div className={styles.sectionLabel}>{title}</div>
      <div className={styles.settingsCard}>{children}</div>
    </section>
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

type ParsedHunk = {
  readonly header: string;
  readonly key: string;
  readonly lines: readonly ParsedCodeLine[];
};

type ParsedCodeLine = {
  readonly key: string;
  readonly kind: "added" | "context" | "deleted";
  readonly newNumber: number | undefined;
  readonly oldNumber: number | undefined;
  readonly text: string;
};

function parseDiffHunks(patch: string): readonly ParsedHunk[] {
  const hunks: ParsedHunk[] = [];
  let current: { header: string; lines: ParsedCodeLine[] } | undefined;
  let oldLine: number | undefined;
  let newLine: number | undefined;

  for (const [index, line] of patch.split("\n").entries()) {
    if (line.startsWith("diff --git") || line.startsWith("index ")) {
      continue;
    }

    if (line.startsWith("@@")) {
      if (current) {
        hunks.push({
          header: current.header,
          key: `${String(hunks.length)}-${current.header}`,
          lines: current.lines
        });
      }

      const parsedHeader =
        /^@@ -(?<oldStart>\d+)(?:,\d+)? \+(?<newStart>\d+)(?:,\d+)? @@/.exec(line);
      oldLine = parsedHeader?.groups?.oldStart
        ? Number(parsedHeader.groups.oldStart)
        : undefined;
      newLine = parsedHeader?.groups?.newStart
        ? Number(parsedHeader.groups.newStart)
        : undefined;
      current = { header: line, lines: [] };
      continue;
    }

    current ??= { header: "File summary", lines: [] };

    if (line.startsWith("---") || line.startsWith("+++")) {
      continue;
    }

    if (line.startsWith("+")) {
      current.lines.push({
        key: `${String(index)}-${line}`,
        kind: "added",
        newNumber: newLine,
        oldNumber: undefined,
        text: line.slice(1)
      });
      newLine = incrementLine(newLine);
      continue;
    }

    if (line.startsWith("-")) {
      current.lines.push({
        key: `${String(index)}-${line}`,
        kind: "deleted",
        oldNumber: oldLine,
        newNumber: undefined,
        text: line.slice(1)
      });
      oldLine = incrementLine(oldLine);
      continue;
    }

    current.lines.push({
      key: `${String(index)}-${line}`,
      kind: "context",
      newNumber: newLine,
      oldNumber: oldLine,
      text: line.startsWith(" ") ? line.slice(1) : line
    });
    oldLine = incrementLine(oldLine);
    newLine = incrementLine(newLine);
  }

  if (current) {
    hunks.push({
      header: current.header,
      key: `${String(hunks.length)}-${current.header}`,
      lines: current.lines
    });
  }

  return hunks.length > 0
    ? hunks
    : [{ header: "No textual diff", key: "empty", lines: [] }];
}

function pairSplitLines(lines: readonly ParsedCodeLine[]) {
  const rows: {
    key: string;
    newLine: ParsedCodeLine | undefined;
    oldLine: ParsedCodeLine | undefined;
  }[] = [];
  let pendingDeleted: ParsedCodeLine[] = [];

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

function lineGlyph(kind: ParsedCodeLine["kind"]): string {
  switch (kind) {
    case "added":
      return "+";
    case "deleted":
      return "-";
    case "context":
      return " ";
  }
}

function maxLineColumns(lines: readonly (ParsedCodeLine | undefined)[]): number {
  return Math.max(
    1,
    ...lines.map((line) => (line ? line.text.replaceAll("\t", "    ").length : 0))
  );
}

function incrementLine(line: number | undefined): number | undefined {
  return line === undefined ? undefined : line + 1;
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
