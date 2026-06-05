# Decision 0019: Repository Diff Target

## Status

Accepted

## Decision

Difftray supports switching each repository between working-tree review, branch
review, and single-commit review from the repository review UI. The setting is
repository-local, not part of the global settings dialog. The UI treats the
current repository state as implicit for working-tree and branch review, and
exposes a compact target selector with working-tree changes, branch refs, and a
bounded list of recent commits. The reset action clears the selected target and
returns to working-tree Git changes.

The selected target mode is stored on `projects.default_diff_target_mode`.
Branch review stores its base ref on `projects.default_base_ref` and reviews
current `HEAD` against `git merge-base <base-ref> HEAD`. Commit review stores
the selected commit ref on `projects.default_commit_ref` and reviews that
commit's own patch, from its first parent to the commit. Root commits use Git's
empty tree as the parent side.

The commit selector initially lists only the latest 25 commits in explicit Git
date order. Difftray must not load an unbounded commit history into the renderer
dropdown. If the currently selected commit falls outside that recent window, the
selector keeps it available with a selected label rather than treating it as part
of the date-ordered recent list. Search or pagination can be added later on top of
the bounded recent-commit API.

## Context

Working-tree review is the safest default for local agent and developer changes,
but some repositories need review state scoped to branch changes before a working
tree is dirty. Putting this in global settings would make it harder to use multiple
repositories with different bases in one window.

## Consequences

Positive:

- Branch review state remains isolated through the existing branch review target
  identity.
- Commit review state is isolated through commit and parent commit identity.
- Repositories can keep different base refs without global settings churn.
- All local and remote branch refs are listed directly in the repository UI, while
  commits are capped to a recent window.
- The settings dialog stays focused on app-wide review preferences.

Negative:

- If a saved base ref is deleted locally, that repository needs a new target selected
  before branch review can load again.
- If a saved commit ref is no longer available locally, that repository needs a
  new target selected before commit review can load again.
