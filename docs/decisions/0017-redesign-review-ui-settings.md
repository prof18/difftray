# Decision 0017: Redesign Review UI Settings

## Status

Accepted

Amended by [Decision 0018](0018-app-level-review-settings.md) for review and
editor preference ownership.

## Date

2026-05-23

## Decision

Implement the Difftray redesign as a top-tab review workspace: macOS titlebar,
project tab strip, resizable/collapsible file list, split/unified diff pane,
review settings window, command palette, empty state, and drift notification toast.

Project tabs show each listed repository's review progress and attention indicator,
not only the active repository. The active tab uses the loaded workspace state; other
tabs use recent-project review summaries computed in the main process. Every tab
renders a status dot and review counter, falling back to an empty summary if the
repository cannot be summarized. The renderer preserves the visible tab order across
recent-project refreshes and appends newly opened repositories at the end of the tab
strip, even though storage keeps recent projects ordered by last-opened time. Users
can drag tabs to reorder the visible tab strip.

The open-repository button follows the last tab when the tab strip has enough
horizontal space. When the tab strip overflows, it stays fixed at the trailing edge
with settings.

When the app window regains focus, the active workspace refreshes through the same
path as manual refresh so review invalidation and drift notifications react to
changes made while Difftray was inactive. Focus refresh is skipped while loading or
while transient UI such as settings or the command palette is open.

Persist review-workflow UI preferences. The initial ownership was
`project_settings`, but Decision 0018 moves review and editor preferences to
app-level settings. `project_settings` now keeps only repository-local layout:

- file-list width and collapsed state

App-level review preferences now include default diff mode, whitespace-only change
visibility, generated-file visibility, auto-collapse hunk threshold, drift
notifications, the selected re-review trigger, and editor launch configuration.

The renderer continues to consume real Git diff data through the preload API. Review
validity remains hash-based in core/storage; the redesign maps invalidated reviewed
files to the UI's Attention state instead of introducing a second review model.

## Context

The design handoff specifies interaction behavior that should survive app restarts,
especially panel sizing, collapse state, default diff mode, and review notification
behavior. File-list layout remains repository-local because path depth varies by
repo. Review and editor behavior is app-level for the first iteration so new repos
inherit the user's chosen defaults automatically.

## Consequences

Positive:

- The new UI can restore repository-local layout and app-level review defaults.
- The redesign uses the existing local-first Git and review-mark contracts.
- The command palette and keyboard model are implemented without adding a network or
  agent workflow.

Negative:

- The `project_settings` table keeps legacy review columns until a later cleanup
  migration.
- The re-review trigger controls still need maintainer confirmation because the
  design renders them as toggles while their semantics read as mutually exclusive.
