# Architecture

## Goals

- Keep core review behavior independent from Electron.
- Make Git and filesystem behavior testable.
- Keep UI state separate from persisted review state.
- Allow future CLI or non-Electron surfaces if useful.

## Proposed Monorepo Shape

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

## Process Boundaries

Electron main process:

- filesystem access
- Git command execution
- project file watching
- SQLite access
- external editor launch

Renderer process:

- project sidebar
- file list
- diff viewer
- keyboard navigation
- settings UI

IPC boundary:

- typed request/response contracts
- no raw shell command execution from renderer
- no direct database access from renderer

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
- `git diff --name-status --find-renames`
- `git ls-files --others --exclude-standard`
- `git rev-parse`
- `git worktree list --porcelain`

## Watching Strategy

Use Chokidar to monitor opened projects.

Events should debounce into a project refresh. The app should not recompute large diffs on every filesystem event.

The watcher should ignore:

- `.git` internals where safe
- `node_modules`
- build outputs
- common cache directories

The ignore list must not affect Git's source of truth for changed files. It only reduces watcher noise.

## Diff Rendering

Use `@pierre/diffs` for rendering.

The app should keep a small adapter layer around the library so future API churn does not infect the rest of the codebase.

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

## Performance Notes

Large monorepos are not v0's primary target, but obvious traps should be avoided:

- debounce watcher events
- compute per-file diff hashes lazily where possible
- virtualize large file lists
- rely on diff viewer virtualization
- avoid loading all huge diffs at once
