# Data Model

SQLite is the local source of truth for app settings, projects, review targets, and review marks.

This is an initial model, not final schema syntax.

## Tables

### projects

```sql
projects (
  id text primary key,
  name text not null,
  path text not null unique,
  default_base_ref text,
  created_at text not null,
  updated_at text not null,
  last_opened_at text
)
```

`default_base_ref` is the repository-local diff target selected from the review UI.
When it is null, Difftray reviews working-tree Git changes. When it is set,
Difftray reviews the current `HEAD` branch against the merge base with that base ref.

### review_targets

```sql
review_targets (
  id text primary key,
  project_id text not null,
  mode text not null,
  base_ref_name text,
  base_ref_sha text,
  head_ref_name text,
  head_ref_sha text,
  merge_base_sha text,
  head_kind text not null,
  created_at text not null,
  last_used_at text not null,
  unique(project_id, mode, base_ref_name, base_ref_sha, head_ref_name, head_ref_sha, merge_base_sha, head_kind)
)
```

`mode` examples:

- `working_tree`
- `branch`
- future: `commit_range`

`head_kind` examples:

- `working_tree`
- `ref`
- future: `commit`

For working tree review:

- `mode` is `working_tree`
- `head_kind` is `working_tree`
- `head_ref_name` should be the current branch name when available
- `head_ref_sha` should be `HEAD`
- `base_ref_name`, `base_ref_sha`, and `merge_base_sha` are null

For branch review:

- `mode` is `branch`
- `base_ref_name` is the configured local base ref
- `base_ref_sha` is the resolved base commit
- `head_ref_name` is the current branch name when available
- `head_ref_sha` is the resolved `HEAD`
- `merge_base_sha` is `git merge-base base_ref HEAD`

### review_marks

```sql
review_marks (
  id text primary key,
  project_id text not null,
  review_target_id text not null,
  path text not null,
  previous_path text,
  reviewed_diff_hash text not null,
  reviewed_at text not null,
  updated_at text not null,
  unique(review_target_id, path, reviewed_diff_hash)
)
```

This allows a file to become reviewed again if its diff returns to a previously reviewed hash.

### project_settings

```sql
project_settings (
  project_id text primary key,
  show_generated_files integer not null default 0,
  editor_launch_config_json text,
  file_list_width integer not null default 340,
  file_list_collapsed integer not null default 0,
  default_diff_mode text not null default 'split',
  hide_whitespace_only_changes integer not null default 0,
  auto_collapse_hunks_over integer not null default 120,
  notify_on_drift integer not null default 1,
  review_reset_trigger text not null default 'diff_content',
  updated_at text not null
)
```

Only repository-local workspace layout is actively stored per repository: file-list
width and collapsed state. The older review/editor columns remain in the table for
compatibility with existing databases, but new review behavior is app-level.

### app_settings

```sql
app_settings (
  key text primary key,
  value text not null,
  updated_at text not null
)
```

App settings store user-level preferences that should follow the user across
repositories:

- `theme_mode`
- `editor_launch_config_json`
- `default_diff_mode`
- `show_generated_files`
- `hide_whitespace_only_changes`
- `auto_collapse_hunks_over`
- `notify_on_drift`
- `review_reset_trigger`

Installed editor presets are not stored as separate rows. Selecting a preset writes
the existing `editor_launch_config_json` command/args shape. The Electron main
process only launches stored configs that still match a built-in preset; stale,
malformed, or free-form configs are ignored.

If an existing database has no app-level review settings yet, Difftray seeds the
runtime defaults from the most recently updated legacy `project_settings` row. Once
app settings are saved, app-level values are the source of truth.

## Diff Hashing

The diff hash identifies the exact reviewable content for a file under a review target.

The hash is a versioned SHA-256 fingerprint with prefix:

```text
difftray-file-diff-v1
```

Inputs include:

- fingerprint version
- review target identity
- normalized file status
- old path, when applicable
- new path
- old mode, when available
- new mode, when available
- content kind: `text`, `binary`, `symlink`, `submodule`, or `mode_only`
- canonical textual diff payload, for text
- binary/content fingerprint payload, for binary
- symlink target payload, for symlink changes
- submodule commit payload, for submodule changes

Use a stable cryptographic hash such as SHA-256.

Text payloads normalize line endings to LF before hashing.

Text diffs may also carry old and new file snapshot text so the UI can expand
unchanged context omitted from the compact patch. Snapshot text is display-only
context and is intentionally excluded from the diff hash.

Binary files must include real content identity. Working-tree binary content is fingerprinted with SHA-256 of file bytes plus byte size. Committed binary content should use Git object id plus byte size when available.

## Rename Behavior

For v0, review identity is path-sensitive. The model stores `previous_path` so the UI can explain the rename.

A pure rename does not automatically inherit review from the old path. The rename itself must be reviewed once, then remains reviewed while the exact rename diff fingerprint remains current.

Future work may add a stronger file identity abstraction if rename edge cases become painful.

## Generated Files

Generated-file detection is derived state, not a persisted review mark.

Sources can include:

- filename conventions
- generated file headers
- common generated directories
- project-level ignore patterns in future versions

Hidden generated files do not count toward progress. Generated-file visibility is an
app-level review preference.

## Important Invariant

A file is considered reviewed if and only if there is a `review_marks` row for the current review target whose `reviewed_diff_hash` equals the file's current diff hash.

When the user marks a file reviewed, the main process must verify that the currently computed diff hash still equals the hash displayed by the renderer before writing the review mark.
