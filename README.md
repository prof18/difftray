# Difftray

Difftray is a local-first macOS desktop app for reviewing Git changes across multiple projects. It tracks which files have been reviewed, automatically invalidates that review state when the relevant diff changes, and turns review comments into a ready-made prompt for your favorite agent or AI tool.

Keep track of what changed, what you already reviewed, and what needs another look.

Difftray is not an IDE, not an AI agent host, and not a pull request platform. It is a focused review desk for local Git changes.

## Current Features

- Keep several local repositories open in one review desk.
- See which projects still need attention without switching context.
- Review uncommitted work or branch changes with the same focused workflow.
- Move through changed files quickly, with noisy generated files out of the way by default.
- Read diffs in the shape that fits the moment: side-by-side, unified, expanded context, or focused on one side.
- Mark files reviewed and Difftray will flag them if they change later.
- Leave line-level review notes and copy a ready-made prompt to paste back into your favorite agent or AI tool.
- Drive review from the keyboard, command palette, or dense file list controls.
- Stay local by design: no fetching, pushing, staging, editing, or repository metadata writes.


## Screenshots

Review workflow with inline comments and a ready-made agent handoff prompt:

![Review workflow](docs/screenshots/review-workflow.png)

Reviewed-file drift notification after a diff changes:

![Reviewed-file drift notification](docs/screenshots/review-invalidated.png)

Expandable unchanged context in split diff mode:

![Expandable diff context](docs/screenshots/expanded-context.png)

Focused new-side diff view:

![Focused new-side diff](docs/screenshots/diff-focused-new.png)


## Install And Run

Prerequisites:

- Node.js 22 or newer
- pnpm 10.11.0 or newer
- Git available on `PATH`
- macOS for the intended desktop runtime

Install dependencies:

```sh
pnpm install
```

Run the desktop app in development:

```sh
pnpm dev
```

Build the app:

```sh
pnpm build
```

Run the full local CI gate before committing:

```sh
./ci.sh
```

`pnpm check` delegates to the same script.

Useful focused checks:

```sh
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm test:visual
```

## License

Apache-2.0.
