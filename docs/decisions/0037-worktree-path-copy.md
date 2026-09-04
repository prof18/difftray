# Decision 0037: Worktree Path Copy

## Status

Accepted

## Date

2026-09-04

## Decision

Expose `Copy path` from a worktree row's context menu in the desktop worktree
picker. The action uses the same context-menu component as file-row actions so
pointer shielding, keyboard navigation, Escape handling, viewport positioning,
and focus restoration stay consistent. An outside press is consumed for its full
pointer-and-click sequence before the menu closes, preventing the underlying
worktree row from being selected while dismissing the menu.

The renderer sends only the stored project ID and opaque worktree ID through a
narrow preload API. The main process reloads the repository's Git-recorded
worktrees, rejects missing, bare, or prunable entries, and copies the resolved path
with Electron's clipboard API. Concurrent requests are ordered per renderer so an
older delayed lookup cannot overwrite a newer copied path. Renderer errors are
ignored after a newer copy starts or the picker is refreshed, closed, or replaced.

## Context

Worktree paths are often long, visually truncated, and inconvenient to reproduce
by hand. The worktree picker already identifies the exact Git-recorded sibling, so
its row menu is the natural place for a path action.

Copying a renderer-provided path directly would broaden the renderer's clipboard
authority and allow stale UI data to win asynchronous races. Resolving the opaque
IDs again in the main process preserves the existing trust boundary.

## Consequences

Positive:

- Desktop users can copy an exact worktree path without selecting that worktree.
- Worktree and file-row menus share one interaction and accessibility pattern.
- The main process remains authoritative for filesystem paths and clipboard-write
  ordering.

Negative:

- Copying a path requires a fresh Git worktree listing.
- The shared menu must keep dismissal shielding and focus behavior covered by
  interaction tests.
