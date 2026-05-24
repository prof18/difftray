# Decision 0022: Project Watch Service

## Status

Accepted

## Decision

Difftray will add a main-process project watch service for live monitoring of opened
repositories. The watcher is a freshness signal only: it emits debounced project
change notifications, and the existing main-process project refresh path remains
the source of truth for Git state, diff hashes, progress, and review invalidation.

The renderer will subscribe through a narrow typed preload API. It will not watch
files, read Git metadata, or read project files directly.

The watcher will monitor opened projects, including inactive projects, so tab
summaries and review state can become stale-aware without requiring window focus.
The existing manual and focus-driven refresh behavior remains as a backstop.

## Context

Difftray currently refreshes when the renderer asks for a project load and when the
window regains focus. That catches many local changes, but it does not provide the
"live monitoring for all projects" behavior expected by the product plan.

Chokidar is already available in the desktop app dependency tree. It should be used
from Electron main only, behind a small service boundary that can be tested with a
fake watcher adapter.

Watching local repositories has sharp edges:

- large monorepos can generate high event volume
- package installs and builds touch many ignored files
- Git metadata differs between normal repositories and linked worktrees
- editors may save through atomic rename operations
- network filesystems may require polling, which is too expensive as a default
- watcher failures must not make review state unsafe

## Production Shape

The main process owns a `ProjectWatchService` that starts one watcher per opened
project and stops it when the project is closed or removed.

Each project watcher observes:

- the worktree root
- resolved Git metadata paths, including `HEAD`, `index`, `refs`, `packed-refs`,
  and merge/rebase/cherry-pick marker files
- linked-worktree Git directories resolved from Git, not from `.git` path
  assumptions

The watcher ignores noisy or high-volume paths such as:

- `node_modules`
- common build output directories
- common cache directories
- recursive symlink targets

Ignored watcher paths only reduce event noise. They must never change Git's source
of truth for loaded file diffs.

Recommended Chokidar defaults:

```ts
{
  ignoreInitial: true,
  persistent: true,
  followSymlinks: false,
  atomic: true,
  awaitWriteFinish: false,
  ignorePermissionErrors: true,
  usePolling: false
}
```

Polling can be added later as an explicit setting for network filesystems or other
environments where native filesystem events are unreliable.

Raw filesystem events are debounced per project. The debounced event coalesces
reasons such as `worktree`, `git_metadata`, `deleted`, and `watcher_error`, then
emits a typed project-change event with a monotonically increasing sequence.

The renderer reacts to project-change events by asking the existing main-process
loader for current project state. Active-project refreshes should preserve file
selection when possible. Inactive-project events should refresh summaries without
stealing focus or changing the selected project.

## Consequences

Positive:

- Difftray can invalidate review state while the app remains focused.
- Inactive project tabs can become stale-aware without manual switching.
- Git and filesystem access stay behind Electron main-process boundaries.
- Existing stale-hash verification remains the safety mechanism for review marks.
- The watcher service can be tested independently from real Chokidar.

Negative:

- The app will hold filesystem watchers for opened projects.
- Large repositories can still produce noisy event streams even with ignores.
- Linked worktrees and Git metadata require careful path resolution.
- Native watcher behavior can differ across filesystems, so focus/manual refresh
  must remain available.
