# Decision 0007: V0 Diff Scope

## Status

Accepted

## Decision

V0 supports both:

- working tree review against `HEAD`
- branch review against a project-configured base branch

Commit range review is deferred until after v0.

## Context

The main workflow is reviewing local changes before committing or pushing. Sometimes an agent or developer may already have committed changes, so branch review is needed early.

Commit range review is useful but adds UI and Git edge cases that are not required for the first useful version.

## Consequences

Positive:

- Covers the primary real workflows.
- Keeps the app useful when the working tree is clean but the branch has commits.
- Keeps arbitrary commit selection out of v0.

Negative:

- Slightly larger v0 than working-tree-only.
- Requires base branch configuration from the start.
