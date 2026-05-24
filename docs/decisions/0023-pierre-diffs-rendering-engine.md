# Decision 0023: Pierre Diffs Rendering Engine

## Status

Proposed

## Decision

Adopt `@pierre/diffs` as Difftray's primary text diff engine in the desktop
renderer.

Pierre owns renderer-side text diff parsing, hunk layout, split/unified
rendering, syntax highlighting, line annotations, selection, context expansion
where supported, and virtualization.

Difftray should not keep a bespoke patch parser or bespoke React hunk renderer
in the release build after the migration. Any remaining Difftray renderer code
around Pierre should be a thin adapter for product state, styling, commands, and
non-text placeholders.

Git collection and review correctness stay owned by Difftray:

- `packages/git` remains responsible for invoking Git, loading canonical patch
  text, loading optional old/new text snapshots, and classifying binary,
  symlink, submodule, mode-only, generated, and oversized changes.
- `packages/core` remains responsible for review targets, diff hashes, progress,
  generated-file detection, and review invalidation.
- Review hashes continue to use Difftray's canonical Git-derived payloads. They
  must not depend on Pierre render output, DOM shape, tokenization, or
  renderer-side parse success.

For text diffs, the renderer should feed Pierre either Git patch text or
Pierre's `FileDiffMetadata` built from the loaded patch and snapshots. Prefer
the representation that supports full-context expansion and virtualization
without changing review identity.

Non-text changes are still reviewable, but they render through explicit
Difftray-owned placeholder panels until Pierre has a useful representation for
them.

## Context

The initial implementation used a local `parseDiffSegments` parser and custom
React components for split/unified diff rendering. That made early progress
possible, but it also made Difftray responsible for a difficult viewer surface:
patch parsing, hunk alignment, syntax highlighting, context expansion,
virtualization, selection, annotations, and large-file behavior.

`@pierre/diffs` was requested as the intended diff rendering dependency and is a
candidate fit for this responsibility. It provides React
components, Shiki-backed highlighting, split and stacked layouts, annotation
hooks, line selection/highlighting, hunk expansion behavior, and virtualization
APIs.

Difftray's product moat is trustworthy local review state, not ownership of a
homegrown diff renderer.

## Consequences

Positive:

- Reduces custom diff parsing and rendering code before publication.
- Moves correctness risk for common text diff rendering to a dedicated library.
- Gives Difftray a clearer path for large diffs, annotations, selection, and
  future review affordances.
- Lets core tests focus on review invariants instead of UI hunk formatting.

Negative:

- Adds a real third-party runtime dependency to the desktop renderer.
- Requires an adapter and visual verification to preserve Difftray's current
  workflow, styling, keyboard behavior, and Electron security posture.
- Requires explicit handling for worker bundling and content security policy.
- Some non-text review surfaces remain Difftray-owned.

## Amends

This decision amends [Decision 0001](0001-stack.md) and replaces the previous
architecture guidance to use the local `parseDiffSegments` renderer.

This amendment should become accepted only after the adapter lands and
`@pierre/diffs` is an actual production dependency. Until then, the release build
uses the local renderer and should not carry an unused Pierre dependency.
