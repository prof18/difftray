# Decision 0023: Do Not Adopt Pierre Diffs Rendering Engine

## Status

Rejected

## Decision

Do not adopt `@pierre/diffs` as Difftray's primary text diff renderer for the
current product.

Difftray will keep the bespoke text diff renderer:

- `packages/core` owns patch parsing and collapsed context segmentation through
  `parseDiffSegments`.
- `apps/desktop` owns the current split/unified React rendering and syntax
  highlighting.
- `packages/git` continues to provide canonical patch text and bounded old/new
  text snapshots where the renderer needs them.

`@pierre/diffs` must not be added as a production dependency, worker dependency,
or hidden inactive-tab renderer unless a new ADR supersedes this decision with
measured evidence.

## Context

The migration was originally proposed to reduce custom diff parsing, layout,
highlighting, and virtualization code. A branch attempt showed that the library
integration did not improve the product enough to justify the added runtime
cost and complexity.

The app's core workflow depends on keeping multiple repositories open and moving
between repository tabs quickly. The attempted migration made that path harder
to keep responsive:

- repository tab switches could still block on expensive diff loading or rich
  rendering work
- large selected diffs still had synchronous parser/render cost before workers
  could help
- making tab switches feel acceptable required extra caches, background refresh
  behavior, and stale inactive summaries
- the app became harder to reason about when only one active repository should
  own expensive review state

The current custom renderer has known maintenance cost, but it matches the
existing multi-repository model and has already been verified with the app's
review workflow.

## Consequences

Positive:

- Avoids introducing a third-party renderer dependency that currently regresses
  the most important interaction path.
- Keeps repository switching and review state behavior simpler.
- Preserves existing expandable context behavior and old/new snapshot handling.
- Keeps Electron worker and content-security-policy complexity out of the
  renderer for now.

Negative:

- Difftray still owns custom patch parsing, hunk layout, split/unified rendering,
  and syntax highlighting glue.
- Future annotation, selection, and virtualization improvements must be built or
  separately evaluated.
- The custom renderer needs continued performance discipline for large diffs.

## Reconsideration

This decision can be superseded only after a new spike proves, with realistic
repositories, that a replacement renderer:

- keeps first open, second open, tab switching, and large diff selection
  responsive
- does not require hidden viewers for inactive repositories
- keeps memory bounded with several repositories open
- preserves review identity, invalidation, generated-file filtering, context
  expansion, and visual parity
- passes the full local gate and visual smoke tests

Until then, optimize the current renderer and Git loading path instead of
planning another `@pierre/diffs` migration.
