# Difftray

Difftray is a local-first macOS desktop app for reviewing Git changes across multiple projects. It tracks which files have been reviewed and automatically invalidates that review state when the relevant diff changes.

This repository is private while the product shape is being defined. The intended long-term direction is an open-source macOS app.

## Product Promise

Keep track of what changed, what you already reviewed, and what needs another look.

Difftray is not an IDE, not an AI agent host, and not a pull request platform. It is a focused review desk for local Git changes.

## Initial Stack

- Electron
- React
- TypeScript
- Vite
- `@pierre/diffs` from https://diffs.com for diff rendering
- SQLite for local app state
- Git CLI integration
- Chokidar for file watching
- Vitest for unit/integration tests
- Playwright for renderer and app workflow tests

## Documentation

- [Product Brief](docs/product-brief.md)
- [V0 Specification](docs/spec-v0.md)
- [Architecture](docs/architecture.md)
- [Data Model](docs/data-model.md)
- [Testing Strategy](docs/testing-strategy.md)
- [Roadmap](docs/roadmap.md)
- [Todo](docs/todo.md)
- [Naming Notes](docs/naming.md)
- [Decisions](docs/decisions)

## Core Principles

- Local-first by default.
- Review state is local only.
- Git repos and worktrees are first-class.
- File-level review is the v0 unit of completion.
- Exact diff changes invalidate reviewed state.
- The app should be keyboard-friendly from the beginning.
- Development should follow hard TDD for core behavior.

## Current Status

Planning and specification phase. No application code has been scaffolded yet.
