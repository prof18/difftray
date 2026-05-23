# AGENTS.md

## Project Rules

- Keep Difftray focused on local diff review. Do not turn it into an IDE, agent runner, PR platform, or merge tool without an explicit product decision.
- Prefer small, testable core modules over Electron-specific logic.
- Put business logic in packages that can be tested without launching Electron.
- Treat review invalidation as the product-critical behavior.
- Follow hard TDD for core logic: write or update failing tests before implementing behavior.
- Use TypeScript strictly.
- Avoid network calls in the app unless the user explicitly enables a future integration.

## Commands

When the project is scaffolded, all commands should be documented in `package.json` and mirrored in this file.

Expected future commands:

- `npm run test`
- `npm run test:watch`
- `npm run lint`
- `npm run typecheck`
- `npm run e2e`
- `npm run check`

## Before Handoff

Run the full local gate once it exists:

- formatting
- lint
- typecheck
- unit tests
- integration tests
- renderer/app workflow tests
- docs checks, if configured

## UI Direction

Professional but opinionated. Avoid generic Electron app grayness. Keep the interface dense, calm, and optimized for repeated review work.

Do not use visible in-app explanatory text for obvious controls. Use familiar controls, icons, tooltips, and keyboard shortcuts.
