# Roadmap

## Phase 0: Planning

- Define product scope.
- Pick working name.
- Document v0 spec.
- Define architecture.
- Define data model.
- Define TDD strategy.

## Phase 1: Core Prototype

- Scaffold Electron + React + TypeScript + Vite.
- Add test runner and strict TypeScript config.
- Implement Git adapter with temp-repo tests.
- Implement review target model.
- Implement diff hashing.
- Implement SQLite storage.
- Implement review invalidation.

## Phase 2: First Usable Desktop App

- Open local Git projects.
- Persist recent projects.
- Show project sidebar.
- Show changed file list.
- Render side-by-side diffs.
- Mark files reviewed.
- Auto-unreview changed files.
- Collapse reviewed files.
- Keyboard navigation.
- Open file in configured editor.

## Phase 3: Polished V0

- Generated-file detection.
- Large diff fallback.
- Binary file fallback.
- Worktree polish.
- Settings screen.
- Empty/error states.
- App icon placeholder.
- Packaging for local macOS use.

## Phase 4: Public Open Source Prep

- Choose license.
- Rename package identifiers if needed.
- Add contribution guide.
- Add security policy.
- Add issue templates.
- Add screenshots.
- Add release workflow.
- Create public GitHub repository.

## Later

- Commit range review.
- Unified diff mode.
- Line comments.
- Export review comments as agent-ready text.
- Custom generated-file rules.
- GitHub/GitLab integrations.
- Snapshot mode for non-Git folders.
- Project grouping.
- Review summaries.
