# Decision 0008: Generated Files And Large Diffs

## Status

Accepted

## Decision

Generated files are hidden by default only when detection is high-confidence.

Hidden generated files do not count toward review progress.

Large file diffs fall back to fingerprint-only summary content when a single
file exceeds:

- 2 MB of patch text
- 2 MB of old or new text snapshot payload

Git metadata and status output still use bounded process buffers. Patch text is
loaded per file so a single huge file cannot make the whole workspace fail after
Git has already identified the changed paths.

Per-file diff loading is concurrency-limited. A large repository must not be
allowed to spawn unbounded Git child processes while calculating patches,
snapshots, or fallback fingerprints.

Diff loading reports coarse progress phases and loaded-file counts so the
desktop UI can keep the active tab visibly busy during large scans. The renderer
also avoids expensive syntax highlighting for very large visible diffs.

Workspace loads use lightweight per-file summaries for review state and file
list rendering. Full patch bodies and text snapshots are loaded on demand for
the selected file instead of being sent for every changed file up front.

The selected-file diff loading indicator is delayed briefly so fast on-demand
patch loads can render without flashing a loader. Large file lists are
virtualized in the renderer; pagination is avoided so review navigation and file
search still operate over the full changed-file set.

## Context

Generated files can overwhelm review progress, but false positives are dangerous because they hide files from the default review flow.

Large diffs can hurt rendering performance and make the review UI feel broken.

## Generated Detection Policy

V0 generated-file detection may use:

- generated-file headers in the first 20 KB
- high-confidence generated suffixes
- high-confidence generated path segments

Lockfiles are not generated files.

Generated detection should be tested with fixtures before expanding the rules.

## Large Diff Behavior

A large file still appears in the file list and still counts in progress if visible.

The user can mark it reviewed.

The renderer should not attempt to eagerly render the full side-by-side diff by default.

The review fingerprint remains content-sensitive in fallback mode by hashing the
file bytes or committed blob bytes with SHA-256 and including the byte size.

## Consequences

Positive:

- Protects rendering performance.
- Keeps progress meaningful.
- Avoids hiding real source files aggressively.
- Keeps large local diffs from making the Electron main process unresponsive.
- Gives users visible feedback while large diff state is still being prepared.
- Keeps large change sets usable by avoiding eager IPC transfer and rendering of
  every patch body.
- Keeps thousand-file reviews navigable without mounting every file row at once.

Negative:

- Some generated files will remain visible in v0.
- Users may need custom ignore rules later.
- Large repositories can still take time to load, but they should load
  progressively without a process storm.
