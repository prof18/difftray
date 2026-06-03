# Decision 0029: Tested Desktop Module Extraction

## Status

Accepted.

## Context

The desktop app grew large while v0 behavior was being proven. In particular,
the renderer app component and Electron main entrypoint accumulated unrelated
responsibilities. Large files are not automatically wrong, but they make
Difftray's review-state behavior harder to change safely when UI workflow,
project loading, command palette, settings, and review comments share the same
module scope.

The existing quality gate is strong, but extraction is safest when the extracted
behavior is covered before it moves.

## Decision

Split desktop behavior incrementally by extracting deterministic logic into
focused modules with direct tests before or alongside each extraction. Avoid
moving behavior just to chase line counts. Each extraction should create a
clearer change boundary, reduce duplicated logic, or make future product work
safer.

For the renderer, prefer modules for:

- command palette filtering and grouping
- workspace load and tab status formatting
- review workspace view-model helpers
- review comment annotations, ordering, and pending-save matching
- later: workflow hooks and component/CSS modules

For the Electron main process, prefer later modules for:

- IPC registration and input parsing
- project workspace orchestration
- review actions and comment actions
- editor discovery and icon lookup
- view-model mapping

## Consequences

Positive:

- Refactors get small, direct tests instead of relying only on full app flows.
- Future UI work can import stable helpers instead of editing one large file.
- The architecture document's package-level boundaries are reflected inside the
  desktop app as well.

Negative:

- Some short-term churn is needed before visible product work.
- Not every extraction is valuable; component-only moves still need judgment.
