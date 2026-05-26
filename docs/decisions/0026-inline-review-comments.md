# Decision 0026: Inline Review Comments And Agent Report Export

## Status

Accepted

## Decision

Difftray supports local inline review comments on rendered text diffs.

Comments are stored separately from file-level review marks. A comment is scoped
to a project, review target, path, current diff hash, diff side, and line range.
Only comments whose stored diff hash still matches the current file diff are
shown in the review UI and included in exported reports.

The renderer uses `@pierre/diffs` line annotations and line-number interaction
hooks. Difftray owns the comment records, invalidation policy, report text, and
clipboard handoff.

The report export copies a single text report to the system clipboard. It
contains a short header with project and target context, then groups comments by
file with side-aware line numbers, reviewer text, and a small fenced diff
excerpt around each commented line when textual content is available. The report
is intended to be pasted into an agent or LLM so the local changes can be fixed
from the review notes without requiring the recipient to infer the target line
from the path alone.
The export action is shown as a text button with a comment count, and is hidden
until the active review has at least one comment.
Before copying, the main process reloads the active review and verifies that the
active comment set still matches what the renderer requested, so stale diff
changes do not silently produce an incomplete report.

## Context

Line comments and agent-ready comment export were explicitly allowed as a future
expansion after file-level review became stable. The `@pierre/diffs` renderer now
provides the interaction and annotation primitives needed to add this without
building custom diff-row overlays.

Review invalidation remains product-critical. Comments must not silently move to
new line numbers after the underlying diff changes.

## Consequences

Positive:

- Reviewers can leave actionable notes without leaving the local diff workflow.
- Agent handoff stays local and explicit through clipboard text.
- Existing review marks continue to mean only file-level reviewed state.
- Stale comments are naturally hidden from the active review when the diff hash
  changes.

Negative:

- Comment records may remain in storage after their original diff becomes stale.
- The first implementation supports line comments only; threaded discussion,
  resolved state, and stale-comment surfacing are future work.
- UI changes around the diff renderer require visual verification because line
  annotations affect virtualized row height.
