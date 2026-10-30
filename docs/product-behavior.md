# Product behavior

This page describes what Difftray does for the person reviewing: which changes it
shows, how review state works, what feedback it keeps and how it hands that feedback
to an agent. Storage and hashing details live in [`data-model.md`](data-model.md),
process boundaries and Git access in [`architecture.md`](architecture.md), the
phone protocol in [`companion-protocol.md`](companion-protocol.md), and the agent
CLI in [`agent-integration.md`](agent-integration.md). Visual direction is in
[`professional-ui-redesign.md`](professional-ui-redesign.md).

Difftray is a local macOS app for file-level review of Git changes. All state is
local SQLite app data; nothing is written into the reviewed repository.

## Projects

A project is one local Git repository or worktree. Open projects share one window
as tabs; each tab shows the project name, its path as a tooltip, the current review
target and review progress. Difftray remembers recent projects, watches every open
project for changes, and keeps each project's own base ref and last review target.

With no project open, the window offers Open Repository, Scan a folder… (adds an
approved search folder) and recent projects, and notes that a folder can be
dropped onto the window.

Scan a folder…, from the empty window, the menu, the command palette or the
repository picker, approves the chosen folder, scans it, and opens the repository
picker limited to that folder: it says it is scanning, then lists the repositories
found there or says none were found. Show all returns to every repository.

## Review targets

Each project reviews one target at a time (`ReviewTarget` in
`packages/core/src/index.ts`):

| Target       | Compares                                                                                                                   |
| ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Working tree | The working tree against `HEAD`, including staged and unstaged changes, deletions, renames Git reports and untracked files |
| Branch       | `HEAD` against the merge base of `HEAD` and the configured local base ref                                                  |
| Commit       | One commit against its parent                                                                                              |

A new project starts on the working tree target. Choosing another target is stored
per project, and an agent `open` can apply a target too. Difftray never fetches;
base refs are local refs. Switching target selects a different review target, so
files can show a different reviewed state.

## Files

The file list shows modified, added, untracked, deleted and renamed files, with
status, reviewed state and a changed-after-review marker. Each row reads left to
right as change type, name, line counts and review state, using the file-state
vocabulary shared with the phone ([0043](decisions/0043-file-state-vocabulary.md)):

- Change type is a letter tile: `A` added, `M` modified or mode change, `R`
  renamed, `D` deleted.
- Review state is the trailing glyph: a hollow ring when unreviewed, a green check
  when reviewed, an amber alert when the file changed after review.
- A file that changed after review also gets an amber left rule. The header
  progress line counts these as "needs attention".
- Line counts read `+a -d`. Files with no line changes, such as images, show
  neutral blocks instead of `+0 -0`.
- Root-level files show no directory line. Long names truncate in the middle so
  the end of the name stays visible.

Generated files are hidden by default when detection is confident
(`detectGeneratedFile` in `packages/core/src/index.ts`): a generated marker in the
first 20 KB, a high-confidence suffix such as `.pb.go` or `.generated.ts`, or a
path segment such as `__generated__` or `generated`. Lockfiles are never treated as
generated. Hidden generated files do not count toward progress; once shown, they
do.

Progress is reviewed visible files over all visible reviewable files.

The filter field above the rows narrows the list to paths containing every
space-separated term, ignoring case ([0044](decisions/0044-file-list-filter.md)).
`Cmd+F` focuses it, `Enter` opens the first match, and `Escape` clears it, then
leaves the field. While a filter is on, file navigation keys and the advance after
marking a file reviewed stay within the matching rows; the header count and
progress still cover the whole diff. A filter is dropped when the project or review
target changes. While the file list is collapsed, navigation covers every file, as
the rail does.

With the file list hidden, a narrow rail keeps one mark per file showing its
review state; each mark opens its file, names it for assistive technology, and the
open file is ringed.

## Diff viewer

Diffs render side by side or unified (a setting), with syntax highlighting. The
diff header leads with the same change-type tile as the file list. When the diff
pane is narrower than 640 px, the review button shows only its check and `R`
shortcut so the toolbar stays inside the window.
Deleted, added, untracked, renamed, binary, symlink, submodule-pointer and
mode-only changes each have their own presentation. Static PNG, JPEG and WebP
changes show bounded, lazy image previews; other binaries show a summary.

"Ignore leading/trailing whitespace" (Settings → Review, View → Toggle Ignore
Whitespace) draws diffs with lines compared after trimming leading and trailing
whitespace. It only changes what is shown: review state and agent reads use the
canonical diff. A whitespace-only file shows "Only whitespace changed"; a file without
full snapshots, or with comments on whitespace-only lines, shows its canonical diff
with a note. See [Decision 0045](decisions/0045-ignore-whitespace-display.md).

A file whose patch or old/new text exceeds 2 MB (`maxPatchBytesPerFile` in
`packages/git/src/git-command.ts`, `maxTextSnapshotBytes` in
`packages/git/src/git-diff-content.ts`) shows a summary instead of the full diff.
It stays in the list and can still be marked reviewed.

## Review state

Review is per file. Marking a file reviewed stores its exact diff hash under the
current review target, and the file counts as reviewed only while its current hash
matches. A changed hash makes it unreviewed; if the diff returns to a reviewed hash,
the file shows as reviewed again for that target. The main process re-checks the
hash before storing a mark and rejects a stale one. Paths are part of the hash, so
a rename does not inherit the old path's reviewed state.

Marking a file reviewed collapses it and advances to the next unreviewed file. A
manual file selection while that advance is pending cancels it.

## Feedback

| Kind         | Scope                                                                                                                             | Lifetime                                                    |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Line comment | A line or line range on one diff side                                                                                             | Shown while the file's diff hash matches                    |
| File comment | A whole file                                                                                                                      | Shown while the file's diff hash matches                    |
| Review note  | One per review context: the head branch for working tree reviews, base and head for branch reviews, the commit for commit reviews | Survives new commits; can be dismissed, restored or deleted |

The exact scope rules are in [`data-model.md`](data-model.md). People write feedback
on the desktop and on paired phones; agents write it through the CLI, and agent
feedback carries attribution.

The agent report puts the active review note first, then each file's comments with
file comments before line comments. "Copy for agent" in the diff toolbar puts it on the clipboard,
and `difftray review export` returns the same text to an agent. The report names the reviewed
change and explains the three scopes (`packages/core/src/review-comments-report-templates.ts`).

## External editor

Difftray does not edit code. "Open in editor" uses the system default or a preset
for an installed editor app, discovered from the local application folders
(`apps/desktop/src/main/editor-discovery.ts`). Presets are structured command and
argument lists; the main process expands only supported tokens and never runs an
editor through a shell. Stored configs that match no built-in preset are ignored,
and free-form editor commands are not supported.

## Keyboard shortcuts

| Shortcut                           | Action                                                            |
| ---------------------------------- | ----------------------------------------------------------------- |
| `j` / `k`, `ArrowDown` / `ArrowUp` | Next / previous file                                              |
| `R`                                | Toggle the selected file's reviewed state                         |
| `Cmd+O`                            | Open a repository                                                 |
| `Cmd+K`                            | Command palette                                                   |
| `Cmd+P`                            | File-only command palette                                         |
| `Cmd+F`                            | Filter the file list                                              |
| `Cmd+1`                            | Collapse or expand the file list                                  |
| `Cmd+,`                            | Settings                                                          |
| `Cmd/Ctrl+Enter`                   | Save the focused review comment (plain `Enter` adds a line break) |
| `Cmd+W`                            | Close the current repository tab                                  |
| `Cmd+Shift+W`                      | Close the window                                                  |
| `Escape`                           | Dismiss the drift notification or close the active overlay        |

The command palette groups results as projects, files, then actions, with the best
matches first inside each group. Arrows move through the rows in that drawn order,
`Enter` runs the highlighted row (the first row when the palette opens) and
`Escape` closes it. Its footer names each shortcut (`Cmd+K` all, `Cmd+P` files
only), and action rows use neutral icons, keeping colour for change type and review
state. Single-key shortcuts do not fire while a button or field has focus. Refresh,
project switching and diff-mode switching are available from visible controls and
the palette. The View menu lists Go to File… (`Cmd+P`) and Filter Files (`Cmd+F`).
