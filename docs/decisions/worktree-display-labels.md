# Worktree display labels

## Status

Accepted

## Context

Linked worktrees are often named after a task, while their branch names or
detached heads say little to a reviewer. Users want a short, human-readable name
for a worktree in the desktop picker and tabs, on mobile, and in the bundled
agent CLI. Renaming a branch or moving a directory changes Git state and review
identity, so a label must be display metadata only.

## Decision

A worktree may carry an optional custom display label. Labels are desktop-profile
metadata, stored in the profile database and shared by every client of that
profile: desktop windows, paired phones and the bundled CLI. They are not synced
between profiles or machines.

Storage uses one table:

```sql
worktree_labels(
  worktree_id TEXT PRIMARY KEY,
  common_git_dir TEXT NOT NULL,
  worktree_path TEXT NOT NULL,
  label TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
```

The key is the existing `worktreeOpaqueId(commonGitDir, path)`. A label therefore
survives branch and HEAD changes, closing and reopening projects, and cold starts.
It does not follow a directory moved outside Difftray. Reusing the same
repository and path reuses its label until it is reset. Labels are never deleted
because discovery failed transiently, and there is no automatic pruning.
Path-scoped lookups use an index on `worktree_path` and batches of at most 200
paths, so projection cost follows the displayed paths rather than the number of
retained labels.

Validation is shared by every caller (`normalizeWorktreeLabel` in
`@difftray/companion-protocol`): reject C0/C1 control characters on the raw
string before trimming (including leading or trailing tabs and newlines), reject
malformed Unicode (lone surrogates, which SQLite would store as U+FFFD), and
reject bidirectional controls (U+061C, U+200E, U+200F, U+202A–U+202E,
U+2066–U+2069), zero-width and invisible characters (U+200B, U+2060, U+FEFF) and
line or paragraph separators (U+2028, U+2029), which could make a label spoof
another name or look blank. Then trim ordinary surrounding whitespace and require
1 to 80 Unicode code points, at least one of them visible. ZWJ (U+200D) and ZWNJ
(U+200C) stay allowed because emoji sequences and several scripts need them. The
CLI escapes the same formatting characters, as it does controls, when writing to
a terminal.
Internal spaces and Unicode are preserved and labels need not be unique. `null`
resets the label and deletes the stored override; an empty or whitespace-only
string is a validation error, not an implicit reset. Labels are plain text, never
HTML or shell input.

Main and linked worktrees, including locked ones, can be labeled. Bare,
prunable, missing, foreign-repository and stale targets are rejected. Git locks
govern Git maintenance, not local display metadata. A closed sibling worktree can
be labeled without opening it.

Setting or resetting a label changes metadata only: no Git writes, no project
open or close, no focus or review-target change, no review invalidation and no
agent-context invalidation. One desktop service owns normalization, storage writes
and change notification; desktop IPC, the CLI and the companion API all call it.
The last completed write wins. Clients wait for the server acknowledgement and
keep the draft on failure; there is no optimistic success.

Views keep the generated names. `customLabel` is an optional field on project and
worktree views, absent when unset. The worktree picker's `displayName` resolves
`customLabel` first, then the branch or detached fallback. Tabs keep repository
context and show the label as the emphasized worktree text; an unlabeled main
checkout keeps its repository-only presentation. The actual branch or short hash
and path stay visible in secondary text and tooltips.

Project views are enriched asynchronously at request boundaries: stored labels
for the response's paths are loaded, their identity is verified against Git with
at most four concurrent `getWorktreeInfo` calls, and a label is shown only when
the stored identity matches. The row is read again after verification so a
concurrent set or reset wins. Responses with no matching labels make no Git
calls.

Refresh contract: desktop windows refresh immediately through a
`projects:labelsChanged` event. A phone that edits a label refreshes its own
queries immediately. Other phones and desktop-originated changes reach mobile on
pull-to-refresh, worktree-sheet reopen, or route or app foreground. There is no
WebSocket label event and no polling in this version.

Compatibility: old mobile parsers reject unknown keys, so every existing
companion response omits `customLabel` and reconstructs generated worktree names
unless the client negotiates the `worktree-labels-v1` capability. The protocol
version is unchanged for this additive, negotiated change. The companion route is
`POST /companion/v1/projects/:projectId/worktrees/label` with body
`{ worktreeId, label }`; the CLI adds `difftray worktree label set|reset` over the
agent method `worktree.label.set`. The CLI has no source project, so its result
reports the worktree as `open` when a Difftray tab shows it and `available`
otherwise, never `current`.

## Consequences

- Labels are local to one desktop profile and are lost if that profile is
  removed.
- Stale rows for removed worktrees remain until the same identity is reused and
  reset; this is a deliberate trade-off against deleting labels on transient
  discovery failure.
- Mobile clients other than the editor see changes only on their next refresh.

## Out of scope

Git branch, path or config changes; cloud sync; labels shared across profiles;
automatic task-name inference; tracking directory moves; real-time push of label
changes; dependency upgrades.
