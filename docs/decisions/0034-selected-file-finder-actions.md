# Decision 0034: Selected File External Actions

## Status

Accepted

## Date

2026-08-30

## Decision

Expose the selected file's Finder action in both places where desktop users expect
it: the file row's context menu and the native File menu. Also include the action in
the command palette for keyboard-driven workflows. The row context menu and command
palette keep `Open in Editor` beside `Show in Finder` so the two file-level external
actions are available together.

All entry points use one typed renderer-to-main-process action. The renderer sends
only the stored project ID and workspace-relative file path. The main process
reloads the current workspace, rejects missing or deleted files, resolves the file
inside the stored project root, and calls Electron's native `showItemInFolder` API.
The native File menu item tracks whether the renderer currently has a non-deleted
selected file and remains disabled otherwise, including while its window is closed
or reloading. Results from external-file actions are ignored after the user changes
the active project or selected file.

The file-row menu supports keyboard navigation, Escape, outside-pointer and
focus-change dismissal, viewport-edge positioning, and focus restoration to the
invoking row. It stays open through lazy detail loading, but closes if the active
project changes or its target file disappears. Deleted rows may still expose the menu
for consistency, but both external actions are disabled.

## Context

Difftray already exposes `Show in Finder` for the active repository, but that action
opens the repository folder and cannot reveal the file under review. A row context
menu is the fastest local action for pointer users, while the native menu and
command palette make the same capability discoverable and keyboard-accessible.

Resolving the file again in the main process keeps filesystem authority out of the
renderer and prevents stale, deleted, or path-escaping review entries from reaching
the native shell API.

## Consequences

Positive:

- Pointer and keyboard users can reveal the current file without navigating from
  the repository root.
- Keyboard users can open the current file in their editor from the command palette.
- Every UI surface shares the same validation and error behavior.
- The existing editor action becomes discoverable from the file row.

Negative:

- The renderer must synchronize selected-file availability with the native menu.
- The custom context menu adds focus, dismissal, and viewport-positioning behavior
  that must remain covered by interaction and visual tests.
