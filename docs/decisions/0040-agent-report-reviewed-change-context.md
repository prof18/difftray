# Decision 0040: Agent Report Names The Reviewed Change

## Status

Accepted

## Decision

The exported review prompt tells the receiving agent exactly which change was
reviewed and how the three feedback scopes relate:

- The header names the review target, gives a git command that reproduces the
  reviewed diff (`git diff <base>...<headSha>` for a branch comparison,
  `git show <sha>` for a commit, `git diff HEAD` plus untracked files for working
  tree changes), lists the visible files in the change (capped at 100), and
  counts feedback by scope (overall note, file comments, line comments).
- Overall review notes apply to the whole change, file comments to a whole file,
  and line comments to specific lines; when scopes disagree, the narrower one wins.
- Line-comment excerpts use a plain `text` fence and mark the selected lines with
  `>`. They do not reuse diff `+`/`-` markers, which would read as added or removed
  lines.
- The agent is told not to revert or discard other uncommitted work. It is not
  told to preserve local changes wholesale, because for a working tree review
  those changes are the code under review.
- A commit review warns that the commit may be behind `HEAD` and that history
  should not be rewritten unless asked.

Callers that cannot describe the target still pass only `targetLabel`, which is
rendered as the reviewed change without a reproduce command.

## Context

Decision 0026 introduced the report as a ready-made agent prompt. File comments
and the overall review note later made it three-scoped. The overall note asks the
agent to cover files without comments, but the report gave only a UI label such as
"Against main". That label is not enough to recover the file set, and `git diff
main` is a different diff from the merge-base comparison Difftray shows.

## Consequences

Positive:

- Overall notes can be applied to every file in the change.
- Working tree reviews no longer carry an instruction that conflicts with the task.
- The prompt is shorter: each item states its location once, in its heading.

Negative:

- The report text changed shape. Anything that parsed the previous headings
  (`## Comments`, `Referenced side:`) has to be updated.
- The branch reproduce command uses the base ref name, so it can drift if that ref
  moves after the review.
