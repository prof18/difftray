import { GitBranch, LockKeyhole, RefreshCw, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import paletteStyles from "./command-palette-view.module.css";
import styles from "./worktree-picker.module.css";
import { isDialogButtonEventTarget, useDialogFocusTrap } from "./dialog-focus.js";

export function WorktreePicker({
  onClose,
  onRefresh,
  onSelect,
  projectName,
  worktrees
}: {
  readonly onClose: () => void;
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
  const listboxId = `worktree-picker-listbox-${useId().replaceAll(":", "")}`;
  const activeItemId =
    worktrees.length === 0 ? undefined : `${listboxId}-option-${String(activeIndex)}`;
  useDialogFocusTrap(dialogRef);

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
