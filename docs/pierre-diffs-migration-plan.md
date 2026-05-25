# Diffs Migration Evaluation

## Status

Superseded and implemented.

The Diffs / `@pierre/diffs` renderer migration is now accepted by
[Decision 0024](decisions/0024-diffs-rendering-engine.md), superseding the
rollback described in [Decision 0023](decisions/0023-pierre-diffs-rendering-engine.md).

## Outcome

The custom text diff renderer has been replaced with `@pierre/diffs` in the
desktop renderer.

The earlier rollback happened because the attempted migration created more
performance and reliability risk than it removed:

- opening and restoring repositories became easier to block on expensive diff
  work
- switching between repository tabs could freeze the renderer
- selecting large diffs still had synchronous parsing/rendering cost before the
  UI became usable
- keeping tabs responsive required extra caches, background refresh rules, and
  stale-summary behavior
- the app needs multiple repositories open at once, but only the active review
  surface should be expensive

The accepted implementation keeps the earlier performance safeguards instead of
mounting rich diff viewers for inactive repositories.

## Current Direction

Use Diffs with Difftray's existing performance boundary:

- `apps/desktop/src/renderer/diffs-renderer.ts` adapts Git-derived patches and
  old/new snapshots into Diffs metadata.
- `packages/git` continues to load canonical patch text plus bounded text
  snapshots where needed for context expansion.
- Review hashes remain based on Git-derived payloads, not renderer output.
- Selected file content still loads lazily.
- Inactive tabs do not mount hidden diff viewers.

## Performance Criteria

Keep the implementation accountable to the original migration criteria:

- first repository open remains responsive
- opening a second repository does not block or crash the existing workspace
- switching between already-open repositories is effectively instant from the
  user's perspective
- large selected diffs do not block the renderer thread
- memory stays bounded with several repositories open
- inactive tabs do not mount hidden diff viewers or run background rich
  rendering
- visual behavior matches the expected split/unified renderer, including context
  expansion, generated-file filtering, stale review state, and review actions
