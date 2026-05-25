# Decision 0014: Desktop Review Workflow

## Status

Accepted

## Decision

The v0 desktop app opens local repositories through the native directory picker, stores opened repositories as recent projects, and loads the selected repository diff target through the main process.

Recent-project listing is metadata-only. It must not compute full review
summaries for inactive repositories during app launch; only the active workspace
owns expensive diff loading and authoritative progress. Inactive tabs may show an
unknown progress count until a background tab-summary pass has loaded their
lightweight review summaries.

Inactive tab summaries are loaded lazily, one repository at a time, through the
same summary-only Git path used by workspace loading. A stale or missing summary
must not trigger full patch-body loading, hidden diff rendering, or tab switching.

Once a repository has been loaded in the renderer, tab switches back to that
repository reuse the in-memory workspace snapshot immediately, then trigger the
same silent main-process reload used by focus refresh. Explicit refresh, project
watch events, settings changes, diff-target changes, and review marking still
reload through the main process when they need authoritative Git state.

Long-running active workspace reloads publish progress through the preload API.
When an existing tab is active, the renderer keeps the app chrome visible,
blocks the active review controls, and shows a compact loading state in the tab
and diff pane. Full-window loading is reserved for app startup or states where
there is no active workspace to keep visible.

Focus-triggered active workspace refreshes are silent. The renderer asks the
main process to reload Git state without progress events, keeps the current UI
interactive, and applies the refreshed workspace only if the same project is
still active and no newer workspace update has started. Loaded patch bodies are
carried forward when their diff hash still matches, so a no-op focus refresh
does not replace the diff pane with a loader.

Cached tab-switch refreshes use the same silent application guard. The cached
workspace appears first so tab changes stay instant, and the fresh workspace is
applied only if the switched-to project is still active when the background load
finishes.

When switching to a repository tab whose workspace is not already cached, the
renderer selects the target tab immediately while keeping the existing review
workspace visible underneath a compact loading banner. The previous workspace
controls are blocked until the new workspace arrives, but the content is not
replaced by a full loading surface.

The uncached tab-switch loading state is delayed for tabs whose lightweight
summary predicts a small review set. If the workspace arrives before the delay,
the renderer switches directly to the loaded workspace without flashing a loader.
Large or unexpectedly slow tab switches still show the selected-tab loading
state.

Workspace loads return file metadata, review state, and content fingerprints.
Patch bodies are fetched separately for the selected file. This keeps large
repositories responsive because opening a tab does not require serializing every
patch through IPC before the renderer can show the file list.

The selected-file patch loader is delayed briefly to avoid flicker when the
patch returns quickly. The file list is virtualized rather than paginated, so
large reviews mount only the visible rows while keyboard navigation, progress,
and command-palette search still operate on the full file set.

The renderer talks to a narrow preload API for project listing, project open/load, refresh, project settings, editor launch, and marking a displayed file reviewed. The renderer does not read Git, SQLite, or the filesystem directly.

Review marking is verified in the main process by reloading the current repository diff target and comparing the displayed diff hash with the current diff hash before persisting the mark.

Repository records keep project-local workspace state. App settings store generated-file visibility, editor launch configuration, and review defaults. Saving settings reloads the current workspace so generated-file visibility and progress are recalculated from the persisted app setting.

## Context

Difftray's product-critical behavior is review invalidation. The UI needs to feel immediate, but review marks must not be written from stale renderer state after files change on disk.

Keeping Git and storage in the main process preserves Electron security defaults and gives one place to enforce stale-diff checks.

## Consequences

Positive:

- Renderer-originated data is treated as untrusted command input.
- Stale review marks are rejected before persistence.
- Recent-project state and review marks share one storage boundary.
- Settings changes use the same main-process storage boundary as review state.
- The first UI can support real local review without adding network or PR concepts.
- App launch is not blocked by full diff calculations for every stored recent repository.
- Inactive tabs can show useful review counters and drift attention after their
  lightweight summaries finish loading.
- Switching back to an already-opened repository is immediate.
- Large active-repository reloads have visible progress instead of looking hung.
- Refocusing the app or returning to a cached tab can validate drift without
  flashing a loading state.
- Large file sets can be opened and navigated before every patch body is loaded.
- Thousand-file reviews do not require rendering every file row at once.

Negative:

- Refresh is explicit for now; file watching remains a later main-process service.
- Inactive repository tabs can briefly show unknown progress while their summary
  queue catches up.
- Cached tab content may be briefly stale until the tab-switch revalidation
  completes.
- Focus-triggered refresh failures are reported only if the original project is
  still active when the background refresh completes.
- Existing review marks created from older patch-body hashes may need to be
  re-marked under the lightweight fingerprint model.
