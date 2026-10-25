---
name: difftray-review
description: Review the current Git worktree and submit findings to Difftray. Use only when the user types /difftray-review.
argument-hint: "[worktree path or focus]"
disable-model-invocation: true
---

Load the `difftray` skill first: read `../difftray/SKILL.md` in the folder next to this one and follow all of its rules, CLI path and recovery steps. This command only narrows what to do.

Use the worktree path the user gave after the command, otherwise the root of the current Git worktree (`git rev-parse --show-toplevel`). Typing this command is the user's request to submit review findings for this worktree's current review. Inspect the review, load every file page and existing feedback page, and read the exact diff of each file before anchoring anything. If the user named files or a focus after the command, review only that.

Look for real problems: bugs, missing cases, broken contracts, security and performance issues. Skip style nits and anything already raised in existing feedback. Anchor each finding to the narrowest scope that fits: single line, inclusive range, file, or overall. Use the overall note only for a cross-cutting point, appending to the existing text with `expectedNoteVersion`. Submit one batch with a fresh run ID and request ID, then list what was submitted. When there is nothing worth raising, submit nothing and say so.

Do not edit code or mark files reviewed.
