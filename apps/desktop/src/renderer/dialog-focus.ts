import { useEffect, type RefObject } from "react";

const focusableSelector =
  'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export function isDialogButtonEventTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("button") !== null;
}

export function useDialogFocusTrap(dialogRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previouslyShowedFocus = previouslyFocused?.matches(":focus-visible") ?? false;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusables = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) => !element.hasAttribute("disabled")
      );
    focusables()[0]?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const currentIndex = items.indexOf(document.activeElement as HTMLElement);
      const nextIndex = event.shiftKey
        ? currentIndex <= 0
          ? items.length - 1
          : currentIndex - 1
        : currentIndex >= items.length - 1
          ? 0
          : currentIndex + 1;
      event.preventDefault();
      items[nextIndex]?.focus();
    };
    dialog.addEventListener("keydown", handleKeyDown);
    return () => {
      dialog.removeEventListener("keydown", handleKeyDown);
      if (!previouslyFocused) return;
      if (!previouslyShowedFocus) {
        previouslyFocused.setAttribute("data-dialog-focus-restored", "");
        previouslyFocused.addEventListener(
          "blur",
          () => previouslyFocused.removeAttribute("data-dialog-focus-restored"),
          { once: true }
        );
      }
      previouslyFocused.focus();
    };
  }, [dialogRef]);
}
