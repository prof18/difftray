# Decision 0024: Adopt Diffs Rendering Engine

## Status

Accepted

## Decision

Difftray uses `@pierre/diffs` as the text diff rendering engine in the desktop
renderer.

The app keeps its existing performance boundaries around the renderer:

- Git remains the source of truth for patch text, old/new snapshots, review
  hashes, generated-file detection, and invalidation.
- Project and file summaries still load without full patch text.
- Full patch content still loads lazily only for the selected file.
- Renderer parsing is deferred until after the selected-file paint.
- Syntax highlighting runs through a bounded Diffs worker pool.
- The selected diff surface uses Diffs virtualization and a stable `diffHash`
  cache key.
- Diffs owns parsing, syntax rendering, and virtualization. Difftray passes
  rendering preferences such as split/unified mode, bars, word-level
  highlighting, the user's line wrapping preference, and the app's registered
  IntelliJ Islands themes plus line/background CSS variables.
- Inactive repository tabs do not mount hidden diff viewers.

`packages/core` no longer owns a custom patch-to-render-segment parser.

## Context

Decision 0023 rejected an earlier migration after it regressed responsiveness in
multi-repository review. The product decision has changed: reducing ownership of
custom diff parsing, hunk layout, syntax highlighting, and virtualization is now
worth adopting the maintained renderer, as long as Difftray keeps the loading
and invalidation behavior that protects repository switching.

Difftray still cannot let the renderer define review identity. Review identity
continues to come from Git-derived file payloads and versioned review hashes.

## Consequences

Positive:

- Difftray no longer maintains `parseDiffSegments`, split/unified row pairing,
  or custom Shiki token rendering.
- The renderer gets maintained patch parsing, full-file diff parsing,
  expandable unchanged regions, syntax highlighting, workers, and
  virtualization from Diffs.
- Review invalidation remains independent from renderer output.

Negative:

- The desktop app now carries `@pierre/diffs` as a runtime dependency.
- Electron must continue to allow same-origin module workers for Diffs
  highlighting.
- Visual and performance checks remain required for renderer changes, because
  large selected diffs and tab switching are product-critical.

## Supersedes

This supersedes [Decision 0023](0023-pierre-diffs-rendering-engine.md).
