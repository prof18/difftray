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
- For UI-facing changes, launch the app locally once it is runnable and verify the affected workflow visually before handoff. Use automated app/browser tooling for screenshots and interaction checks where possible. If the app cannot be launched or visually verified, say exactly why in the handoff.

## Commands

When the project is scaffolded, all commands should be documented in `package.json` and mirrored in this file.

Project commands:

- `pnpm install`
- `pnpm build`
- `pnpm bench:performance`
- `pnpm dev`
- `pnpm format`
- `pnpm format:write`
- `pnpm package`
- `pnpm package:dev`
- `pnpm package:mac`
- `pnpm package:mac:dev`
- `pnpm release:mac`
- `pnpm release:dev:mac`
- `pnpm release:setup-app-ids`
- `pnpm release:setup-signing`
- `pnpm release:upload`
- `pnpm test`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test:visual`
- `pnpm check`
- `./ci.sh`

Use pnpm for dependency management once the project is scaffolded.

`pnpm check` delegates to `./ci.sh`.

## Before Handoff

Run `./ci.sh` before committing and before handoff. It is the full local CI gate:

- formatting
- lint
- typecheck
- unit tests
- integration tests
- renderer/app workflow tests
- visual verification for UI-facing changes
- docs checks, if configured

For visual changes, also run the app, exercise the changed path, inspect screenshots, and confirm the UI is not blank, clipped, overlapped, or unreadable in the relevant viewport/window sizes.

## Performance Gate

Run `pnpm bench:performance` before and after changes that can affect large-repo or large-diff behavior. This is required for changes touching:

- workspace loading, refresh, or project switching
- file selection, mark/unmark reviewed, review comments, or keyboard navigation
- Git diff loading, diff summaries, diff hashes, or review-state resolution
- renderer diff parsing/rendering, file-list rendering, or scroll restoration
- packaging/bundle changes that can affect renderer payload size

Do not keep a performance optimization only because it is theoretically better. Record the before/after benchmark outputs and keep the change only when the relevant benchmark metric improves or when a product tradeoff is explicitly accepted.

For small isolated copy, styling, docs, or test-only changes with no plausible performance impact, note that the performance gate was not applicable.

## UI Direction

Professional but opinionated. Avoid generic Electron app grayness. Keep the interface dense, calm, and optimized for repeated review work.

Do not use visible in-app explanatory text for obvious controls. Use familiar controls, icons, tooltips, and keyboard shortcuts.

Use CSS custom properties for theme tokens and CSS Modules for component styling. Use Radix UI only for primitives that need solid accessibility behavior, such as dialogs, menus, tooltips, and segmented controls. Use lucide-react icons for common actions.
