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

### review_targets

```sql
review_targets (
  id text primary key,
  project_id text not null,
  mode text not null,
  base_ref text,
  head_ref text,
  head_kind text not null,
  created_at text not null,
  last_used_at text not null,
  unique(project_id, mode, base_ref, head_ref, head_kind)
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
  editor_command text,
  updated_at text not null
)
```

### app_settings

```sql
app_settings (
  key text primary key,
  value text not null,
  updated_at text not null
)
```

## Diff Hashing

The diff hash identifies the exact reviewable content for a file under a review target.

Inputs should include:

- review target mode
- base identity where applicable
- normalized file status
- current path
- previous path for rename
- normalized patch content
- binary marker when no textual patch exists

Use a stable cryptographic hash such as SHA-256.

## Rename Behavior

When Git reports a rename, Difftray should preserve review intent when the diff hash matches the reviewed content.

For v0, review identity is still path-oriented. The model stores `previous_path` so the UI can explain the rename.

Future work may add a stronger file identity abstraction if rename edge cases become painful.

## Generated Files

Generated-file detection is derived state, not a persisted review mark.

Sources can include:

- filename conventions
- generated file headers
- common generated directories
- project-level ignore patterns in future versions

Hidden generated files do not count toward progress.

## Important Invariant

A file is considered reviewed if and only if there is a `review_marks` row for the current review target whose `reviewed_diff_hash` equals the file's current diff hash.
