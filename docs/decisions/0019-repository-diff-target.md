# Decision 0019: Repository Diff Target

## Status

Accepted

## Decision

Difftray supports switching each repository between working-tree review and branch
review from the repository review UI. The setting is repository-local, not part of
the global settings dialog. The UI treats the current repository state as implicit
and exposes only the comparison target: a branch selector labeled as the branch to
compare against, plus a reset action that clears the branch target and returns to
working-tree Git changes.

The selected branch base ref is stored on `projects.default_base_ref`. A null value
means the repository reviews working-tree changes. A non-null value means the
repository reviews current `HEAD` against `git merge-base <base-ref> HEAD`.

## Context

Working-tree review is the safest default for local agent and developer changes,
but some repositories need review state scoped to branch changes before a working
tree is dirty. Putting this in global settings would make it harder to use multiple
repositories with different bases in one window.

## Consequences

Positive:

- Branch review state remains isolated through the existing branch review target
  identity.
- Repositories can keep different base refs without global settings churn.
- All local and remote branch refs are listed directly in the repository UI.
- The settings dialog stays focused on app-wide review preferences.

Negative:

- If a saved base ref is deleted locally, that repository needs a new target selected
  before branch review can load again.
