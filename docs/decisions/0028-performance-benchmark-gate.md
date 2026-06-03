# Decision 0028: Performance Benchmark Gate

## Status

Accepted.

## Context

Difftray is built for local review loops where large generated changesets and
hundreds of changed files are common. Performance regressions in workspace load,
file selection, mark-reviewed navigation, comment saving, diff rendering, or
review-state resolution can make the app feel unreliable even when correctness
tests pass.

The project now has a repeatable large-changeset benchmark through
`pnpm bench:performance`.

## Decision

Use `pnpm bench:performance` as a conditional gate for performance-sensitive
work. It is required before and after changes touching:

- workspace loading, refresh, or project switching
- file selection, mark/unmark reviewed, review comments, or keyboard navigation
- Git diff loading, diff summaries, diff hashes, or review-state resolution
- renderer diff parsing/rendering, file-list rendering, or scroll restoration
- packaging/bundle changes that can affect renderer payload size

The full `./ci.sh` gate remains the default handoff and pre-commit gate.
Performance benchmarks are not run on every change because they are heavier and
are only meaningful for changes that can affect large-repo behavior.

Optimizations must be kept based on measured before/after results, not only on
theoretical improvement. If a change worsens a measured metric but is still
accepted for product reasons, the tradeoff must be called out explicitly.

## Consequences

Positive:

- Large-diff and large-repo regressions are easier to catch before release.
- Performance fixes can be judged against repeatable numbers.
- Agents and contributors have a clear rule for when benchmarks are required.

Negative:

- Performance-sensitive work takes longer because it requires a before and after
  benchmark.
- Benchmark results can still vary by machine load, so comparisons need judgment
  and should focus on the relevant metric rather than unrelated noise.
- The benchmark is conditional, so maintainers must still recognize when a
  change affects performance-sensitive surfaces.
