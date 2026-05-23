# Todo

## Now

- [x] Pick working stack.
- [x] Pick working name: Difftray.
- [x] Create local private planning repo.
- [x] Capture product brief.
- [x] Capture v0 specification.
- [x] Capture architecture.
- [x] Capture data model.
- [x] Capture testing strategy.

## Next Planning Decisions

- [x] Pick license for eventual open-source release: Apache-2.0.
- [x] Decide package manager: pnpm.
- [x] Decide monorepo tooling: pnpm workspaces only for v0.
- [x] Decide styling approach: CSS Modules, CSS custom properties, Radix primitives where useful.
- [x] Decide initial icon/visual identity direction: graphite workspace, amber review accent, JetBrains Mono for diffs, real bundled fonts, lucide icons.
- [x] Decide exact generated-file detection rules for v0: conservative high-confidence detection only.
- [x] Decide large-diff thresholds: fallback above 1 MB patch text or 5,000 changed lines.
- [x] Decide whether v0 supports branch review or starts with working tree only: include working tree and branch review in v0.

## Scaffolding

- [x] Scaffold Electron + React + TypeScript + Vite.
- [x] Add strict TypeScript.
- [x] Add Vitest.
- [x] Add Playwright or Electron app test harness.
- [x] Add ESLint.
- [x] Add Prettier.
- [x] Add local CI script.

## Core Implementation

- [x] Implement Git repo detection.
- [x] Implement worktree detection.
- [x] Implement Git status parser.
- [x] Implement working tree diff loader.
- [x] Implement branch diff loader.
- [x] Implement per-file diff hash.
- [x] Implement generated-file detection.
- [x] Implement progress calculation.
- [x] Implement review target identity.
- [x] Implement review state lookup.
- [x] Implement review invalidation.

## Storage

- [x] Add SQLite dependency/runtime.
- [x] Create migrations.
- [x] Persist projects.
- [x] Persist project settings.
- [x] Persist review targets.
- [x] Persist review marks.
- [x] Add storage tests.

## Desktop App

- [x] Implement project open flow.
- [x] Implement recent projects.
- [x] Implement project sidebar.
- [x] Implement changed file list.
- [x] Implement diff viewer adapter.
- [x] Implement review checkbox.
- [x] Implement collapse-on-review.
- [x] Implement keyboard shortcuts.
- [x] Implement external editor command.
- [x] Implement settings screen.

## V0 Release Prep

- [x] Run full local gate.
- [x] Add screenshots.
- [x] Add install/run instructions.
- [x] Add contribution docs.
- [x] Add license.
- [ ] Create public repository when ready.
