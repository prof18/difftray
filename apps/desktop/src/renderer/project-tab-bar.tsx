import { useLayoutEffect, useRef, useState } from "react";
import { Folder, Plus, Settings, X } from "lucide-react";

import styles from "./App.module.css";
import { type ProjectTabDropPosition } from "./project-tabs.js";
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
  readonly onReorderProjects: (
    draggedProjectId: string,
    targetProjectId: string,
    position: ProjectTabDropPosition
  ) => void;
  readonly onSelectProject: (projectId: string) => void;
  readonly projects: readonly RecentProjectView[];
  readonly summaryLoadingProjectIds: ReadonlySet<string>;
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
  onSelectProject,
  projects,
  summaryLoadingProjectIds
}: ProjectTabBarProps): React.JSX.Element {
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
