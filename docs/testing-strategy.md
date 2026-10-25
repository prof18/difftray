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
- focus-triggered refresh runs silently, ignores stale completions, and preserves
  loaded patch content when the refreshed diff hash is unchanged
- cached tab switches apply the cached workspace immediately, then run the same
  guarded silent refresh as focus refresh
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

### Performance Benchmarks

Run `pnpm bench:performance` before and after changes that can affect large-repo
or large-diff behavior.

The benchmark gate applies to changes touching:

- workspace loading, refresh, or project switching
- file selection, mark/unmark reviewed, review comments, or keyboard navigation
- Git diff loading, diff summaries, diff hashes, or review-state resolution
- renderer diff parsing/rendering, file-list rendering, or scroll restoration
- packaging/bundle changes that can affect renderer payload size

Keep benchmark outputs for the before and after runs and compare the relevant
metrics before keeping an optimization. If a change makes one measured path
worse but is still worth shipping, call out the product tradeoff explicitly in
the handoff or decision note.

Small isolated copy, styling, docs, or test-only changes do not require the
performance benchmark unless they plausibly affect one of the surfaces above.

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
- bounded bundled CLI process acceptance after visual verification, using
  `pnpm --filter @difftray/desktop test:cli:e2e --skip-build`

`pnpm check` delegates to `./ci.sh`.

`pnpm test:visual` launches the Electron window with
`DIFFTRAY_WINDOW_PRESENTATION=inactive` by default, so the smoke test can render
and capture screenshots without activating the app or stealing focus from the
current workspace. Set `DIFFTRAY_WINDOW_PRESENTATION=active` when debugging a
visual test and intentionally interacting with the app window.

The review, changed-after-review and phone companion screens are also captured
in dark mode (`*-dark.png`), and the changed-after-review screen at the 900px minimum
window width (`*-narrow.png`). The dark captures switch the app chrome by setting the
root `data-theme` and then restore it. The diff canvas keeps its light syntax
theme in those images, so use them to check app chrome, not code colours.

No commit or handoff should happen without running `./ci.sh`.

Repository drop tests cover unmatched connected drag targets and cancellation.
The Electron visual smoke also checks that moving between targets keeps the
overlay visible, leaving the window clears it, and Escape, blur, drag end and
resumed mouse movement dismiss stale hover state.

`pnpm bench:performance` is a conditional gate, not part of `./ci.sh`. Run it
for performance-sensitive work as described above.

## Code range comments

Run `pnpm --filter @difftray/companion-diff-surface test:browser` for mounted
Pierre mouse and touch behavior. Touch cases use a touch-capable browser and CDP
touch events, including scrolling from the gutter; programmatic callback calls
are insufficient evidence. The local harness includes a mixed range fixture, a
5,000-line fixture and an explicit independent second surface.

Run `pnpm test:visual` for desktop reverse drag, no composer before release,
typed-body preservation when changing endpoints, and range save/export. Use an
isolated development profile for manual checks. Compare `pnpm bench:performance`
before and after surface changes. Check both themes and narrow/wide viewports;
confirm that the bottom action bar leaves the final line reachable.

Native WebView runs should confirm immediate single-tap commenting, no keyboard
on hold, scrolling while selecting, confirm/cancel and saved-comment editing.
Browser tests prove internal gesture behavior; native layout trees alone do not.

## Local agent process acceptance

The CLI harness uses an unsigned temporary fixture bundle, isolated profiles,
temporary Git repositories, and real Electron processes. `--skip-build` reuses
the outputs built earlier in `./ci.sh`; `--app PATH` reuses an explicitly supplied
fixture bundle. A global ten-minute deadline bounds the acceptance matrix.
Cleanup inspects the exact fixture executable and owned profile identity before
terminating processes, and removes only fixture state.

The read matrix covers branch/commit/working-tree selection, explicit context
reads, pagination and exports. The write matrix covers single lines, inclusive
ranges on either side, file and overall findings, concurrent reviewers, note
conflicts, lost-response retries, restart and expired-context receipt replay.
The invalidation matrix exercises Git and context freshness failures. The
compatibility matrix starts the fixture's actual companion through preload,
pairs fresh ephemeral keys and compares encrypted responses with and without
the attribution capability. Legacy responses recursively omit attribution and
note-version fields; current responses preserve all four scopes' attribution.

Clock/SQL fixture manipulation for deterministic expiry and corruption tests is
confined to owned test data. It does not add SQL or clock controls to the agent
protocol. The strict wire `hello` shape is tested separately from `doctor`'s
CLI-only diagnostics. Successful stdout remains a single JSON envelope, or exact
prompt text for a prompt export, without tokens or startup diagnostics.

Run the heavier `pnpm --filter @difftray/desktop test:cli:bundle` separately before
handoff to validate archive distribution without Node on PATH. Copied agent
package/resolver tests do not establish actual host-session compatibility.
M6's final acceptance and handoff are pending. Actual agent hosts, signed arm64
and x64 archives, and publication remain user checks.

The latest recorded M5 performance run versus baseline measured workspace loading
at 2,050 versus 1,879 ms, selected-file loading at 2,116 versus 2,549 ms, and
comment operations at 125 versus 218 ms. Reviewed overrides remained zero; the
1,000-open-project benchmark measured 3.01 ms. No benchmark threshold was
weakened. These M5 measurements do not establish a completed M6 gate.
