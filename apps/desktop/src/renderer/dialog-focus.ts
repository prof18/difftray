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
    const firstControl = focusables()[0];
    firstControl?.focus();
    // Opened by pointer or the app menu: focus still moves in, but the first control
    // shows no ring until the keyboard is used, as with a mouse click.
    const clearPointerFocus = () =>
      firstControl?.removeAttribute("data-dialog-pointer-focus");
    if (firstControl && !previouslyShowedFocus) {
      firstControl.setAttribute("data-dialog-pointer-focus", "");
      firstControl.addEventListener("blur", clearPointerFocus, { once: true });
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      clearPointerFocus();
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
      clearPointerFocus();
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
