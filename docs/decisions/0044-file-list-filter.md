# Decision 0044: Filter Field In The Desktop File List

## Status

Accepted

## Context

In a large diff, the only way to find a file in the list was to scroll. `Cmd+P`
already opened a files-only command palette, but no menu item or control showed
it, and it opens a single file: it cannot show, for example, every changed file in
one folder together with its review state.

## Decision

- The file list has a filter field above its rows. `Cmd+F` (View → Filter Files)
  focuses it, expanding a collapsed file list first.
- A file matches when its path contains every space-separated term, ignoring
  case. Rows keep their order and their file-state markers.
- `Enter` opens the first match, `Escape` clears the filter, and a second
  `Escape` leaves the field. With no matches, the list says so and offers to clear
  the filter.
- While a filter is on, `j`/`k` and the arrow keys step through the matching rows
  only, and marking a file reviewed advances to the next unreviewed match. With no
  unreviewed match left, the reviewed file stays selected.
  While the file list is collapsed, the rail shows every file, so navigation and
  the advance cover every file too; the filter applies again on expand.
- The header count, progress bar and "needs attention" count keep describing the
  whole diff, so a filter never makes review look further along than it is. The
  collapsed rail also keeps every file.
- A filter applies to one project and review target. Switching either drops it,
  and switching back does not restore it; refreshes and new commits on the same
  target keep it.
- `Cmd+F` closes any open picker or palette before focusing the field, so focus
  never lands behind a modal dialog.
- The existing `Cmd+P` palette stays and is listed as View → Go to File….

## Consequences

- Both ways to find a file are reachable from the menu bar, so they can be
  discovered without knowing the shortcuts.
- The filter is renderer-only state: it is not persisted and does not reach the
  companion server or the phone.
