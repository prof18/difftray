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

Deliverables:

- typed IPC contracts
- project open service
- project refresh service
- file watch service
- external editor service
- settings service
- locked-down Electron window config
- typed preload API

Acceptance:

- renderer never executes raw shell commands
- renderer never reads SQLite directly
- renderer has no Node integration
- custom editor launch uses command + args, not shell strings

## Slice 6: First UI

Goal: make the app usable for one project.

Deliverables:

- project open flow
- project sidebar shell
- file list
- file selection
- side-by-side diff viewer adapter
- review checkbox
- progress display

Acceptance:

- user can open a repo, review a file, and see progress update
- app workflow can be launched and visually verified with screenshots

## Slice 7: Multi-Project Review

Goal: support the actual target workflow.

Deliverables:

- multiple opened projects
- recent projects
- live monitoring for all projects
- project-specific base branch
- project switching shortcuts

Acceptance:

- two repos can be monitored in one window
- changed files in one repo do not affect review state in another

## Slice 8: Keyboard And Review Flow

Goal: make review fast.

Deliverables:

- `j` / `k` navigation
- `Enter` open selected file
- `Space` mark reviewed
- `u` toggle reviewed
- `o` open in editor
- `f` focus filter
- collapse-on-review
- advance to next unreviewed file

Acceptance:

- a review session can be completed without mouse interaction after opening the project

## Slice 9: V0 Polish

Goal: make the app credible for daily use.

Deliverables:

- generated-file hiding
- exact generated-file fixture list before implementing generated-file hiding
- large diff fallback
- binary file fallback
- settings screen
- editor command templates
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
