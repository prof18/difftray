# AGENTS.md

## Project Rules

- Keep Difftray focused on local diff review. Do not turn it into an IDE, agent runner, PR platform, or merge tool without an explicit product decision.
- Prefer small, testable core modules over Electron-specific logic.
- Put business logic in packages that can be tested without launching Electron.
- Treat review invalidation as the product-critical behavior.
- Follow hard TDD for core logic: write or update failing tests before implementing behavior.
- Use TypeScript strictly.
- Avoid network calls in the app unless the user explicitly enables a future integration.
- Write down durable decisions as they are made. If a decision affects product scope, architecture, stack, data model, testing, UX behavior, or release policy, update the relevant doc and add or amend an ADR in `docs/decisions/` before considering the work complete.
- Keep Electron security defaults strict: no Node integration in the renderer, context isolation on, narrow typed preload APIs, and no shell execution from renderer-originated data.

## Commands

When the project is scaffolded, all commands should be documented in `package.json` and mirrored in this file.

Expected future commands:

- `pnpm install`
- `pnpm test`
- `pnpm test:watch`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm e2e`
- `pnpm check`

Use pnpm for dependency management once the project is scaffolded.

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

Use CSS custom properties for theme tokens and CSS Modules for component styling. Use Radix UI only for primitives that need solid accessibility behavior, such as dialogs, menus, tooltips, and segmented controls. Use lucide-react icons for common actions.
