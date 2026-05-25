# Diffs Migration Evaluation

## Status

Archived. Do not implement this migration.

The Diffs / `@pierre/diffs` renderer migration was evaluated and rolled back on
2026-05-25. Difftray keeps the current custom renderer backed by
`parseDiffSegments` for now.

See [Decision 0023](decisions/0023-pierre-diffs-rendering-engine.md).

## Outcome

Do not replace the custom text diff renderer with `@pierre/diffs` in the current
product.

The attempted migration created more performance and reliability risk than it
removed:

- opening and restoring repositories became easier to block on expensive diff
  work
- switching between repository tabs could freeze the renderer
- selecting large diffs still had synchronous parsing/rendering cost before the
  UI became usable
- keeping tabs responsive required extra caches, background refresh rules, and
  stale-summary behavior
- the app needs multiple repositories open at once, but only the active review
  surface should be expensive

The current custom renderer is not perfect, but it is known to work with the
existing multi-repository model and keeps the performance behavior easier to
reason about.

## Current Direction

Keep the local renderer:

- `packages/core/src/diff-context.ts` owns patch parsing and collapsed context
  segmentation.
- `apps/desktop/src/renderer/App.tsx` owns the split/unified React renderer and
  syntax highlighting setup.
- `packages/git` continues to load canonical patch text plus bounded text
  snapshots where needed for context expansion.
- Review hashes remain based on Git-derived payloads, not renderer output.

Do not add `@pierre/diffs` as a runtime dependency, worker dependency, or hidden
inactive-tab renderer.

## Reconsideration Criteria

Reopen this only with a new measured spike that proves all of the following:

- first repository open remains responsive
- opening a second repository does not block or crash the existing workspace
- switching between already-open repositories is effectively instant from the
  user's perspective
- large selected diffs do not block the renderer thread
- memory stays bounded with several repositories open
- inactive tabs do not mount hidden diff viewers or run background rich
  rendering
- visual behavior matches the current split/unified renderer, including context
  expansion, generated-file filtering, stale review state, and review actions

Until then, performance work should optimize the existing custom renderer and
Git loading path rather than replacing the renderer library.
