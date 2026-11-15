# Decision 0048: Review Marks Survive Rebases And Commits

## Status

Accepted

## Context

A review target id includes the SHAs it resolves to: the merge base and head for a
branch target, and the head for a working-tree target. Rebasing the branch, or
committing in working-tree mode, therefore creates a new review target. Review marks
are stored per target, so every file lost its reviewed state after a rebase or a
commit, even when its diff had not changed at all. Users saw their review progress
vanish after routine branch upkeep.

## Decision

- **Review lineage.** Branch and working-tree targets get a lineage id that leaves
  out the SHAs. A branch lineage covers the project, the target kind, the base ref
  name and the head ref name. A working-tree lineage covers the project, the target
  kind and the head branch name. The id is a SHA-256 prefixed with
  `difftray-review-lineage-v1`. Commit targets and targets without a head branch name
  (a detached head) have no lineage.
- **Content fingerprint.** A mark also stores the file's content fingerprint: the
  diff-summary hash without the review target, prefixed with
  `difftray-file-content-v1`. A file keeps its review across targets only while its
  old and new blob or worktree identities are unchanged.
- **Upstream edits show amber.** A file that the base branch also edited gets a new
  old-side identity, so it shows the changed-after-review marker even when the
  branch's own change is identical. Matching patches while ignoring line numbers is
  a possible follow-up, not part of this decision.
- **Mode-only changes.** A mode-only change keeps its review when upstream edits the
  file's content. A mode-only summary holds no content identity, and the reviewed
  diff (the mode change) is unchanged. This matches how `createDiffHash` already
  treats mode-only files.
- **Invariant.** A file is reviewed if and only if a `review_marks` row for the
  current review target has the file's current diff hash, or a row with the same
  lineage id and path has the file's current content fingerprint.
- **Amber rule.** A file that is not reviewed shows the changed-after-review marker
  when it has a mark for the current target with another diff hash, or any mark with
  the same lineage id and path.
- **Carry-over ends when a file leaves the diff.** Each workspace load deletes the
  lineage marks of earlier targets whose file is not in the current diff. Once a
  reviewed change is committed in working-tree mode, or reverted, a later edit to
  that file is new work: it shows as unreviewed, not as changed after review. Marks
  of the current target stay, so a file that briefly leaves the diff keeps its
  review until the target changes.
- **Unmark rule.** Unmarking deletes the exact mark for the current target and every
  mark with the same lineage id, path and current content fingerprint, so an earlier
  target cannot bring the review back.
- **Ordering.** Mark and unmark for one project run one after another in the main
  process, in call order. Unmark reads Git before it deletes, and without this a
  slow unmark could finish after a later mark and delete it.
- **No backfill.** Marks written before this decision have no lineage id or
  fingerprint. They keep working for their own target and do not carry over.
- **Comments and notes.** Line and file comments stay per target. Review notes keep
  their existing SHA-independent scope from `createReviewNoteScopeId`; this decision
  does not change them.

## Consequences

Positive:

- Review progress survives a rebase or a commit on the same branch.
- The changed-after-review marker names exactly the files the rebase changed.

Negative:

- "Reviewed" no longer means "reviewed in exactly this comparison"; it means the
  reviewed content is unchanged on the same branch.
- Marks without a fingerprint, written before this decision, are lost on the first
  rebase after the update.
- Lineage marks for files still in the diff are kept, so each mark action on a
  long-lived branch adds a row that the workspace load reads until the file leaves
  the diff.
- A workspace load can delete rows. Marks of a file that leaves the diff and later
  returns with the same content are lost unless the target is unchanged.
