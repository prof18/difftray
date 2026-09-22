# Multiline code comment selection

## Status

Accepted

## Decision

Inline review comments may cover a contiguous line range on one diff side. The
existing comment identity remains unchanged: the record is scoped to the
project, review target, path, current diff hash, side, and line range. This is
a renderer interaction decision; it does not add protocol or storage fields.

On desktop, clicking a line gutter opens the comment composer immediately at
that line. Clicking another gutter in the same file with the same diff hash and
side extends the active draft from its original anchor to the new endpoint.
The anchor is retained when the endpoint is selected in either direction, so a
reverse selection produces the same normalized contiguous range as a forward
selection. A gutter drag selects the endpoint and commits the range on pointer
release. The range is derived from captured line coordinates, rather than from
text selection.

On mobile, a short gutter tap opens the composer immediately. A press held for
500 ms enters local range-selection mode; tapping another gutter on the same
side selects the endpoint. Comment and Cancel appear as soon as the hold enters selection. Pending touch
selection is cancelled when movement exceeds 10 px, allowing ordinary scrolling
to preserve the existing anchor. Code text selection remains untouched.

The Pierre renderer displays a controlled preview. Its user-only
`onLineSelectionEnd` callback commits mouse ranges after release. Mobile confirmation
commits the controller's captured coordinates. Programmatic `onLineSelected`
notifications never create comments: they also fire when the host changes the
highlight. Preview updates do not persist comments or change review state.

## Context

Line comments already support side-aware identity and stale-diff invalidation,
but a single-line click does not provide a practical way to annotate a related
block. Range selection must fit the existing renderer and comment model while
remaining explicit on touch devices. Text selection is intentionally separate:
reviewers select diff lines through gutters, leaving browser/native code text
selection behavior available for copying.

## Consequences

Positive:

- Reviewers can describe a contiguous multiline issue without creating several
  comments.
- Desktop selection is fast for clicks and drag gestures, while mobile keeps
  scrolling and text selection predictable.
- Existing protocol, storage, stale-hash, export, and review-state semantics
  remain compatible.

Negative:

- The interaction needs distinct pending, selecting, preview, cancel, and commit
  states across pointer and touch input.
- Captured coordinates must be rejected or cancelled when the file, hash, or
  side changes before commit.
- Virtualized diff rendering and narrow viewports require visual verification.

## Verification

The browser smoke suite covers exactly-once taps, hold/confirm, cancellation,
reverse endpoints, programmatic highlights, saved-comment editing, and scrolling.
The Electron visual smoke exercises reverse drag, typed-body preservation across
endpoint changes, save and export. Pure controller tests cover timing and canceled
pointer transitions. Device interaction comfort still requires human judgement.
