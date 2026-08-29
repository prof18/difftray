import { Folder, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import paletteStyles from "./command-palette-view.module.css";
import styles from "./repository-picker.module.css";
import { isDialogButtonEventTarget, useDialogFocusTrap } from "./dialog-focus.js";

export type RepositoryPickerItem = {
  readonly project: Pick<RecentProjectView, "id" | "name" | "path">;
  readonly state: "catalog" | "known" | "open";
};

/** Catalog IDs identify discovery records, not the project/tab IDs used by the app. */
export function projectToShowWhileLoading(
  item: RepositoryPickerItem
): RepositoryPickerItem["project"] | undefined {
  return item.state === "catalog" ? undefined : item.project;
}

export function repositoryPickerItems(
  openProjects: readonly RecentProjectView[],
  knownProjects: readonly RecentProjectView[],
  catalog: readonly RepositoryCatalogView[],
  query: string
): readonly RepositoryPickerItem[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const openIds = new Set(openProjects.map(({ id }) => id));
  const knownPaths = new Set(knownProjects.map(({ path }) => path));
  const ranked = <Project extends Pick<RecentProjectView, "name" | "path">>(
    projects: readonly Project[]
  ): readonly Project[] =>
    projects
      .map((project) => ({
        project,
        score:
          normalizedQuery.length === 0
            ? 0
            : Math.max(
                fuzzyScore(project.name, normalizedQuery),
                fuzzyScore(project.path, normalizedQuery)
              )
      }))
      .filter(({ score }) => score >= 0)
      .sort((left, right) => right.score - left.score)
      .map(({ project }) => project);

  return [
    ...ranked(openProjects).map((project) => ({
      project,
      state: "open" as const
    })),
    ...ranked(knownProjects.filter((project) => !openIds.has(project.id))).map(
      (project) => ({ project, state: "known" as const })
    ),
    ...ranked(
      catalog.filter((project) => project.available && !knownPaths.has(project.path))
    ).map((project) => ({ project, state: "catalog" as const }))
  ];
}

export function fuzzyScore(value: string, normalizedQuery: string): number {
  const normalizedValue = value.toLocaleLowerCase();
  const directIndex = normalizedValue.indexOf(normalizedQuery);
  if (directIndex >= 0) return 10_000 - directIndex - normalizedValue.length;
  let queryIndex = 0;
  let gapPenalty = 0;
  let previousMatch = -1;
  for (
    let index = 0;
    index < normalizedValue.length && queryIndex < normalizedQuery.length;
    index += 1
  ) {
    if (normalizedValue[index] === normalizedQuery[queryIndex]) {
      if (previousMatch >= 0) gapPenalty += index - previousMatch - 1;
      previousMatch = index;
      queryIndex += 1;
    }
  }
  return queryIndex === normalizedQuery.length
    ? 1_000 - gapPenalty - normalizedValue.length
    : -1;
}

export function RepositoryPicker({
  catalog,
  knownProjects,
  onBrowse,
  onClose,
  onSelect,
  onScan,
  onRefresh,
  openProjects
}: {
  readonly catalog: readonly RepositoryCatalogView[];
  readonly knownProjects: readonly RecentProjectView[];
  readonly onBrowse: () => void;
  readonly onClose: () => void;
  readonly onSelect: (item: RepositoryPickerItem) => void;
  readonly onScan: () => void;
  readonly onRefresh: () => void;
  readonly openProjects: readonly RecentProjectView[];
}): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const listboxId = `repository-picker-listbox-${useId().replaceAll(":", "")}`;
  useDialogFocusTrap(dialogRef);
  const items = useMemo(
    () => repositoryPickerItems(openProjects, knownProjects, catalog, query),
    [catalog, knownProjects, openProjects, query]
  );
  const activeIndex = items.length === 0 ? 0 : Math.min(selectedIndex, items.length - 1);
  const activeItemId =
    items.length === 0 ? undefined : `${listboxId}-option-${String(activeIndex)}`;
  const groupedItems = useMemo(() => {
    const groups = new Map<
      RepositoryPickerItem["state"],
      { item: RepositoryPickerItem; index: number }[]
    >([
      ["open", []],
      ["known", []],
      ["catalog", []]
    ]);
    items.forEach((item, index) => groups.get(item.state)?.push({ item, index }));
    return groups;
  }, [items]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelectedIndex((index) =>
      items.length === 0 ? 0 : Math.min(index, items.length - 1)
    );
  }, [items]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const activeOption = resultsRef.current?.querySelector<HTMLElement>(
      '[data-selected="true"]'
    );
    if (activeOption && typeof activeOption.scrollIntoView === "function") {
      activeOption.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, items]);

  function activateSelected(): void {
    const selected = items[activeIndex];

    if (selected) {
      onSelect(selected);
    }
  }

  return (
    <div
      className={paletteStyles.paletteOverlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        aria-label="Quick Open repositories"
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
              items.length === 0 ? 0 : Math.min(index + 1, items.length - 1)
            );
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setSelectedIndex((index) => Math.max(index - 1, 0));
          } else if (event.key === "Enter") {
            event.preventDefault();
            activateSelected();
          }
        }}
        role="dialog"
        ref={dialogRef}
      >
        <label className={paletteStyles.paletteSearch}>
          <Search size={16} strokeWidth={1.4} aria-hidden />
          <input
            aria-activedescendant={activeItemId}
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-expanded="true"
            aria-haspopup="listbox"
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            placeholder="Search repositories by name or path"
            ref={inputRef}
            role="combobox"
            value={query}
          />
          <span className={paletteStyles.paletteScope}>Repositories</span>
          <kbd>esc</kbd>
        </label>
        <div
          aria-label="Repository results"
          className={paletteStyles.paletteResults}
          id={listboxId}
          ref={resultsRef}
          role="listbox"
        >
          {items.length === 0 ? (
            <div className={styles.empty}>No matching repositories</div>
          ) : (
            ["open", "known", "catalog"].map((state) => {
              const sectionItems = groupedItems.get(
                state as RepositoryPickerItem["state"]
              );

              return sectionItems && sectionItems.length > 0 ? (
                <div className={paletteStyles.paletteGroup} key={state}>
                  <div className={paletteStyles.sectionLabel}>
                    {state === "open"
                      ? "Open tabs"
                      : state === "known"
                        ? "Known repositories"
                        : "Available in search folders"}
                  </div>
                  {sectionItems.map(({ item, index: itemIndex }) => {
                    return (
                      <button
                        aria-selected={itemIndex === activeIndex}
                        className={paletteStyles.paletteItem}
                        data-kind="project"
                        data-selected={itemIndex === activeIndex}
                        id={`${listboxId}-option-${String(itemIndex)}`}
                        key={item.project.id}
                        onClick={() => {
                          onSelect(item);
                        }}
                        onMouseEnter={() => {
                          setSelectedIndex(itemIndex);
                        }}
                        role="option"
                        type="button"
                      >
                        <span className={paletteStyles.paletteItemIcon}>
                          <Folder size={14} strokeWidth={1.4} aria-hidden />
                        </span>
                        <span className={paletteStyles.paletteItemCopy}>
                          <strong>{item.project.name}</strong>
                          <small>{item.project.path}</small>
                        </span>
                        <span className={paletteStyles.paletteHint}>
                          {item.state === "open" ? "Open" : "Available"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null;
            })
          )}
        </div>
        <div className={styles.footer}>
          <button onClick={onBrowse} type="button">
            Open Repositories…
          </button>
          <button onClick={onScan} type="button">
            Scan a folder…
          </button>
          <button onClick={onRefresh} type="button">
            Refresh catalog
          </button>
          <span>↑ ↓ navigate · ↵ select · ⌘O</span>
        </div>
      </section>
    </div>
  );
}
