---
name: difftray-label
description: Set or reset the Difftray display label of the current Git worktree. Use only when the user types /difftray-label.
argument-hint: "[label | reset]"
disable-model-invocation: true
---

Load the `difftray` skill first: read `../difftray/SKILL.md` in the folder next to this one and follow all of its rules, CLI path and recovery steps. This command only narrows what to do.

Use the root of the current Git worktree (`git rev-parse --show-toplevel`). If the text after the command is exactly `reset`, run `worktree label reset`. If it is a label, set that label as written. With no text, choose a concise, task-based label from the branch and the changes, at most 80 characters, and set it. Report the label Difftray now shows.

Label only this worktree. Do not submit feedback, rename the branch or move the directory.
