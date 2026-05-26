# Decision 0026: Diff Side Focus

## Status

Accepted

## Decision

Difftray adds a temporary diff side focus control to the desktop review toolbar
when the selected diff is in split view. Reviewers can switch the selected diff
between old-side, both-sides, and new-side viewing without changing the saved
default split/unified diff mode.

Old-side and new-side focus reuse the selected file's current diff metadata and
render the chosen side as a single-column diff surface. The review hash,
selected file, review target, and stored app settings remain unchanged.

Unified view always renders both sides in the unified stream and hides the side
focus controls.

Added and deleted files already render as single-side diffs, so the focus
control treats them as both-sides mode.

## Context

Side-by-side split view is the default review mode, but it makes reading the
complete new version of a changed file harder on narrower windows. Switching to
unified mode changes the shape of the diff instead of simply giving one side
more width.

The requested workflow is local reading, not editing or merge resolution.
Difftray should not introduce an IDE-like pane system or a merge tool concept
for this.

## Consequences

Positive:

- Reviewers can read the old or new side at full width while staying in the
  same file review flow.
- The control is reversible and does not persist accidental layout choices.
- Unified mode avoids irrelevant old/new side controls.
- Review invalidation remains tied to the original Git-derived diff payload.

Negative:

- Focused sides are a renderer presentation state, so automated visual coverage
  must keep checking both split and focused layouts.
