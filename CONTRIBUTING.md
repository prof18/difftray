# Contributing

Difftray is currently a private planning and implementation repository. These notes define the local contribution workflow so the project is ready for a future public release.

## Development Setup

Install dependencies with pnpm:

```sh
pnpm install
```

Run the desktop app:

```sh
pnpm dev
```

Run the full local gate before handing off changes:

```sh
pnpm check
```

## Quality Bar

- Keep Difftray focused on local diff review.
- Put business logic in testable packages outside Electron where practical.
- Follow hard TDD for core logic: write or update the failing test first.
- Keep TypeScript strict and avoid renderer access to Git, SQLite, Node APIs, or shell execution.
- Preserve Electron security defaults: no renderer Node integration, context isolation on, sandbox on, and narrow typed preload APIs.
- Update durable docs and ADRs when a change affects product scope, architecture, data model, testing, UX behavior, release policy, or stack decisions.

## Checks

Use the focused commands while developing:

```sh
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm test:visual
```

Use `pnpm check` before handoff. It runs formatting, lint, typecheck, unit tests, and the Electron visual smoke test.

## Visual Changes

For UI-facing changes, run the app or the visual smoke test and inspect the affected screenshot. The app must not be blank, clipped, overlapped, or unreadable in the relevant window size.

Visual smoke screenshots are generated under `artifacts/screenshots/`. Release screenshots that should be tracked live under `docs/screenshots/`.

## Git

Keep commits small and reviewable. Do not mix unrelated refactors with feature work. Avoid destructive Git operations unless they are explicitly requested.
