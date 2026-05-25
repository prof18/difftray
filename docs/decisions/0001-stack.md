# Decision 0001: Initial Stack

## Status

Accepted

## Decision

Use:

- Electron
- React
- TypeScript
- Vite
- `@pierre/diffs` for text diff rendering
- SQLite
- Git CLI
- Chokidar
- Vitest
- Playwright or equivalent Electron workflow testing

## Context

Difftray needs local filesystem access, Git execution, project watching, SQLite persistence, configurable external editor launching, and a high-quality web diff viewer.

Electron provides a pragmatic path because the diff viewer and UI can be built with web technologies while still accessing local desktop capabilities.

## Consequences

Positive:

- Fast path to macOS desktop app.
- Easy React integration.
- Diff rendering stays local, testable, and scoped to Difftray's review model.
- Node ecosystem works well for Git CLI, SQLite, and file watching.

Negative:

- Larger app bundle than native SwiftUI or Tauri.
- Requires careful IPC boundaries.
- Electron performance needs discipline.

## Notes

Tauri can be reconsidered later if app size becomes a serious problem, but it
adds Rust integration cost before the product is proven.

`@pierre/diffs` was adopted in
[Decision 0024](0024-diffs-rendering-engine.md), superseding the earlier
rejection in [Decision 0023](0023-pierre-diffs-rendering-engine.md).
