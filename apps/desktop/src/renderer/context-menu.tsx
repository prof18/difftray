import { useEffect, useRef, type ReactNode } from "react";

import styles from "./context-menu.module.css";

export type ContextMenuItem = {
  readonly disabled?: boolean;
  readonly icon: ReactNode;
  readonly id: string;
  readonly label: string;
  readonly onSelect: () => void;
};

export function ContextMenu({
  ariaLabel,
  items,
  left,
  onClose,
  onDismiss,
  top
}: {
  readonly ariaLabel: string;
  readonly items: readonly ContextMenuItem[];
  readonly left: number;
  readonly onClose: () => void;
  readonly onDismiss: () => void;
  readonly top: number;
}): React.JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const menu = menuRef.current;
    const firstEnabledItem = menu?.querySelector<HTMLButtonElement>(
      "[role='menuitem']:not(:disabled)"
    );
    (firstEnabledItem ?? menu)?.focus();

    function closeOnOutsidePointer(event: PointerEvent): void {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        onClose();
      }
    }

    function closeOnFocusOutside(event: FocusEvent): void {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        onDismiss();
      }
    }

    function closeOnWindowChange(): void {
      onClose();
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("focusin", closeOnFocusOutside);
    window.addEventListener("blur", closeOnWindowChange);
    window.addEventListener("resize", closeOnWindowChange);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("focusin", closeOnFocusOutside);
      window.removeEventListener("blur", closeOnWindowChange);
      window.removeEventListener("resize", closeOnWindowChange);
    };
  }, [onClose, onDismiss]);

  return (
    <>
      <div
        aria-hidden="true"
        className={styles.backdrop}
        data-context-menu-backdrop
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      />
      <div
        aria-label={ariaLabel}
        className={styles.menu}
        onContextMenu={(event) => {
          event.preventDefault();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onClose();
            return;
          }

          const enabledItems = [
            ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
              "[role='menuitem']:not(:disabled)"
            )
          ];
          const currentIndex = enabledItems.indexOf(
            document.activeElement as HTMLButtonElement
          );
          const direction =
            event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;

          if (direction !== 0 && enabledItems.length > 0) {
            event.preventDefault();
            enabledItems[
              (currentIndex + direction + enabledItems.length) % enabledItems.length
            ]?.focus();
          }
        }}
        ref={menuRef}
        role="menu"
        style={{ left, top }}
        tabIndex={-1}
      >
        {items.map((item) => (
          <button
            disabled={item.disabled}
            key={item.id}
            onClick={() => {
              item.onSelect();
              onClose();
            }}
            role="menuitem"
            tabIndex={-1}
            type="button"
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>
    </>
  );
}
