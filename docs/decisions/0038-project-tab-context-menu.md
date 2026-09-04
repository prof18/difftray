# Decision 0038: Project Tab Context Menu

## Status

Accepted

## Date

2026-09-04

## Decision

Every open repository tab, including linked-worktree tabs, exposes a context menu
with `Copy path` and `Close Repository`. Both actions target the tab where the menu
was invoked, without first selecting it. Closing remains a non-destructive tab action
that preserves saved repository state.

The menu reuses the renderer's shared context-menu component for pointer shielding,
keyboard navigation, viewport positioning, and focus restoration. Copy requests send
only a project ID through a narrow preload API; the main process resolves the current
stored path and writes it with Electron's clipboard API.

## Context

Repository and worktree paths are frequently needed outside Difftray, while tab
management should not require selecting a repository first. Inactive tabs therefore
need actions scoped to their own identity rather than to the active workspace.

The renderer already receives display paths, but keeping clipboard writes in the main
process preserves the existing Electron trust boundary and avoids accepting a path
supplied by renderer-originated data.

## Consequences

Positive:

- Any repository or linked worktree path can be copied directly from its tab.
- Inactive tabs can be closed without changing the active review workspace.
- Tab, worktree, and file context menus share consistent interaction behavior.
- The main process remains authoritative for filesystem paths written to the clipboard.

Negative:

- The preload surface gains one project-scoped clipboard method.
- The tab bar owns context-menu state in addition to drag and overflow state.
