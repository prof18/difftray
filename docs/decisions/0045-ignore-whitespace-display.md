# Decision 0045: Ignore Leading And Trailing Whitespace In Displayed Diffs

## Status

Accepted

## Context

When a change re-indents code (wrapping a block, moving code into a closure, a
formatter run), every touched line shows as removed and re-added, and the real change
is hard to see (prof18/difftray#59). Decision 0018 stored a
`hideWhitespaceOnlyChanges` app setting for "whitespace-only change visibility" but
never gave it a control or behaviour.

## Decision

`hideWhitespaceOnlyChanges` now means "Ignore leading/trailing whitespace". It stays
off by default, keeps its stored key (`hide_whitespace_only_changes`), and is shown in
Settings → Review and as View → Toggle Ignore Whitespace (no shortcut).

It changes only how a diff is drawn:

- When both text snapshots are available, the renderer builds the diff with
  `parseDiffFromFile(..., { ignoreWhitespace: true })`. Lines that differ only in
  leading or trailing whitespace become unchanged lines; whitespace inside a line still
  shows. Unchanged lines keep their real old and new text.
- A file whose only changes are whitespace shows "Only whitespace changed".
- A file without full snapshots keeps its canonical diff and says so.
- If a comment or draft sits on a line that the whitespace-ignoring diff would leave
  in a collapsed region, that file shows its canonical diff with a note, so feedback is
  never hidden.
- Review state is unaffected. The diff hash stays based on the canonical Git patch
  (Decision 0010), so a whitespace-only change still invalidates a reviewed file. Agent
  reads and line validation keep using the canonical diff.
- The phone has its own local preference with the same behaviour. The shared diff
  surface takes an optional `ignoreWhitespace` on `init` and a
  `set_ignore_whitespace` message. The companion protocol does not change.

## Consequences

- Toggling reparses the selected file; the parse and render cache keys include the
  setting.
- jsdiff can pair lines differently than `git diff -w`; the result is correct but can
  look less tidy around moved braces.
- Files over the 2 MB snapshot limit ignore the setting.
