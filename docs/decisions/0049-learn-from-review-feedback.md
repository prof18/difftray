# Decision 0049: Learn From Past Review Feedback

## Status

Accepted

## Context

Difftray keeps every line comment, file comment and review note in SQLite, with
human or agent attribution, and keeps stale comments for auditability. Agents could
only read the feedback of one live review context, which expires after 24 hours and
covers one worktree and target. Comments stored only a diff hash, not the code they
were written against, so feedback whose target was gone could not be read in
context. The same mistakes came back in later agent sessions because nothing turned
recurring review feedback into agent rules or docs. Much of this feedback never
reaches a pull request: it is written on uncommitted working trees and on the phone.

## Decision

- **Repository scope across worktrees.** A learn report covers the current
  repository and every worktree that shares its common Git directory, including
  removed worktrees. It includes line, file and note feedback from people, agents
  and the phone, each tagged with its author and its status (`active`,
  `target_changed`, `diff_changed`, `dismissed`). Dismissed items are evidence
  against a lesson, never for one. It never reads another repository's feedback.
- **Replacement detection.** Projects store their common Git directory
  (`projects.common_git_dir`) and the repository's root commit, the smallest root
  SHA that `git rev-list --max-parents=0 --all` prints. A path whose common
  directory changes, or whose stored root commit no longer exists, holds a new
  repository: feedback written before the replacement stops counting, and when the
  common directory is unchanged its cursor is deleted. Switching to a branch with unrelated history is
  not a replacement, because the stored root commit still exists.
- **Private report file.** `difftray learn report` collects the history in the
  desktop app and writes it to a file in `learn-reports` under the profile's data
  folder (folder mode 0700, file mode 0600); the CLI prints only the path and
  counts, so bulk feedback stays out of the agent's context. `--out PATH` writes to
  a new path in an existing folder instead. Markdown is the default format and JSON
  is available with `--format json`. Report files expire after 24 hours; writing a
  report and starting the app purge expired files.
- **Two sections.** "New since last run" lists every item updated after the last
  learned point in full, with its excerpt. "Earlier feedback (before last run)"
  lists up to 500 older items from the last 183 days in compact form (first body
  line up to 200 characters, author, status, path, date) so older singletons can
  complete a pattern.
- **Cursor moves only on learn mark.** Each repository has one "last learned" point
  in `repository_learn_cursors`, keyed by the common Git directory. A report
  returns a cursor, the newest `updatedAt` among its new items or null, and never
  moves the point. `difftray learn mark --cursor ISO` advances it after the user
  approved and the agent applied at least one edit; it never moves back and
  rejects a time in the future. `--since` and `--all` override the point for one
  report. An abandoned or fully rejected run loses nothing.
- **Excerpts on every save.** Saving a line comment, file comment or review note
  from the desktop, the phone or an agent stores a versioned `excerpt_json`: the
  commented lines plus 3 lines either side for line comments, the file patch for
  file comments, and the changed files with their counts (up to 100 paths) for
  notes. Excerpts hold at most 40 lines of at most 400 characters each. For
  comments the diff is read before the save and the diff hash is checked again
  afterwards, so the excerpt matches the hash stored with the feedback; for notes
  the note scope is checked the same way. Capture is best effort: a
  failed capture stores no excerpt and never fails the save. The companion wire
  format does not change; the desktop captures phone comments itself.
- **Git recovery and labels.** For feedback without a saved excerpt, the report
  tries Git: the live diff for active items, the exact refs of a branch or commit
  target, the head commit for working-tree deletions, then a later review of the
  same branch or the first commit that touched the path after the comment. Each
  excerpt is labeled `saved`, `recovered` (from the exact refs or the live diff),
  `approximate` (from a later commit, with its SHA), `unavailable`, or
  `not_looked_up`. Recovery is capped at 500 Git reads and 45 seconds per report;
  items past either cap are `not_looked_up`.
- **Rule threshold.** The `/difftray-learn` skill proposes a lesson only when at
  least 2 similar items support it, counting earlier items, or when one human item
  states a general rule. It skips lessons the instruction files already state,
  unless agents still break them.
- **Approval before any rule edit.** `/difftray-learn` is a typed-only command
  skill. Typing it authorizes reading and proposing, not writing: the agent shows
  each lesson with its destination file, exact edit and cited item ids, and writes
  only the edits the user approves. Neither the CLI nor the app writes rule or doc
  files. Settings → Agents explains the command; the desktop has no other learn
  control.

## Consequences

Positive:

- Feedback keeps the code it was written against, even after its target is gone.
- Agents can turn recurring review feedback from every worktree, including
  uncommitted and phone reviews, into rules and docs the user approved.

Negative:

- Excerpts are captured synchronously before each comment and file-comment save.
  This costs about 115 ms or more per save on the performance benchmark (base
  `commentSaveP50` about 200 ms against 317 to 819 ms with capture, on a busy
  machine), above the 10 percent performance gate. The user accepted this as a
  product tradeoff. Capturing after the save returns is the known alternative if
  the latency matters later.
- A full report on a large history is slow. On the 300-file, 600-comment benchmark
  fixture one collect reaches the 45-second recovery budget, and the remaining
  items are `not_looked_up`.
- Working-tree excerpts for feedback saved before this feature are often
  unavailable: the working-tree text it was written against was never committed.
- "Forget repository" still deletes all history of that project, and with it the
  repository's cursor once no project shares its common Git directory.
- A report holds copies of review feedback on disk for up to 24 hours, or longer
  at an `--out` path, which Difftray never cleans up.
- A replacement detected by common Git directory or root commit hides the earlier
  repository's feedback from reports.
- A replacement made before this feature cannot be detected: projects backfilled
  with their current common Git directory have no stored root commit to compare.
- A note an agent wrote shows as human after the user dismisses or edits it,
  because notes record only their last editor.
- An excerpt can show intermediate text when a file is edited and changed back
  while a comment is being saved, because the diff hash matches again on the
  recheck.
