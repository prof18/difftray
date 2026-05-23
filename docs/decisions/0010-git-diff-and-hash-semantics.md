# Decision 0010: Git Diff And Hash Semantics

## Status

Accepted

## Decision

Define Git comparison, file identity, diff hashing, binary handling, rename behavior, and mark-reviewed race handling before implementation starts.

## Branch Review

Branch review compares the current branch against the merge base with the configured base ref:

```text
merge-base(base_ref, HEAD) -> HEAD
```

This answers: "what did this branch introduce since it diverged from base?"

Difftray must store both ref names and resolved commit SHAs:

- `base_ref_name`
- `base_ref_sha`
- `head_ref_name`
- `head_ref_sha`
- `merge_base_sha`

Difftray never fetches implicitly. If `origin/main` is stale locally, branch review uses the local `origin/main` ref.

If the base ref moves, the resolved SHA changes and the review target identity changes.

## Working Tree Review

Working tree review compares the effective current working tree to `HEAD`.

It includes:

- staged tracked changes
- unstaged tracked changes
- mixed staged and unstaged changes in the same file
- untracked files
- deletions
- renames reported by Git

V0 does not split staged and unstaged changes. A file is reviewed as its final working-tree content compared to `HEAD`.

Expected Git inputs:

```text
git status --porcelain=v2 -z
git diff --patch --find-renames HEAD
git ls-files --others --exclude-standard -z
```

Untracked files are synthesized into added-file diffs or file snapshots because normal `git diff HEAD` does not include them.

## Diff Fingerprint

The review hash is a versioned fingerprint, not an incidental raw patch hash.

V0 fingerprint prefix:

```text
difftray-file-diff-v1
```

Hash algorithm:

```text
SHA-256
```

The canonical fingerprint input includes:

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

Text payloads normalize line endings to LF before hashing.

Path strings are hashed as UTF-8 after Git path decoding.

## Binary Files

Binary files must not hash only a marker such as "binary changed."

For working-tree binary content, hash:

- SHA-256 of file bytes
- byte size

For committed binary content, prefer:

- Git object id
- byte size, when available

For binary delete, hash the old object identity.

For binary add/untracked, hash the new content identity.

## Rename Behavior

Paths are part of the diff fingerprint.

Difftray does not automatically inherit reviewed state from an old path to a new path.

A rename is reviewable behavior:

- if `old_path -> new_path` is marked reviewed, it stays reviewed while that exact rename diff fingerprint remains current
- if the path changes again, the fingerprint changes and review is invalidated
- a pure rename still requires review once

This is stricter than path-independent content review, but it avoids hiding meaningful file movement.

## Mark-Reviewed Race Handling

The main process must verify the current diff hash at the moment a file is marked reviewed.

Flow:

1. Renderer sends project id, review target id, file path, and displayed diff hash.
2. Main process reloads or recomputes the current file diff hash.
3. If the current hash equals the displayed hash, the review mark is stored.
4. If the current hash differs, the mark is rejected and the renderer refreshes the file.

This prevents a watcher debounce from allowing stale UI to mark an already-changed file as reviewed.

## Edge Case Policies

V0 classifies these edge cases explicitly:

- symlinks are reviewable using link target changes
- submodules are reviewable using old/new commit pointers
- mode-only changes are reviewable
- case-only renames are reviewable when Git reports them
- paths with spaces, quotes, unicode, and unusual bytes must be handled through NUL-delimited Git output where possible
- LFS pointer files are treated as text unless Git reports binary content

## Consequences

Positive:

- Review state has a concrete invariant.
- Branch review remains stable and explainable.
- Binary changes cannot accidentally remain reviewed.
- Race handling protects user trust.

Negative:

- More core logic before UI work.
- Untracked file diff synthesis needs careful tests.
- Some rename cases are stricter than users may expect.
