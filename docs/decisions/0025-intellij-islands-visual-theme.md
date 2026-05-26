# Decision 0025: Adopt IntelliJ Islands Visual Theme

## Status

Accepted

## Date

2026-05-25

## Decision

Difftray will use an IntelliJ IDEA Islands-inspired visual system for both app
chrome and rendered diffs.

The renderer keeps semantic CSS custom properties, but their dark and light
values are now aligned to the IntelliJ IDEA Islands Theme for VS Code by
Oleksandr Havrysh. The desktop app also registers the theme's dark and light
JSON definitions with `@pierre/diffs` so syntax highlighting, diff foregrounds,
and Git decoration colors come from the same palette as the app shell.

The review surface uses a comfortable tooling scale rather than the smallest
available desktop scale: rendered diff code is set to 13px with 22px rows, and
supporting metadata avoids sub-11px text.

## Context

The app already supports system, light, and dark appearance modes. The requested
direction is to make those modes look and feel like the IntelliJ IDEA Islands
theme rather than Difftray's earlier neutral console palette.

The diff surface is the product-critical view. It should not visually drift from
the app shell or fall back to unrelated library defaults when the app theme
changes.

Reference:

- https://marketplace.visualstudio.com/items?itemName=OleksandrHavrysh.vscode-intellij-theme

## Consequences

Positive:

- The app shell and code diff surface now share one visual palette.
- `@pierre/diffs` receives explicit Shiki themes instead of Pierre defaults.
- Diff line backgrounds, gutters, selection, and added/deleted emphasis are
  controlled through Difftray-owned variables.

Negative:

- The renderer bundle includes local copies of the upstream VS Code theme JSON.
  The upstream MIT license notice is kept beside those assets.
- Theme changes need visual verification in both light and dark modes because
  app chrome and syntax highlighting now move together.
