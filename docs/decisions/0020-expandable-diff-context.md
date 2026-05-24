# Decision 0020: Expandable Diff Context

## Status

Accepted

## Decision

Difftray keeps the default diff view compact, but text diffs may carry old and new
file snapshot text so the renderer can show collapsed unchanged ranges around and
between patch hunks.

Collapsed ranges are rendered as explicit controls in the diff surface. Clicking a
range expands the unchanged lines in the current diff mode. The renderer does not
read files directly and does not make follow-up Git calls for expansion.

Snapshot text is display context only. It is not part of the reviewed diff hash,
which remains based on the canonical patch payload and review target identity.

## Context

Users sometimes need to inspect nearby or distant code in the same file before
marking a diff reviewed. A compact Git patch omits those unchanged lines, so the
renderer cannot reveal them unless the main process supplies additional local
file context.

Keeping expansion local to the already-loaded workspace preserves Electron
security boundaries and keeps review marking tied to the same diff snapshot shown
to the user.

## Consequences

Positive:

- Reviewers can inspect omitted code without leaving Difftray.
- The default view remains compact.
- Review invalidation semantics do not change.

Negative:

- Text workspace payloads are larger for changed files.
- Very large expanded ranges can still be expensive to render when the user opens
  them.
