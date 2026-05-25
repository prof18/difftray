# Decision 0018: App-Level Review Settings

## Status

Accepted

## Date

2026-05-24

## Decision

Store review and editor preferences at the app level in `app_settings`:

- default diff mode
- generated-file visibility
- whitespace-only change visibility
- auto-collapse hunk threshold
- drift notification preference
- selected re-review trigger
- diff line wrapping preference
- editor launch configuration

Keep only repository-local workspace layout in `project_settings`: file-list width
and collapsed state.

For the first visible settings surface, expose only the review options that are
implemented end to end:

- default diff mode
- diff line wrapping preference
- generated-file visibility
- drift notification preference

Keep the other app-level review fields persisted for compatibility and future use,
but do not show controls for behavior that is not active yet.

Because the first visible settings surface is small, show all settings in one dialog
with General, Editor, and Review sections instead of using separate tabs.

For existing databases, if no app-level review settings have been saved yet,
Difftray reads the most recently updated legacy `project_settings` row as the
runtime fallback. Once the user saves settings, app-level values become the source of
truth.

## Context

The first settings iteration should be predictable across repositories. A user who
sets review behavior in one repo expects the next repo to start with the same review
defaults, rather than silently returning to built-in defaults or requiring a
repository inheritance model.

Repository-specific review defaults may still be useful later, but they require more
product surface: explicit overrides, reset behavior, and clear copy. That is not
needed for the first iteration.

## Consequences

Positive:

- Settings behavior is simpler to explain: review/editor preferences are app-wide.
- New repositories inherit the user's chosen defaults automatically.
- The legacy fallback preserves existing saved review preferences without adding a
  migration step.

Negative:

- Users cannot tune generated-file visibility or diff mode per repository yet.
- The `project_settings` table retains legacy review columns until a later cleanup
  migration.
