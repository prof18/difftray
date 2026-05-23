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
- project switching
- filter focus

### Main Process And IPC Tests

Cover security-sensitive service boundaries.

Cover:

- renderer-facing API does not expose raw shell execution
- editor launch config expands only supported tokens
- editor launch uses command and args rather than shell strings
- editor launch validates project-contained paths
- mark-reviewed rejects stale displayed hashes

### App Workflow Tests

Use Playwright or Electron-compatible app testing.

Cover:

- open project
- review a file
- modify the file externally
- verify the file becomes unreviewed
- switch projects
- restart app and verify persisted state

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

## Full Gate

The eventual `pnpm check` command should run:

- format check
- lint
- typecheck
- unit tests
- integration tests
- app workflow tests where feasible

No handoff should happen without running the full gate once it exists.
