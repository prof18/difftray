# Decision 0033: Bounded Repository Discovery and Opening

## Status

Accepted.

## Context

Difftray needs to find and open many local Git repositories and linked worktrees
without turning the desktop companion into a remote filesystem browser. Scanning
the whole machine would create unbounded I/O, privacy surprises, removable-volume
and permission failures, and unpredictable startup work. Eagerly loading every
opened repository would also make watcher, Git, renderer, and memory cost grow
with tab count.

The repository discovery spike compares marker-first traversal with invoking Git
in every visited directory. It also measures open-tab metadata queries across
increasing project counts through `pnpm bench:repositories`.

## Decision

- Traverse only roots explicitly approved by the desktop user. Never crawl the
  whole machine or start discovery automatically at application startup.
- Detect repository `.git` directories before invoking Git, and stop descending
  once a repository boundary is found. Treat `.git` file markers as linked
  worktree boundaries rather than catalog entries. Do not follow symlinks, prune
  known generated directories, and use Git only to validate marker candidates and
  canonical roots.
- Persist discovered repositories in a desktop-owned SQLite cache. Serve cached
  results immediately and refresh stale roots in bounded, cancellable background
  work after user interaction. A failed refresh retains the previous cache.
- Treat Git-recorded worktrees of a known repository as a separate exact
  discovery source. Re-list and revalidate their common Git directory before
  opening; they do not require an approved scan root.
- Expose worktree availability as a bounded batch companion endpoint. The
  desktop normalizes each project's `commonGitDir` before deduplicating
  repository probes, limits both discovery and listing work to four concurrent
  operations, and returns `404 not_found` for an unknown or stale project
  before invoking Git. Older clients and new mobile clients do not proactively
  fan out when the batch endpoint returns `404`: mobile exposes a worktree entry
  for current projects and loads only the selected project's list. Legacy
  per-project listing remains available for compatibility.
- Accept only opaque server-issued catalog or worktree IDs from paired phones.
  The desktop resolves and revalidates those IDs. Remote callers never supply an
  authoritative filesystem path.
- Route chooser, drop, Quick Open, boot, catalog, and companion requests through
  one repository-open service. Batch registration preserves input order, focuses
  one repository, and eagerly loads only that active workspace.
- Open discovered Quick Open and mobile catalog entries individually. Reserve
  multi-selection for explicit chooser or drop imports; the companion protocol
  retains its bounded batch envelope for compatibility and trusted callers.
- Keep inactive open projects metadata-only: one active watcher, bounded summary
  concurrency, and budgeted least-recently-used workspace/diff caches.
- Advertise pending background summaries only to clients that opt into
  `project-summary-state-v1`. Mobile polls the project list only while that
  explicit state is true; a missing summary alone is not treated as pending
  because older desktops can legitimately omit one after loading settles.
  Clients that do not advertise this capability receive complete summaries
  synchronously, preserving the behavior expected by already-published mobile
  versions that cannot poll for background completion.

## Consequences

Positive:

- Discovery work is explainable, cancellable, cacheable, and bounded by user
  authorization.
- Mobile repository opening expands capability without granting arbitrary file
  browsing.
- Large open sets can remain responsive because inactive tabs do not multiply
  hot Git or watcher work.
- Marker-first and open-count scale curves are repeatable performance evidence.

Negative:

- Users must approve search roots before unopened repositories appear remotely.
- Cached entries can temporarily be stale and require availability states.
- The implementation needs catalog migrations, scan coordination, revalidation,
  and explicit compatibility fallbacks for older desktop versions.
