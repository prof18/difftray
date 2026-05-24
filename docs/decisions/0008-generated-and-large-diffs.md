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

Negative:

- Some generated files will remain visible in v0.
- Users may need custom ignore rules later.
