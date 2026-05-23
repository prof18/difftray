# Decision 0005: Package Manager And Monorepo Tooling

## Status

Accepted

## Decision

Use pnpm workspaces.

Do not add Turborepo, Nx, Lage, or another monorepo task runner in v0.

## Context

Difftray benefits from separating desktop UI, core review logic, Git integration, and storage. A workspace layout gives those boundaries without forcing a heavy build system too early.

## Consequences

Positive:

- Fast dependency installation.
- Good workspace support.
- Low setup overhead.
- Enough structure for testable packages.

Negative:

- Cross-package task orchestration stays manual at first.
- A future task runner may be needed if the repo grows.

## Notes

The initial repo should expose simple root scripts such as:

- `pnpm test`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm check`
