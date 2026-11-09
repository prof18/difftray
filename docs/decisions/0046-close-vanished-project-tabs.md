# Decision 0046: Close Tabs Of Vanished Projects Automatically

## Status

Accepted

## Context

Agents and scripts often delete Git worktrees from the terminal. Difftray already
closed a tab at startup when its folder was missing, but a deleted worktree's tab
could stay open:

- On macOS the app keeps running when its window closes, so returning to the window
  did not run the startup check again.
- A folder left behind with only ignored files (such as `node_modules`) still
  existed, although it was no longer a Git worktree.
- The main process closed the tab in storage without telling the window, so the tab
  stayed visible until the next restart.
- The phone's workspace request for a deleted folder answered 500, so the phone
  stayed on a workspace that could not load.

## Decision

- A project is gone when its folder is missing or has no `.git` entry. Projects are
  stored at their `git rev-parse --show-toplevel` root, which always holds a `.git`
  directory (main checkout) or file (linked worktree).
- The main process checks open tabs when it lists them (startup, the phone's project
  list), on every `browser-window-focus`, and before and after each workspace or
  summary load, whether the load succeeds or fails.
- Every close goes through `closeProjectIfOpen`, so a tab closes at most once. The
  `projects:closed` event carries `reason: "closed" | "vanished"`. For a vanished tab
  that is selected, the window shows its loading overlay titled "Worktree removed",
  then the next tab or the empty window. The title stays pinned for that load, and the
  replacement load's progress messages show in the detail line beside it. A vanished
  close for a tab the window never
  listed (the startup check) is ignored, so startup shows no overlay.
- Each close also broadcasts a companion workspace change. The workspace route
  answers 404 `not_found` when the project is not stored or its folder is gone,
  including when the folder disappears during the load. The phone already turns that
  404 into its projects list with a notice. The companion protocol does not change.

## Consequences

- Difftray does not watch a project's parent folder, so it notices a deletion at the
  next focus, startup, list or load, not the moment it happens.
- The check costs two `existsSync` calls per open tab on each focus.
- If a focus check runs between the startup list reply and the window applying it,
  the tab stays until the next focus or load closes it.
