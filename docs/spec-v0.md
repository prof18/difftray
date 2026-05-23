# V0 Specification

## Scope

V0 is a local macOS desktop app for file-level review of Git changes.

## Project Management

Difftray must support:

- opening multiple local Git repos
- opening multiple Git worktrees
- keeping all opened projects in one window
- remembering recent projects
- project-specific base branch setting
- live monitoring of all opened projects

The preferred layout is a single-window project sidebar, not separate windows or project tabs.

## Diff Modes

V0 should support:

- working tree review: current working tree compared to `HEAD`
- branch review: current branch compared to configured base branch

Commit range review is planned after v0.

Default mode:

- if the working tree has changes, show working tree review
- if the working tree is clean and the branch is ahead of base, show branch review
- otherwise show an empty state

## File Handling

Changed files must include:

- modified files
- added files
- untracked files
- deleted files
- renamed files when Git reports rename information

Generated files should be hidden by default when detectable. Hidden generated files do not count toward progress.

Lockfiles are visible and reviewable by default.

Binary files should appear in the file list with a graceful non-text preview state.

## Review State

Review is file-level only in v0.

When a file is marked reviewed, Difftray stores the exact diff hash for that file under the current review target.

A reviewed file remains reviewed only while its current diff hash equals the stored reviewed diff hash.

If the diff hash changes, the file becomes unreviewed.

If the diff hash later returns to a previously reviewed hash, the file can appear reviewed again for that same review target.

Changing the base branch creates or selects a different review target. Review state from the previous base is not deleted, but it is not applied to the new base.

## Progress

Progress is calculated from visible reviewable files:

```text
reviewed visible files / total visible reviewable files
```

Hidden generated files do not count. If generated files are shown, they count.

## Diff Viewer

V0 uses side-by-side diffs by default.

Unified diff view is out of scope for v0, but the architecture should not prevent it later.

The viewer should support:

- syntax highlighting
- large-file fallback
- deleted-file display
- added/untracked-file display
- renamed-file metadata

## External Editor

Difftray does not edit code.

It must provide an "open in editor" action. The editor is configurable:

- system default
- VS Code
- Cursor
- Zed
- custom command template

Example custom command:

```text
code --goto {path}:{line}
```

## Keyboard Shortcuts

Initial shortcuts:

```text
j / k        next / previous file
Enter        open selected file
Space        mark selected file reviewed
u            toggle reviewed state
o            open in external editor
f            focus file filter
Cmd+R        refresh selected project
Cmd+1..9     switch project
```

## UI Behavior

When a file is marked reviewed:

- check the file
- collapse it
- advance to the next unreviewed file when available

Project sidebar shows:

- project name
- path tooltip
- current mode
- review progress
- dirty/unreviewed indicator

File list shows:

- path
- status
- review checkbox/state
- changed-after-review state
- generated/hidden metadata where relevant

## Persistence

All state is local.

No review state is written into the reviewed repository.

SQLite is used for app state.

## Out of Scope for V0

- line comments
- exporting review comments
- GitHub/GitLab integration
- pull request review
- non-Git folder snapshots
- agent detection
- agent logs
- commit creation
- staging or unstaging
- editing files
