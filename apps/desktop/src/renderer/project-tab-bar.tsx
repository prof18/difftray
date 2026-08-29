import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Folder, FolderGit2, MoreHorizontal, Plus, X } from "lucide-react";

import styles from "./project-tab-bar.module.css";
import { projectIdentityLabel } from "./project-identity.js";
import {
  projectTabOrdersMatch,
  resolveLiveProjectTabReorder,
  shouldCancelActiveTabDrag,
  type ProjectTabDropTarget,
  type ProjectTabLayout
} from "./project-tabs.js";
import { classList, reviewSummaryState } from "./review-view-model.js";
import {
  projectTabTitle,
  tabLoadingText,
  tabReviewCountText,
  type WorkspaceLoadStatus
} from "./workspace-load-status.js";

export type ProjectTabBarProps = {
  readonly activeProjectId: string;
  readonly activeReviewSummary?: ProjectReviewSummaryView;
  readonly activeProjectHasWorktreeSiblings?: boolean;
  readonly disabled: boolean;
  readonly loadingStatus?: WorkspaceLoadStatus;
  readonly onCloseActiveProject: () => void;
  readonly onForgetActiveProject: () => void;
  readonly onOpenActiveProjectInFinder: () => void;
  readonly onOpenActiveProjectWorktrees: () => void;
  readonly onOpenProject: () => void;
  readonly onRefreshActiveProject: () => void;
  readonly onReorderProjects: (nextProjects: readonly RecentProjectView[]) => void;
  readonly onCommitProjectOrder: (input: {
    readonly nextProjects: readonly RecentProjectView[];
    readonly rollbackProjects: readonly RecentProjectView[];
  }) => void;
  readonly onSelectProject: (projectId: string) => void;
  readonly projects: readonly RecentProjectView[];
  readonly summaryLoadingProjectIds: ReadonlySet<string>;
  readonly tabDragCancelKey?: number;
};

export function ProjectTabBar({
  activeProjectId,
  activeProjectHasWorktreeSiblings,
  activeReviewSummary,
  disabled,
  loadingStatus,
  onCloseActiveProject,
  onForgetActiveProject,
  onOpenActiveProjectInFinder,
  onOpenActiveProjectWorktrees,
  onOpenProject,
  onRefreshActiveProject,
  onReorderProjects,
  onCommitProjectOrder,
  onSelectProject,
  projects,
  summaryLoadingProjectIds,
  tabDragCancelKey = 0
}: ProjectTabBarProps): React.JSX.Element {
  const tabScrollerRef = useRef<HTMLDivElement>(null);
  const inlineOpenButtonRef = useRef<HTMLButtonElement>(null);
  const repositoryMenuRef = useRef<HTMLDivElement>(null);
  const repositoryMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const dragProjectsRef = useRef(projects);
  const dragStartProjectsRef = useRef(projects);
  const droppedRef = useRef(false);
  const lastAppliedOrderIndexRef = useRef<number | undefined>(undefined);
  const previousTabDragCancelKeyRef = useRef(0);
  const [draggedProjectId, setDraggedProjectId] = useState<string | undefined>();
  const [dropTarget, setDropTarget] = useState<ProjectTabDropTarget | undefined>();
  const [openButtonInline, setOpenButtonInline] = useState(false);
  const [repositoryMenuOpen, setRepositoryMenuOpen] = useState(false);
  const [tabScrollEdges, setTabScrollEdges] = useState({
    atEnd: true,
    atStart: true
  });
  const activeProject = projects.find((project) => project.id === activeProjectId);
  const activeTabId = activeProject?.id;
  const activeProjectName = activeProject?.repositoryName ?? activeProject?.name;

  const updateTabScrollEdges = useCallback((scroller: HTMLDivElement): void => {
    const next = {
      atEnd: scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 1,
      atStart: scroller.scrollLeft <= 1
    };

    setTabScrollEdges((current) =>
      current.atEnd === next.atEnd && current.atStart === next.atStart ? current : next
    );
  }, []);

  useEffect(() => {
    if (!repositoryMenuOpen) {
      return;
    }

    function closeOnOutsidePointer(event: PointerEvent): void {
      if (
        event.target instanceof Node &&
        !repositoryMenuRef.current?.contains(event.target)
      ) {
        setRepositoryMenuOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeRepositoryMenu(true);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [repositoryMenuOpen]);

  useEffect(() => {
    if (!repositoryMenuOpen) return;
    repositoryMenuRef.current
      ?.querySelector<HTMLButtonElement>("[role='menuitem']")
      ?.focus();
  }, [repositoryMenuOpen]);

  useEffect(() => {
    setRepositoryMenuOpen(false);
  }, [activeProjectId]);

  useLayoutEffect(() => {
    function updateTabLayout(): void {
      const scroller = tabScrollerRef.current;
      const inlineOpenButton = inlineOpenButtonRef.current;

      if (!scroller || !inlineOpenButton) {
        return;
      }

      const fallbackOpenButtonSpace = inlineOpenButton.offsetWidth + 6;
      const nextOpenButtonInline =
        scroller.scrollWidth <= scroller.clientWidth + fallbackOpenButtonSpace;

      setOpenButtonInline(nextOpenButtonInline);
      updateTabScrollEdges(scroller);
    }

    updateTabLayout();

    const resizeObserver = new ResizeObserver(updateTabLayout);

    if (tabScrollerRef.current) {
      resizeObserver.observe(tabScrollerRef.current);
    }

    window.addEventListener("resize", updateTabLayout);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateTabLayout);
    };
  }, [
    activeProjectId,
    activeReviewSummary,
    projects,
    summaryLoadingProjectIds,
    updateTabScrollEdges
  ]);

  useLayoutEffect(() => {
    if (!activeTabId) {
      return;
    }

    const activeTab = [...(tabScrollerRef.current?.children ?? [])].find(
      (tab): tab is HTMLElement =>
        tab instanceof HTMLElement && tab.dataset.projectId === activeTabId
    );

    activeTab?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest"
    });
  }, [activeTabId]);

  function clearDragState(): void {
    setDraggedProjectId(undefined);
    setDropTarget(undefined);
    lastAppliedOrderIndexRef.current = undefined;
  }

  useEffect(() => {
    if (!draggedProjectId) {
      dragProjectsRef.current = projects;
    }
  }, [draggedProjectId, projects]);

  useEffect(() => {
    if (
      !shouldCancelActiveTabDrag({
        nextCancelKey: tabDragCancelKey,
        previousCancelKey: previousTabDragCancelKeyRef.current
      })
    ) {
      return;
    }

    previousTabDragCancelKeyRef.current = tabDragCancelKey;
    dragProjectsRef.current = projects;
    clearDragState();
  }, [tabDragCancelKey, projects]);

  function applyLiveTabReorder(draggedId: string, pointerX: number): void {
    const reorder = resolveLiveProjectTabReorder({
      dragProjects: dragProjectsRef.current,
      draggedProjectId: draggedId,
      lastAppliedOrderIndex: lastAppliedOrderIndexRef.current,
      layouts: tabLayoutsFromScroller(),
      pointerX
    });

    if (reorder.dropTarget) {
      setDropTarget(reorder.dropTarget);
    } else {
      setDropTarget(undefined);
    }

    if (!reorder.shouldReorder) {
      return;
    }

    dragProjectsRef.current = reorder.nextDragProjects;
    lastAppliedOrderIndexRef.current = reorder.nextAppliedOrderIndex;
    onReorderProjects(reorder.nextDragProjects);
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

  function tabLayoutsFromScroller(): readonly ProjectTabLayout[] {
    const scroller = tabScrollerRef.current;

    if (!scroller) {
      return [];
    }

    return [...scroller.querySelectorAll<HTMLElement>("[data-project-id]")].map(
      (tabElement) => {
        const bounds = tabElement.getBoundingClientRect();

        return {
          projectId: tabElement.dataset.projectId ?? "",
          left: bounds.left,
          width: bounds.width
        };
      }
    );
  }

  function updateDropTarget(event: React.DragEvent<HTMLElement>): void {
    const draggedId = projectIdFromDrag(event);

    if (!draggedId) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    applyLiveTabReorder(draggedId, event.clientX);
  }

  function handleDrop(event: React.DragEvent<HTMLElement>): void {
    const draggedId = projectIdFromDrag(event);

    if (!draggedId) {
      clearDragState();
      return;
    }

    event.preventDefault();
    applyLiveTabReorder(draggedId, event.clientX);
    droppedRef.current = true;
    onCommitProjectOrder({
      nextProjects: dragProjectsRef.current,
      rollbackProjects: dragStartProjectsRef.current
    });
    clearDragState();
  }

  function handleDragEnd(): void {
    if (
      !droppedRef.current &&
      !projectTabOrdersMatch(dragProjectsRef.current, dragStartProjectsRef.current)
    ) {
      onReorderProjects(dragStartProjectsRef.current);
    }

    clearDragState();
  }

  function closeRepositoryMenu(restoreFocus = false): void {
    setRepositoryMenuOpen(false);
    if (restoreFocus) {
      repositoryMenuTriggerRef.current?.focus();
    }
  }

  function handleRepositoryMenuAction(
    event: React.MouseEvent<HTMLButtonElement>,
    action: () => void
  ): void {
    closeRepositoryMenu(event.detail === 0);
    action();
  }

  return (
    <div className={styles.projectTabs} data-open-inline={openButtonInline}>
      <div
        className={styles.tabStrip}
        data-at-end={tabScrollEdges.atEnd}
        data-at-start={tabScrollEdges.atStart}
        data-project-tab-strip="true"
      >
        <div
          className={styles.tabScroller}
          onDragLeave={(event) => {
            const relatedTarget = event.relatedTarget;

            if (
              relatedTarget instanceof Node &&
              event.currentTarget.contains(relatedTarget)
            ) {
              return;
            }

            setDropTarget(undefined);
          }}
          onDragOver={updateDropTarget}
          onDrop={handleDrop}
          onScroll={(event) => {
            updateTabScrollEdges(event.currentTarget);
          }}
          ref={tabScrollerRef}
        >
          {projects.map((project) => {
            const isActive = project.id === activeProjectId;
            const isLoading = isActive && loadingStatus !== undefined;
            const isSummaryLoading =
              !isActive && summaryLoadingProjectIds.has(project.id);
            const reviewSummary = isActive
              ? (activeReviewSummary ?? project.reviewSummary)
              : project.reviewSummary;
            const tabState = reviewSummary
              ? reviewSummaryState(reviewSummary)
              : "unknown";
            const repositoryName = project.repositoryName;
            const worktreeName = project.worktreeName;
            const worktreeLabel =
              repositoryName && worktreeName
                ? { repositoryName, worktreeName }
                : undefined;
            const tabTitle = isLoading
              ? loadingStatus.detail
              : projectTabTitle(project, reviewSummary, isSummaryLoading);
            const identityLabel = projectIdentityLabel(project);

            return (
              <div
                className={styles.projectTab}
                data-active={isActive}
                data-dragging={draggedProjectId === project.id ? true : undefined}
                data-drop-position={
                  dropTarget?.projectId === project.id ? dropTarget.position : undefined
                }
                data-project-id={project.id}
                data-project-tab-name={project.name}
                data-worktree-tab={worktreeLabel ? true : undefined}
                draggable={!disabled}
                key={project.id}
                onDragEnd={handleDragEnd}
                onDragStart={(event) => {
                  if (disabled) {
                    event.preventDefault();
                    return;
                  }

                  setDraggedProjectId(project.id);
                  dragProjectsRef.current = projects;
                  dragStartProjectsRef.current = projects;
                  droppedRef.current = false;
                  lastAppliedOrderIndexRef.current = projects.findIndex(
                    (entry) => entry.id === project.id
                  );
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData(
                    "application/x-difftray-project-id",
                    project.id
                  );
                  event.dataTransfer.setData("text/plain", project.id);
                }}
              >
                <button
                  aria-label={
                    worktreeLabel ? `${identityLabel} · ${tabTitle}` : undefined
                  }
                  className={styles.projectTabSelect}
                  disabled={disabled}
                  onClick={() => {
                    onSelectProject(project.id);
                  }}
                  title={worktreeLabel ? `${identityLabel} · ${tabTitle}` : tabTitle}
                  type="button"
                >
                  {isLoading ? (
                    <span className={styles.tabLoadingMark} aria-hidden />
                  ) : worktreeLabel ? (
                    <FolderGit2 size={14} strokeWidth={1.4} aria-hidden />
                  ) : (
                    <Folder size={14} strokeWidth={1.4} aria-hidden />
                  )}
                  {worktreeLabel ? (
                    <span className={styles.tabWorktreeLabel}>
                      <span
                        className={styles.tabRepositoryName}
                        data-tab-repository-name="true"
                      >
                        {worktreeLabel.repositoryName}
                      </span>
                      <span className={styles.tabLabelSeparator} aria-hidden>
                        /
                      </span>
                      <span
                        className={styles.tabWorktreeName}
                        data-tab-worktree-name="true"
                      >
                        {worktreeLabel.worktreeName}
                      </span>
                    </span>
                  ) : (
                    <span className={styles.tabProjectName}>{project.name}</span>
                  )}
                  {isLoading ? null : isSummaryLoading ? (
                    <span className={styles.tabSummaryLoadingMark} aria-hidden />
                  ) : tabState === "attention" ? (
                    <span
                      className={styles.statusDot}
                      data-state={tabState}
                      aria-hidden
                    />
                  ) : null}
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
      </div>
      <div className={styles.repositoryActions} data-repository-actions="true">
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
        {activeProjectHasWorktreeSiblings ? (
          <button
            aria-label={`Worktrees for ${activeProjectName ?? "active repository"}`}
            className={styles.worktreesButton}
            disabled={disabled}
            onClick={onOpenActiveProjectWorktrees}
            title="Worktrees"
            type="button"
          >
            <FolderGit2 size={15} strokeWidth={1.4} aria-hidden />
            <span>Worktrees</span>
          </button>
        ) : null}
        <div className={styles.repositoryMenuAnchor} ref={repositoryMenuRef}>
          <button
            aria-expanded={repositoryMenuOpen}
            aria-haspopup="menu"
            aria-label={`Repository actions for ${activeProjectName ?? "active repository"}`}
            className={styles.tabIconButton}
            disabled={disabled}
            onClick={() => setRepositoryMenuOpen((open) => !open)}
            ref={repositoryMenuTriggerRef}
            title="Repository actions"
            type="button"
          >
            <MoreHorizontal size={16} strokeWidth={1.4} aria-hidden />
          </button>
          <div
            aria-label={`Repository actions for ${activeProjectName ?? "active repository"}`}
            className={styles.repositoryMenu}
            hidden={!repositoryMenuOpen}
            onKeyDown={(event) => {
              if (event.key === "Tab") {
                closeRepositoryMenu();
                return;
              }

              const items = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  "[role='menuitem']"
                )
              );
              const currentIndex = items.indexOf(
                document.activeElement as HTMLButtonElement
              );
              let nextIndex: number | undefined;
              if (event.key === "ArrowDown")
                nextIndex = (currentIndex + 1) % items.length;
              else if (event.key === "ArrowUp") {
                nextIndex = (currentIndex - 1 + items.length) % items.length;
              } else if (event.key === "Home") nextIndex = 0;
              else if (event.key === "End") nextIndex = items.length - 1;
              const nextItem = nextIndex === undefined ? undefined : items[nextIndex];
              if (nextItem) {
                event.preventDefault();
                nextItem.focus();
              }
            }}
            role="menu"
          >
            <button
              onClick={(event) =>
                handleRepositoryMenuAction(event, onRefreshActiveProject)
              }
              role="menuitem"
              type="button"
            >
              Refresh
            </button>
            <button
              onClick={(event) =>
                handleRepositoryMenuAction(event, onOpenActiveProjectInFinder)
              }
              role="menuitem"
              type="button"
            >
              Show in Finder
            </button>
            <div className={styles.repositoryMenuDivider} role="separator" />
            <button
              onClick={(event) => handleRepositoryMenuAction(event, onCloseActiveProject)}
              role="menuitem"
              type="button"
            >
              Close Repository
            </button>
            <button
              onClick={(event) =>
                handleRepositoryMenuAction(event, onForgetActiveProject)
              }
              role="menuitem"
              type="button"
            >
              Forget Repository…
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
