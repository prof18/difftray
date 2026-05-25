# Implementation Plan

This plan turns the v0 scope into implementation slices. Each slice should be test-first where practical.

## Slice 1: Workspace Scaffold

Goal: create the minimal repo structure and quality gate.

Deliverables:

- pnpm workspace
- Electron + React + TypeScript + Vite desktop app
- `packages/core`
- `packages/git`
- `packages/storage`
- strict TypeScript
- ESLint
- Prettier
- Vitest
- Playwright or equivalent Electron app automation
- root `./ci.sh`
- root `pnpm check`
- root `pnpm dev`
- root `pnpm test:visual`

Acceptance:

- `./ci.sh` runs locally
- the desktop app can be launched locally
- no app behavior yet
- no skipped quality gate

## Slice 2: Core Review Model

Goal: define review targets, file diffs, diff hashes, and progress without Electron.

Test-first cases:

- same file diff produces stable hash
- changed patch produces different hash
- same patch under different base target is different review state
- branch review identity includes merge-base and resolved SHAs
- paths are part of the diff hash
- binary fingerprints include real content identity
- symlink, submodule, and mode-only fingerprints are explicit
- hidden generated files do not count toward progress
- visible generated files count toward progress

Deliverables:

- review target identity
- file diff model
- diff hash function
- binary/content fingerprinting
- review state resolver
- progress calculator

Acceptance:

- core package has full unit coverage for review invariants

## Slice 3: Git Adapter

Goal: turn real Git repos into normalized file diffs.

Test-first cases use temporary Git repositories:

- modified file
- added file
- untracked file
- untracked binary file
- deleted file
- renamed file
- pure rename
- staged-only file
- unstaged-only file
- mixed staged and unstaged file
- mode-only file
- symlink target change
- submodule pointer change
- case-only rename
- path with spaces and unicode
- clean working tree
- branch diff against base
- branch diff uses merge-base
- missing base branch error

Deliverables:

- repo detection
- worktree detection
- working tree diff loader
- branch diff loader
- status normalization
- untracked-file diff synthesis

Acceptance:

- tests use real `git`
- no renderer or Electron dependency

## Slice 4: Storage

Goal: persist projects, review targets, settings, and review marks.

Test-first cases:

- create and retrieve project
- upsert review target
- mark diff hash reviewed
- file becomes reviewed when hash matches
- file is unreviewed when hash differs
- old reviewed hash works again when the diff returns
- stale displayed hash is rejected when marking reviewed

Deliverables:

- SQLite connection layer
- migrations
- repositories
- temp database tests

Acceptance:

- storage tests are deterministic and isolated

## Slice 5: Main Process Services

Goal: expose safe app services to the renderer.

Test-first cases:

- renderer-facing APIs do not expose raw shell execution
- editor launch config expands only supported tokens
- editor launch uses command and args rather than shell strings
- editor launch validates project-contained paths
- mark-reviewed rejects stale displayed hashes
- project watcher service starts one watcher per opened project
- project watcher service stops watchers when projects close or are removed
- project watcher service closes all watchers during app shutdown
- watcher events debounce per project
- watcher events coalesce worktree and Git metadata reasons
- watcher event sequences increase monotonically per project
- separate projects have independent debounce timers and sequences
- watcher ignore matcher excludes noisy dependency, build, and cache paths
- watcher ignore matcher does not hide selected Git metadata paths
- linked worktree Git metadata paths are resolved from Git
- watcher errors emit a bounded status event without crashing the app

Deliverables:

- typed IPC contracts
- project open service
- project refresh service
- project watch service
- Chokidar adapter isolated behind a testable watcher interface
- debounced project-change event coordinator
- preload subscription API with unsubscribe support
- external editor service
- settings service
- locked-down Electron window config
- typed preload API

Acceptance:

- renderer never executes raw shell commands
- renderer never reads SQLite directly
- renderer has no Node integration
- editor launch uses system default opening or built-in command/args presets, not
  shell strings
- live project-change notifications use the existing main-process refresh path as
  the source of truth
- watcher failure leaves manual and focus-driven refresh available

## Slice 6: First UI

Goal: make the app usable for one project.

Deliverables:

- project open flow
- project sidebar shell
- file list
- file selection
- Diffs-backed split/unified diff viewer adapter
- review checkbox
- progress display

Acceptance:

- user can open a repo, review a file, and see progress update
- app workflow can be launched and visually verified with screenshots

## Slice 7: Multi-Project Review

Goal: support the actual target workflow.

Test-first cases:

- active project reloads after an external file change while the window remains
  focused
- active project preserves selected file after a watcher-driven refresh when the
  file still exists
- active project selects a sensible next file when the selected file disappears
- inactive project summary refreshes after a watcher event without stealing focus
- closing a project unsubscribes renderer state from future watcher events
- deleting or moving a repository stops its watcher after the project is removed
- focus refresh still works when the watcher is unavailable or unhealthy

Deliverables:

- multiple opened projects
- recent projects
- live monitoring for all projects
- active-project watcher refresh
- inactive-project summary refresh
- watcher health/error surfacing
- project-specific base branch
- project switching shortcuts

Acceptance:

- two repos can be monitored in one window
- changed files in one repo do not affect review state in another
- external changes invalidate reviewed files without requiring window focus

## Slice 8: Keyboard And Review Flow

Goal: make review fast.

Deliverables:

- `j` / `k` navigation
- arrow key navigation
- `R` toggle reviewed
- `Cmd+O` open repository
- `Cmd+K` command palette
- `Cmd+P` file-only command palette
- `Cmd+1` collapse or expand file list
- palette arrow/enter/escape handling
- collapse-on-review
- advance to next unreviewed file

Acceptance:

- a review session can be completed without mouse interaction after opening the project
- project/file/action discovery is available from the command palette

## Slice 9: V0 Polish

Goal: make the app credible for daily use.

Deliverables:

- generated-file hiding
- exact generated-file fixture list before implementing generated-file hiding
- large diff fallback
- binary file fallback
- settings screen
- installed editor preset selection
- empty states
- error states
- app icon placeholder
- local macOS packaging

Acceptance:

- v0 scope is complete
- full local gate passes
- representative app windows/screens are visually verified

## Stop Conditions

Do not start line comments, PR integrations, agent integrations, or non-Git snapshot mode until v0 is usable and the review-state model has proven solid.
