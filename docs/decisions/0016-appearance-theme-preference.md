# Decision 0016: Appearance Theme Preference

## Status

Accepted

## Date

2026-05-23

## Decision

Difftray will support an app-level appearance preference with three modes:

- System
- Light
- Dark

The preference is stored in the local `app_settings` table rather than project settings because appearance is a user-level app choice. The renderer resolves `system` through `prefers-color-scheme` and applies theme-specific CSS custom properties with `data-theme`.

## Context

The professional redesign established a restrained dark review console. Users may still expect a macOS-style app to follow system appearance and offer explicit light or dark overrides.

The sidebar should lean further into native macOS material: translucent surfaces, subtle blur, soft selected rows, and minimal boxed chrome.

## Consequences

Positive:

- Users can choose light, dark, or system appearance.
- Theme state is shared across projects.
- The UI can keep review-state colors consistent across appearances.

Negative:

- Visual verification needs to cover light mode regressions.
- Theme tokens must remain semantic to avoid hard-coded dark-only surfaces.
