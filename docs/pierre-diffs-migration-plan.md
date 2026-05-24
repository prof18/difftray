# Pierre Diffs Migration Plan

## Goal

Replace Difftray's manual text diff parsing and rendering with `@pierre/diffs`
while preserving review-state correctness, Electron security boundaries, and the
current local-first product scope.

This is a renderer migration, not a rewrite of Git loading or review identity.

## Non-Goals

- Do not change review hash semantics.
- Do not make renderer output part of persisted review state.
- Do not add network-backed review, pull requests, merge tooling, or agent
  workflows.
- Do not let renderer-originated data execute shell commands.
- Do not use Pierre for binary, symlink, submodule, or mode-only placeholders
  unless the integration proves a clearer representation than the current
  explicit panels.

## Target Architecture

`packages/git` remains the source of Git truth. It loads canonical patch text,
metadata, content fingerprints, and optional old/new text snapshots.

`packages/core` remains the source of review truth. It owns review targets,
diff hashes, generated detection, progress, and invalidation. The existing
review hash inputs stay Git-derived and renderer-independent.

`apps/desktop` owns the Pierre adapter. It converts renderer file views into
Pierre props, maps Difftray preferences to Pierre options, and renders
Difftray-specific chrome around the diff.

The custom renderer path is deprecated:

- `parseDiffSegments`
- custom split/unified hunk components
- renderer-owned Shiki highlighter setup
- bespoke collapsed-context rendering, once Pierre-backed expansion is verified

## Phase 1: Dependency And API Spike

Purpose: prove the exact Pierre API shape before replacing production behavior.

Tasks:

- Add `@pierre/diffs` as a declared `@difftray/desktop` dependency if it is not
  already present.
- Build a private renderer spike with representative fixtures using
  `PatchDiff`, `FileDiff`, and, if needed, `CodeView` or `VirtualizedFileDiff`.
- Verify whether full-context expansion should be driven by Git patch text,
  `FileDiffMetadata`, or old/new `FileContents`.
- Start with Pierre's worker pool disabled if Electron CSP or Vite worker
  bundling is unclear. Re-enable only after worker loading is verified in the
  packaged renderer.
- Record any missing Pierre capability before deleting local code.

Fixture matrix:

- modified file with multiple hunks
- added file
- deleted file
- rename-only file
- rename with edits
- file without trailing newline
- path with spaces and unicode
- long lines
- large generated file
- oversized text diff fallback
- binary, symlink, submodule, and mode-only placeholders around a text diff

## Phase 2: Pierre Adapter

Purpose: introduce one narrow integration point and keep the app code readable.

Tasks:

- Create a `PierreDiffSurface` renderer component or equivalent adapter.
- Map Difftray's split/unified preference to Pierre's `diffStyle`.
- Map theme preference to Pierre themes without duplicating Shiki setup in
  Difftray.
- Disable Pierre's default file header when Difftray already renders the file
  toolbar, or replace it with a custom header that matches Difftray.
- Keep mark-reviewed, open-in-editor, generated visibility, stale state, and
  file navigation outside Pierre.
- Add a small render-failure fallback so one bad text diff cannot blank the
  whole review workspace.

Acceptance:

- The rest of the renderer passes file view data to one adapter.
- No product code depends on Pierre DOM internals.
- Split and unified modes both render from the adapter.

## Phase 3: Context Expansion And Large Diffs

Purpose: replace the bespoke context expansion code without regressing the
review workflow.

Tasks:

- Use Pierre's built-in hunk expansion for text diffs when full old/new
  snapshots are available.
- Keep Difftray's 2 MB large-diff fallback policy for patch text or text
  snapshot payloads.
- Use Pierre virtualization APIs for renderable large diffs that stay below the
  fallback threshold.
- Confirm expansion does not change the displayed diff hash or mark-reviewed
  payload.
- Preserve bounded memory behavior when switching files quickly.

Acceptance:

- Expanding context does not make a reviewed file stale.
- Large renderable diffs scroll without obvious jank.
- Oversized diffs show the existing reviewable fallback instead of trying to
  render all text.

## Phase 4: Feature Parity

Purpose: make the Pierre path the only path users see.

Must preserve:

- split diff mode
- unified diff mode
- light, dark, and system appearance
- syntax highlighting
- line numbers
- wrapped or scrollable long lines, matching the app preference if present
- selected-file navigation
- reviewed collapse behavior
- invalidated/stale visual state
- generated-file filtering
- binary, symlink, submodule, and mode-only review panels
- keyboard shortcuts that act on the selected file
- editor launch from the selected file

Visual checks:

- empty repository
- one modified file
- many changed files
- reviewed and collapsed file
- invalidated file
- dark mode
- light mode
- narrow window
- large text diff

## Phase 5: Remove Manual Renderer

Purpose: make the dependency real and remove the old maintenance burden.

Tasks:

- Delete custom React hunk components made obsolete by Pierre.
- Delete `parseDiffSegments` and its tests once no package imports it.
- Remove direct renderer Shiki setup and dependency if Pierre is the only
  highlighter consumer.
- Remove unused CSS selectors tied only to the old DOM.
- Keep only product-specific placeholder panels and small formatting adapters.
- Update docs and ADR references that mention the local parser.

Acceptance:

- `rg "parseDiffSegments"` finds no production imports.
- `rg "@pierre/diffs"` finds the real renderer adapter import and package
  declaration.
- No unused diff-rendering dependency remains.

## Phase 6: Hardening Gate

Purpose: prove the migration is safe before publication.

Required checks:

- `pnpm format`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:visual`
- `./ci.sh`

Additional review:

- Compare review hashes before and after the renderer migration on the fixture
  matrix.
- Inspect Electron renderer config for Node integration disabled and context
  isolation enabled.
- Verify Pierre worker loading or worker disabling under the packaged renderer
  content security policy.
- Verify no network calls are introduced by the diff renderer.
- Capture screenshots for split/unified, dark/light, large diff, and invalidated
  review flows.

## Open Questions

- Whether Pierre's `PatchDiff` is enough, or whether Difftray should build
  `FileDiffMetadata` from patch plus snapshots for richer expansion behavior.
- Whether Pierre's worker pool can be enabled in the packaged Electron renderer
  without weakening CSP.
- Whether Difftray should register custom CSS-variable themes with Pierre or map
  to Pierre's built-in light/dark themes first.
- Whether long-line wrapping becomes an app-level preference before publication
  or stays fixed for v0.
