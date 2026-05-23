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

Branch review uses the merge base between the configured base ref and `HEAD`, then compares that merge base to `HEAD`.

Working tree review means the effective final working tree compared to `HEAD`. It includes staged changes, unstaged changes, mixed staged/unstaged files, deletions, renames reported by Git, and untracked files.

Difftray does not fetch implicitly. Base refs are local refs.

Default mode:

- if the working tree has changes, show working tree review
- if the working tree is clean and the branch is ahead of base, show branch review
- otherwise show an empty state

The user can manually switch between available review modes for a project. Switching mode selects a different review target and may change which files appear reviewed.

## File Handling

Changed files must include:

- modified files
- added files
- untracked files
- deleted files
- renamed files when Git reports rename information

Generated files should be hidden by default when detectable. Hidden generated files do not count toward progress.

Generated-file detection must be conservative in v0. Difftray should only auto-hide a file when there is strong evidence that it is generated, such as:

- a generated-file header in the first 20 KB
- a high-confidence generated extension or suffix
- a high-confidence generated path segment

Lockfiles must not be treated as generated files.

Lockfiles are visible and reviewable by default.

Binary files should appear in the file list with a graceful non-text preview state.

## Review State

Review is file-level only in v0.

When a file is marked reviewed, Difftray stores the exact diff hash for that file under the current review target.

A reviewed file remains reviewed only while its current diff hash equals the stored reviewed diff hash.

If the diff hash changes, the file becomes unreviewed.

If the diff hash later returns to a previously reviewed hash, the file can appear reviewed again for that same review target.

Changing the base branch creates or selects a different review target. Review state from the previous base is not deleted, but it is not applied to the new base.

When marking a file reviewed, the main process must recompute or verify the current diff hash before storing the review mark. If the displayed hash is stale, the mark is rejected and the file refreshes.

Paths are part of the diff hash. A rename is reviewable behavior and does not automatically inherit reviewed state from the old path. Once a specific rename diff is marked reviewed, it remains reviewed while that exact rename diff remains current.

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
- binary-file summary display
- symlink target display
- submodule pointer display
- mode-only change display

Large diff fallback applies when a single file diff exceeds either:

- 1 MB of patch text
- 5,000 changed lines

In fallback mode, the file still appears in the review list and can still be marked reviewed, but the UI should show a summary instead of rendering the full side-by-side diff by default.

## External Editor

Difftray does not edit code.

It must provide an "open in editor" action. The editor is configurable:

- system default
- VS Code
- Cursor
- Zed
- custom command template

Custom editor commands are stored as tokenized launch configs, not raw shell strings. The renderer may present a friendly template UI, but the main process launches an executable with an argument array.

Example custom command:

```text
code --goto {path}:{line}
```

Internal representation:

```json
{
  "command": "code",
  "args": ["--goto", "{path}:{line}"]
}
```

The main process expands only supported tokens and never executes editor commands through a shell.

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

## Styling

V0 uses CSS Modules and CSS custom properties rather than a full component theme framework.

Use Radix UI primitives only where the app benefits from built-in accessibility behavior.

Use lucide-react icons for standard actions.

The visual direction is professional but opinionated:

- dense review workspace
- strong project/sidebar hierarchy
- restrained graphite base palette
- warm amber review accent
- clear red/yellow/green status colors
- real bundled fonts, not system defaults
- JetBrains Mono for diff/code content

Font customization is out of scope for v0, but the styling architecture should allow future user-configurable UI and diff fonts.

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
