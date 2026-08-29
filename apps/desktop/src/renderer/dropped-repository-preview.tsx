import { Check, FolderSearch } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import paletteStyles from "./command-palette-view.module.css";
import styles from "./dropped-repository-preview.module.css";
import { useDialogFocusTrap } from "./dialog-focus.js";

export function DroppedRepositoryPreview({
  candidates,
  onCancel,
  onOpen
}: {
  readonly candidates: readonly DroppedRepositoryPreviewView[];
  readonly onCancel: () => void;
  readonly onOpen: (candidateIds: readonly string[], remember: boolean) => void;
}): React.JSX.Element {
  const [selectedIds, setSelectedIds] = useState<readonly string[]>(
    candidates.map((candidate) => candidate.id)
  );
  const [remember, setRemember] = useState(false);
  const firstButton = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocusTrap(dialogRef);
  const canRemember = candidates.some((candidate) => candidate.rememberEligible);
  useEffect(() => firstButton.current?.focus(), []);
  useEffect(() => {
    setSelectedIds(candidates.map((candidate) => candidate.id));
    if (!candidates.some((candidate) => candidate.rememberEligible)) {
      setRemember(false);
    }
  }, [candidates]);

  return (
    <div
      className={paletteStyles.paletteOverlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        aria-label="Repositories found in dropped folders"
        aria-modal="true"
        className={paletteStyles.palette}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
        role="dialog"
        ref={dialogRef}
      >
        <header className={styles.header}>
          <FolderSearch size={18} aria-hidden />
          <div>
            <strong>Choose repositories to open</strong>
            <span>{candidates.length} found in dropped folders</span>
          </div>
        </header>
        <div className={paletteStyles.paletteResults}>
          {candidates.map((candidate, index) => {
            const selected = selectedIds.includes(candidate.id);
            return (
              <button
                aria-pressed={selected}
                className={paletteStyles.paletteItem}
                key={candidate.id}
                onClick={() =>
                  setSelectedIds((current) =>
                    selected
                      ? current.filter((id) => id !== candidate.id)
                      : [...current, candidate.id]
                  )
                }
                ref={index === 0 ? firstButton : undefined}
                type="button"
              >
                <span className={styles.checkbox} data-checked={selected}>
                  {selected ? <Check size={12} aria-hidden /> : null}
                </span>
                <span className={paletteStyles.paletteItemCopy}>
                  <strong>{candidate.name}</strong>
                  <small title={candidate.displayPath}>{candidate.displayPath}</small>
                </span>
              </button>
            );
          })}
        </div>
        {canRemember ? (
          <label className={styles.remember}>
            <input
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
              type="checkbox"
            />
            Remember dropped folders as repository search folders
          </label>
        ) : null}
        <footer className={styles.footer}>
          <span aria-live="polite">{selectedIds.length} selected</span>
          <button onClick={onCancel} type="button">
            Cancel
          </button>
          <button
            disabled={selectedIds.length === 0}
            onClick={() => onOpen(selectedIds, remember)}
            type="button"
          >
            Open {selectedIds.length}{" "}
            {selectedIds.length === 1 ? "repository" : "repositories"}
          </button>
        </footer>
      </section>
    </div>
  );
}
