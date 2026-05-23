# Decision 0009: Quality Gate

## Status

Accepted

## Decision

Use strict TypeScript, ESLint, Prettier, Vitest, and Playwright or an equivalent Electron workflow test harness.

The root `pnpm check` command should eventually run:

- format check
- lint
- typecheck
- unit tests
- integration tests
- app workflow tests where feasible

## Context

Difftray's most important behavior is correctness of review state. A stale reviewed checkbox would damage trust in the app.

The core logic must be testable without Electron. UI workflow tests are still needed for project opening, reviewing, invalidation, and persistence.

## Consequences

Positive:

- Review invariants are protected.
- Refactors stay safer.
- Electron-specific code remains thinner.

Negative:

- More setup work before visible UI progress.
- Some app workflow tests may be slower than unit tests.

## Notes

Core behavior should be developed with hard TDD. UI polish can be more iterative, but review-state behavior must have tests before implementation.
