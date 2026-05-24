# Testing Strategy

Difftray should be developed with hard TDD for core behavior.

The most important rule: review state must never lie.

## Test Pyramid

### Unit Tests

Primary target for core logic.

Cover:

- review target identity
- diff hash stability
- diff hash invalidation
- branch review identity using merge-base
- reviewed state restoration when a hash returns
- progress calculation
- generated-file filtering
- status normalization
- rename handling
- binary fingerprinting
- stale mark-reviewed rejection

### Integration Tests

Use temporary Git repositories to verify real Git behavior.

Cover:

- modified files
- added files
- untracked files
- deleted files
- renamed files
- working tree diffs
- staged-only tracked changes
- unstaged-only tracked changes
- mixed staged and unstaged changes in the same file
- branch diffs against base
- branch review uses merge-base
- base ref movement changes review target identity
- worktree detection
- base branch missing
- untracked binary files
- binary file invalidation
- mode-only changes
- symlinks
- submodules
- case-only renames
- paths with spaces and unicode

### Storage Tests

Use temporary SQLite databases.

Cover:

- migrations
- project persistence
- review target lookup
- review mark creation
- review state lookup
- settings persistence

### Renderer Tests

Cover UI state transitions without launching the full app where possible.

Cover:

- file selection
- checkbox behavior
- reviewed file collapse
- next unreviewed selection
- project switching from tabs and the command palette
- command palette opening, keyboard navigation, file search, and selection
- file-list collapse/expand shortcut

### Main Process And IPC Tests

Cover security-sensitive service boundaries.

Cover:

- renderer-facing API does not expose raw shell execution
- editor launch config expands only supported tokens
- editor launch uses command and args rather than shell strings
- editor launch validates project-contained paths
- mark-reviewed rejects stale displayed hashes
- preload project-change subscriptions return an unsubscribe function
- renderer-facing watcher events are typed and validated

### Project Watch Tests

Cover live-monitoring behavior without depending on real filesystem timing where
possible.

Unit tests should cover:

- raw watcher events debounce into a single project-change notification
- worktree and Git metadata reasons coalesce in one debounced notification
- separate projects have independent debounce timers
- sequence numbers increase monotonically per project
- a maximum wait prevents continuous file churn from starving notifications
- watcher errors emit bounded status events without crashing the service
- watcher restart backoff is bounded and does not spin
- noisy dependency, build, and cache paths are ignored
- selected Git metadata paths are not ignored
- symlink traversal is disabled

Main-process service tests should use a fake watcher adapter and cover:

- a watcher starts for each opened project
- duplicate starts for the same project do not create duplicate watchers
- changing a project path restarts that project's watcher
- closing or removing a project closes its watcher
- app shutdown closes all active watchers
- project deletion or missing repository state stops the watcher after refresh
- linked worktree Git directories are resolved from Git metadata, not `.git`
  directory assumptions

Chokidar adapter tests should stay narrow and cover:

- configured options are conservative: `ignoreInitial`, `followSymlinks`,
  `atomic`, `ignorePermissionErrors`, and non-polling defaults
- adapter close awaits the underlying watcher close operation
- raw `add`, `change`, `unlink`, `addDir`, and `unlinkDir` events are normalized
  into project events

Renderer tests should cover:

- active-project watcher events call the existing workspace reload path
- file selection is preserved after watcher refresh when possible
- a missing selected file moves selection to a deterministic next file
- inactive-project watcher events refresh summaries without switching projects
- watcher events received while settings or the command palette are open are queued
  or applied without interrupting the overlay
- subscription cleanup prevents duplicate refreshes after remount

### App Workflow Tests

Use Playwright or Electron-compatible app testing.

Cover:

- open project
- review a file
- modify the file externally
- verify the file becomes unreviewed
- verify the file becomes unreviewed while the app stays focused and no synthetic
  focus event is dispatched
- modify an inactive project and verify its tab or summary updates without
  switching projects
- switch projects
- restart app and verify persisted state

### Visual Verification

For UI-facing changes, the agent should launch the app locally once it is runnable and verify the affected workflow visually before handoff.

Visual verification should include:

- opening the app
- navigating to the changed surface
- exercising the relevant interaction
- capturing or inspecting screenshots
- checking that the UI is not blank, clipped, overlapped, unreadable, or obviously broken

Viewport/window coverage should match the change. For broad layout changes, check at least:

- compact window
- normal desktop window
- wide desktop window

Visual verification does not replace unit or workflow tests. It catches rendering and layout failures that tests often miss.

## TDD Workflow

For core behavior:

1. Write a failing test that describes the behavior.
2. Implement the smallest code path that passes it.
3. Refactor while keeping tests green.
4. Add edge-case tests before expanding the behavior.

## Golden Test Cases

These tests are mandatory before v0 is considered credible:

- A reviewed file becomes unreviewed after its diff changes.
- A reviewed file becomes reviewed again when its diff hash returns.
- Changing base branch scopes review state separately.
- Branch review uses merge-base, not a naive two-dot range.
- Working tree review includes staged, unstaged, mixed, deleted, renamed, and untracked files.
- Marking reviewed rejects a stale displayed diff hash.
- Binary file changes invalidate review state.
- Mode-only changes are reviewable.
- Symlink target changes are reviewable.
- Submodule pointer changes are reviewable.
- External editor launch is tokenized and not shell-executed.
- Hidden generated files do not count toward progress.
- Untracked files appear and can be reviewed.
- Deleted files appear and can be reviewed.
- Renamed files show previous and current path.
- A pure rename requires review once and remains reviewed only while the exact rename diff remains current.
- Worktrees can be opened as separate projects.
- External file changes invalidate review state without requiring window focus.
- Inactive projects receive live-monitoring updates without stealing focus.
- Watcher failure leaves manual and focus-driven refresh available.
- UI-facing changes are launched and visually checked before handoff.

## Full Gate

The root `./ci.sh` script is the full local CI gate. It runs:

- format check
- lint
- typecheck
- unit tests
- integration tests
- app workflow tests where feasible
- visual verification for UI-facing changes

`pnpm check` delegates to `./ci.sh`.

No commit or handoff should happen without running `./ci.sh`.
