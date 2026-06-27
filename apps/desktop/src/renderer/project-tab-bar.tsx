import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Folder, Plus, Settings, X } from "lucide-react";

import styles from "./project-tab-bar.module.css";
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
  readonly disabled: boolean;
  readonly loadingStatus?: WorkspaceLoadStatus;
  readonly onCloseActiveProject: () => void;
  readonly onOpenProject: () => void;
  readonly onOpenSettings: () => void;
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
  activeReviewSummary,
  disabled,
  loadingStatus,
  onCloseActiveProject,
  onOpenProject,
  onOpenSettings,
  onReorderProjects,
  onCommitProjectOrder,
  onSelectProject,
  projects,
  summaryLoadingProjectIds,
  tabDragCancelKey = 0
}: ProjectTabBarProps): React.JSX.Element {
  const tabScrollerRef = useRef<HTMLDivElement>(null);
  const inlineOpenButtonRef = useRef<HTMLButtonElement>(null);
  const dragProjectsRef = useRef(projects);
  const dragStartProjectsRef = useRef(projects);
  const droppedRef = useRef(false);
  const lastAppliedOrderIndexRef = useRef<number | undefined>(undefined);
  const previousTabDragCancelKeyRef = useRef(0);
  const [draggedProjectId, setDraggedProjectId] = useState<string | undefined>();
  const [dropTarget, setDropTarget] = useState<ProjectTabDropTarget | undefined>();
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

  return (
    <div className={styles.projectTabs} data-open-inline={openButtonInline}>
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
        ref={tabScrollerRef}
      >
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
              data-project-id={project.id}
              data-project-tab-name={project.name}
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
                className={styles.projectTabSelect}
                disabled={disabled}
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
                ) : tabState === "attention" ? (
                  <span className={styles.statusDot} data-state={tabState} aria-hidden />
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
