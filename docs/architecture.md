# Architecture

## Goals

- Keep core review behavior independent from Electron.
- Make Git and filesystem behavior testable.
- Keep UI state separate from persisted review state.
- Allow future CLI or non-Electron surfaces if useful.

## Proposed Monorepo Shape

Use pnpm workspaces.

```text
apps/
  desktop/
    electron main process
    React renderer
    IPC adapters

packages/
  core/
    Git status normalization
    diff target modeling
    diff hashing
    review invalidation
    generated-file detection

  storage/
    SQLite schema
    migrations
    repositories

  git/
    Git CLI adapter
    parsing
    worktree detection

  ui/
    shared React components, if useful
```

This split should stay pragmatic. Start with fewer packages if scaffolding overhead slows down v0, but keep the boundaries in code.

Do not add Turborepo, Nx, or another monorepo task runner in v0. pnpm workspaces plus package scripts are enough until build orchestration becomes painful.

## Process Boundaries

Electron main process:

- filesystem access
- Git command execution
- project file watching
- SQLite access
- external editor launch
- installed editor preset discovery and app icon lookup

Renderer process:

- project sidebar
- file list
- diff viewer
- keyboard navigation
- settings UI

IPC boundary:

- typed request/response contracts
- installed editor preset responses are read-only app metadata, while saved editor
  preferences remain structured launch configs
- no raw shell command execution from renderer
- no direct database access from renderer
- context isolation enabled
- Node integration disabled in the renderer
- narrow typed preload API

## Core Concepts

### Project

A local Git repo or worktree opened by the user.

### Review Target

The comparison context for review state.

Examples:

- working tree compared to `HEAD`
- current branch compared to `origin/main`
- future: commit range `A..B`

Review state is scoped to a review target.

### File Diff

Normalized representation of a single changed file in a review target.

Includes:

- current path
- previous path for renames
- status
- patch text or structured diff
- optional old/new text snapshots for expandable unchanged context
- binary flag
- generated flag
- diff hash

### Review Mark

Persisted record that a file's diff hash was reviewed for a review target.

## Git Strategy

Use the Git CLI initially instead of a JS Git implementation.

Reasons:

- Git already handles worktrees, renames, deletions, and untracked state.
- CLI behavior matches developer expectations.
- It avoids reimplementing Git semantics.

Core commands will likely include:

- `git status --porcelain=v2`
- `git diff --patch --find-renames`
- `git diff --patch --find-renames HEAD`
- `git diff --name-status --find-renames`
- `git show <ref>:<path>` for committed text snapshots used by expandable context
- `git ls-files --others --exclude-standard`
- `git rev-parse`
- `git merge-base`
- `git worktree list --porcelain`

Use NUL-delimited Git output where possible for paths.

Branch review compares `git merge-base <base-ref> HEAD` to `HEAD`.

Working tree review compares the effective working tree to `HEAD` and includes staged, unstaged, mixed, deleted, renamed, and untracked files. Untracked files require synthesized added-file diffs or file snapshots.

## Watching Strategy

Use Chokidar from the Electron main process to monitor opened projects. The renderer
subscribes to typed project-change notifications through preload, but it does not
watch files or read Git metadata directly.

The watcher is a freshness signal, not the source of truth. Raw filesystem events
debounce into project-change notifications. The renderer then asks the existing
main-process project loader for current Git state, review state, and progress. The
app should not recompute large diffs on every filesystem event.

Watch each opened project, including inactive projects, so project tabs and
summaries can become stale-aware without requiring focus changes. Keep manual and
focus-driven refresh as fallbacks when filesystem events are missed or the watcher
reports an error.

Per project, watch:

- the worktree root
- resolved Git metadata paths such as `HEAD`, `index`, `refs`, `packed-refs`, and
  merge/rebase/cherry-pick marker files
- linked-worktree Git directories resolved from Git instead of assuming `.git` is a
  directory

Use conservative Chokidar options:

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

The watcher should ignore high-noise paths:

- `node_modules`
- build outputs such as `build`, `dist`, and `out`
- common cache directories such as `.cache`, `.turbo`, `.next`, and `.gradle`
- recursive symlink traversal

The ignore list must not affect Git's source of truth for changed files. It only
reduces watcher noise. Polling should remain off by default and only become an
explicit setting if native filesystem events prove unreliable for a user.

## Diff Rendering

The current renderer uses a small React diff viewer backed by the core
`parseDiffSegments` parser. Keep parsing and context-expansion behavior in
`packages/core` so renderer components stay mostly presentational.

Do not keep unused diff-rendering dependencies in the release build.
`@pierre/diffs` was evaluated and rejected in
[Decision 0023](decisions/0023-pierre-diffs-rendering-engine.md) after the
attempted migration created more tab-switching and large-diff performance risk
than benefit. It should not be a runtime dependency unless a future measured ADR
supersedes that decision.

## Styling Architecture

Use CSS Modules for component-local styles and CSS custom properties for app-wide tokens.

Use Radix UI primitives for accessible overlays and controls when native elements are not enough.

Use lucide-react icons for action buttons and status indicators where an icon improves scan speed.

Avoid adopting a broad component kit in v0. Difftray needs a distinctive review workspace, not a generic dashboard skin.

## Failure Modes

The UI should handle:

- project path missing
- project no longer a Git repo
- Git command failure
- base branch missing
- branch changed while reviewing
- file changed while open
- huge diff fallback
- binary file diff
- stale displayed diff hash when marking reviewed
- path quoting, spaces, and unicode
- symlinks
- submodules
- mode-only changes

## Mark-Reviewed Flow

Marking a file reviewed is a main-process verified operation:

1. Renderer sends project id, review target id, file path, and displayed diff hash.
2. Main process recomputes or reloads the current file diff hash.
3. If hashes match, storage writes the review mark.
4. If hashes differ, storage is not changed and the renderer refreshes.

## Performance Notes

Large monorepos are not v0's primary target, but obvious traps should be avoided:

- debounce watcher events
- compute per-file diff hashes lazily where possible
- virtualize large file lists
- rely on diff viewer virtualization
- avoid loading all huge diffs at once
- use per-file large-diff fallback above 2 MB of patch text or text snapshot
  payload, with bounded Git output buffers for aggregate metadata
