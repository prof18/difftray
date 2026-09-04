import { Copy, GitBranch, LockKeyhole, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import paletteStyles from "./command-palette-view.module.css";
import { ContextMenu } from "./context-menu.js";
import styles from "./worktree-picker.module.css";
import { isDialogButtonEventTarget, useDialogFocusTrap } from "./dialog-focus.js";

export function WorktreePicker({
  onClose,
  onCopyPath,
  onRefresh,
  onSelect,
  projectName,
  worktrees
}: {
  readonly onClose: () => void;
  readonly onCopyPath: (worktree: RepositoryWorktreeView) => void;
  readonly onRefresh: () => void;
  readonly onSelect: (worktree: RepositoryWorktreeView) => void;
  readonly projectName: string;
  readonly worktrees: readonly RepositoryWorktreeView[];
}): React.JSX.Element {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const activeIndex =
    worktrees.length === 0 ? 0 : Math.min(selectedIndex, worktrees.length - 1);
  const dialogRef = useRef<HTMLElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const contextMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    readonly left: number;
    readonly top: number;
    readonly worktree: RepositoryWorktreeView;
  }>();
  const listboxId = `worktree-picker-listbox-${useId().replaceAll(":", "")}`;
  const activeItemId =
    worktrees.length === 0 ? undefined : `${listboxId}-option-${String(activeIndex)}`;
  useDialogFocusTrap(dialogRef);

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

  useEffect(() => {
    resultsRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelectedIndex((index) =>
      worktrees.length === 0 ? 0 : Math.min(index, worktrees.length - 1)
    );
  }, [worktrees]);

  useEffect(() => {
    const activeOption = resultsRef.current?.querySelector<HTMLElement>(
      '[data-selected="true"]'
    );
    if (activeOption && typeof activeOption.scrollIntoView === "function") {
      activeOption.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, worktrees]);

  useEffect(() => {
    if (
      contextMenu &&
      !worktrees.some((worktree) => worktree.id === contextMenu.worktree.id)
    ) {
      dismissContextMenu();
    }
  }, [contextMenu, dismissContextMenu, worktrees]);

  return (
    <div
      className={paletteStyles.paletteOverlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-label={`Worktrees for ${projectName}`}
        aria-modal="true"
        className={paletteStyles.palette}
        onKeyDown={(event) => {
          if (event.key !== "Escape" && isDialogButtonEventTarget(event.target)) return;
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            setSelectedIndex((index) =>
              worktrees.length === 0 ? 0 : Math.min(index + 1, worktrees.length - 1)
            );
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setSelectedIndex((index) => Math.max(0, index - 1));
          } else if (event.key === "Enter") {
            const selected = worktrees[activeIndex];
            if (selected) {
              event.preventDefault();
              onSelect(selected);
            }
          }
        }}
        role="dialog"
        ref={dialogRef}
      >
        <header className={styles.header}>
          <div>
            <span>Repository worktrees</span>
            <strong>Worktrees for {projectName}</strong>
          </div>
          <div className={styles.actions}>
            <button aria-label="Refresh worktrees" onClick={onRefresh} type="button">
              <RefreshCw size={14} aria-hidden />
            </button>
            <button aria-label="Close worktrees" onClick={onClose} type="button">
              <X size={14} aria-hidden />
            </button>
          </div>
        </header>
        <div
          aria-activedescendant={activeItemId}
          aria-label="Repository worktrees"
          className={paletteStyles.paletteResults}
          id={listboxId}
          ref={resultsRef}
          role="listbox"
          onScroll={closeContextMenu}
          tabIndex={0}
        >
          {worktrees.map((worktree, index) => (
            <button
              aria-selected={index === activeIndex}
              className={paletteStyles.paletteItem}
              data-kind="project"
              data-selected={index === activeIndex}
              id={`${listboxId}-option-${String(index)}`}
              key={worktree.id}
              onClick={() => {
                onSelect(worktree);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                const invokedByKeyboard = event.clientX === 0 && event.clientY === 0;
                const triggerBounds = event.currentTarget.getBoundingClientRect();
                const invocationX = invokedByKeyboard
                  ? triggerBounds.left + 12
                  : event.clientX;
                const invocationY = invokedByKeyboard
                  ? triggerBounds.bottom
                  : event.clientY;
                setSelectedIndex(index);
                contextMenuTriggerRef.current = event.currentTarget;
                setContextMenu({
                  left: Math.max(8, Math.min(invocationX, window.innerWidth - 204)),
                  top: Math.max(8, Math.min(invocationY, window.innerHeight - 48)),
                  worktree
                });
              }}
              onFocus={() => setSelectedIndex(index)}
              onMouseEnter={() => setSelectedIndex(index)}
              role="option"
              tabIndex={-1}
              type="button"
            >
              <span className={paletteStyles.paletteItemIcon}>
                <GitBranch size={14} strokeWidth={1.4} aria-hidden />
              </span>
              <span className={paletteStyles.paletteItemCopy}>
                <strong>{worktree.displayName}</strong>
                <small title={worktree.displayPath}>
                  {middleTruncatePath(worktree.displayPath)}
                </small>
              </span>
              {worktree.locked ? (
                <span className={styles.locked}>
                  <LockKeyhole size={11} aria-hidden /> Locked
                </span>
              ) : null}
              <span className={paletteStyles.paletteHint}>
                {worktree.changeCount === undefined
                  ? ""
                  : `${String(worktree.changeCount)} changed · `}
                {stateLabel(worktree.state)}
              </span>
            </button>
          ))}
        </div>
        {contextMenu ? (
          <ContextMenu
            ariaLabel={`Worktree actions for ${contextMenu.worktree.displayName}`}
            items={[
              {
                icon: <Copy size={14} strokeWidth={1.4} aria-hidden />,
                id: "copy-path",
                label: "Copy path",
                onSelect: () => onCopyPath(contextMenu.worktree)
              }
            ]}
            left={contextMenu.left}
            onClose={closeContextMenu}
            onDismiss={dismissContextMenu}
            top={contextMenu.top}
          />
        ) : null}
        <div className={paletteStyles.paletteFooter}>
          Git-recorded siblings · paths distinguish identical folder names
        </div>
      </section>
    </div>
  );
}

export function middleTruncatePath(pathName: string, maxLength = 72): string {
  if (pathName.length <= maxLength) return pathName;
  const tailLength = Math.ceil((maxLength - 1) * 0.65);
  const headLength = maxLength - tailLength - 1;
  return `${pathName.slice(0, headLength)}…${pathName.slice(-tailLength)}`;
}

function stateLabel(state: RepositoryWorktreeView["state"]): string {
  if (state === "current") return "Current";
  if (state === "open") return "Open";
  return "Available";
}
