# Decision 0014: Desktop Review Workflow

## Status

Accepted

## Decision

The v0 desktop app opens local repositories through the native directory picker, stores opened repositories as recent projects, and loads working-tree review data through the main process.

The renderer talks to a narrow preload API for project listing, project open/load, refresh, and marking a displayed file reviewed. The renderer does not read Git, SQLite, or the filesystem directly.

Review marking is verified in the main process by reloading the current working-tree diff and comparing the displayed diff hash with the current diff hash before persisting the mark.

## Context

Difftray's product-critical behavior is review invalidation. The UI needs to feel immediate, but review marks must not be written from stale renderer state after files change on disk.

Keeping Git and storage in the main process preserves Electron security defaults and gives one place to enforce stale-diff checks.

## Consequences

Positive:

- Renderer-originated data is treated as untrusted command input.
- Stale review marks are rejected before persistence.
- Recent-project state and review marks share one storage boundary.
- The first UI can support real local review without adding network or PR concepts.

Negative:

- The first workflow is working-tree only until branch review controls are added.
- Refresh is explicit for now; file watching remains a later main-process service.
