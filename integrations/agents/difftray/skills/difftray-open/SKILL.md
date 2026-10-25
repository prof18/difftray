---
name: difftray-open
description: Open the current Git worktree in Difftray. Use only when the user types /difftray-open.
argument-hint: "[worktree path]"
disable-model-invocation: true
---

Load the `difftray` skill first: read `../difftray/SKILL.md` in the folder next to this one and follow all of its rules, CLI path and recovery steps. This command only narrows what to do.

Use the worktree path the user gave after the command, otherwise the root of the current Git worktree (`git rev-parse --show-toplevel`). Run `open "$repo" --json` without a target, so Difftray keeps the diff already selected for that worktree. Pass a target only if the user named one after the command. Report which worktree and diff Difftray shows.

Do not submit feedback, edit code or label the worktree.
