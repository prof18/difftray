# Decision 0002: Review State Is Scoped To Review Targets

## Status

Accepted

## Decision

Review state is scoped to a review target, not only to a project.

A review target is the combination of:

- project
- diff mode
- base identity
- head identity or working tree identity

Reviewed state is valid only when the current file diff hash matches a previously reviewed diff hash for the same review target.

## Context

The user wants to mark files reviewed, then automatically unmark them when they change.

Reviewing a file only makes sense relative to the comparison being reviewed. The same file contents may have different review meaning when compared against a different base branch.

## Consequences

Positive:

- Changing base branch does not accidentally reuse stale review state.
- Previous review state can return when switching back to an earlier base.
- The app can support working tree, branch, and commit range review consistently.

Negative:

- The data model is more complex than a simple per-project checkbox.
- The UI must explain why files appear unreviewed after changing base.

## Invariant

A file is reviewed if and only if:

- its current review target matches the stored review target
- its current diff hash matches a stored reviewed diff hash
