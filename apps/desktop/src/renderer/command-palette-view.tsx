import { Search } from "lucide-react";

import styles from "./App.module.css";
import { groupCommands, type CommandItem, type PaletteMode } from "./command-palette.js";

export function CommandPalette({
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
