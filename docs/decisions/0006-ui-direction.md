# Decision 0006: UI Direction

## Status

Accepted

## Decision

Use CSS Modules with CSS custom properties for styling.

Use Radix UI primitives where accessible behavior is useful.

Use lucide-react for icons.

Do not use a broad component framework in v0.

## Context

Difftray should feel like a professional but opinionated macOS review tool. It should not look like a generic dashboard or default Electron app.

The UI needs dense project/file navigation, clear review state, keyboard-first workflows, and a strong visual hierarchy.

## Visual Direction

- Graphite workspace base.
- Warm amber accent for review actions and selected state.
- Green/yellow/red status colors for reviewed, changed-after-review, and errors.
- Bundled real fonts instead of system defaults.
- JetBrains Mono for diff/code content.
- Future user settings for UI font and diff font.
- Dense layout optimized for repeated review, not a marketing-style landing page.

Initial font candidates:

- IBM Plex Sans
- JetBrains Mono

## Consequences

Positive:

- Full visual control.
- Small styling stack.
- Accessible primitives where they matter.
- Avoids generic component-library aesthetics.

Negative:

- More custom component work.
- Requires discipline to keep styles consistent.
