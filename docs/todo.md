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
- [ ] Add CI workflow after repository is public or private remote exists.

## Core Implementation

- [ ] Implement Git repo detection.
- [ ] Implement worktree detection.
- [ ] Implement Git status parser.
- [ ] Implement working tree diff loader.
- [ ] Implement branch diff loader.
- [x] Implement per-file diff hash.
- [x] Implement generated-file detection.
- [x] Implement progress calculation.
- [x] Implement review target identity.
- [x] Implement review state lookup.
- [x] Implement review invalidation.

## Storage

- [ ] Add SQLite dependency.
- [ ] Create migrations.
- [ ] Persist projects.
- [ ] Persist project settings.
- [ ] Persist review targets.
- [ ] Persist review marks.
- [ ] Add storage tests.

## Desktop App

- [ ] Implement project open flow.
- [ ] Implement recent projects.
- [ ] Implement project sidebar.
- [ ] Implement changed file list.
- [ ] Implement diff viewer adapter.
- [ ] Implement review checkbox.
- [ ] Implement collapse-on-review.
- [ ] Implement keyboard shortcuts.
- [ ] Implement external editor command.
- [ ] Implement settings screen.

## V0 Release Prep

- [ ] Run full local gate.
- [ ] Add screenshots.
- [ ] Add install/run instructions.
- [ ] Add contribution docs.
- [ ] Add license.
- [ ] Create public repository when ready.
