# Decision 0009: Quality Gate

## Status

Accepted

## Decision

Use strict TypeScript, ESLint, Prettier, Vitest, and Playwright or an equivalent Electron workflow test harness.

The root `./ci.sh` script is the local CI gate. It runs:

- format check
- lint
- typecheck
- unit tests
- integration tests
- app workflow tests where feasible

The root `pnpm check` command delegates to `./ci.sh`. Contributors and agents must run `./ci.sh` before committing.

## Context

Difftray's most important behavior is correctness of review state. A stale reviewed checkbox would damage trust in the app.

The core logic must be testable without Electron. UI workflow tests are still needed for project opening, reviewing, invalidation, and persistence.

## Consequences

Positive:

- Review invariants are protected.
- Refactors stay safer.
- Electron-specific code remains thinner.
- The pre-commit and handoff gate is one command.

Negative:

- More setup work before visible UI progress.
- Some app workflow tests may be slower than unit tests.
- Hosted CI still needs a future repository/remote decision.

## Notes

Core behavior should be developed with hard TDD. UI polish can be more iterative, but review-state behavior must have tests before implementation.
