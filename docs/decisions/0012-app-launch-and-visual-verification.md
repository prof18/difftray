# Decision 0012: App Launch And Visual Verification

## Status

Accepted

## Decision

Once the desktop app is runnable, UI-facing changes must be verified by launching the app locally and checking the affected workflow visually before handoff.

Use automated Electron app testing or browser/app automation to interact with the app and capture or inspect screenshots where possible.

## Context

Difftray is a desktop review tool. A large part of the product quality depends on layout, file-list density, keyboard flow, diff rendering, and state visibility. Unit tests and integration tests cannot reliably catch blank windows, clipped labels, overlapping panels, unreadable contrast, or broken responsive behavior.

## Verification Expectations

For UI-facing changes, verify:

- the app launches
- the changed screen or workflow is reachable
- the relevant interaction works
- the UI is not blank
- text is not clipped or overlapping
- controls are visible and usable
- diff content renders when applicable
- keyboard navigation still works when affected

For broad layout changes, check at least:

- compact window
- normal desktop window
- wide desktop window

## Commands

The scaffold should provide:

- `pnpm dev` for local development launch
- `pnpm e2e` for app workflow tests
- `pnpm test:visual` for visual or screenshot-based checks once available

Automated app workflow and visual tests may launch the Electron window with
`DIFFTRAY_WINDOW_PRESENTATION=inactive` to avoid stealing focus from the user's
current workspace. This still shows the window and preserves screenshot-based
verification. Use `DIFFTRAY_WINDOW_PRESENTATION=active` for focused manual
debugging.

## Handoff Policy

If visual verification was required and completed, mention it in the handoff.

If visual verification was required but could not be completed, say exactly why and describe the residual risk.

## Consequences

Positive:

- Reduces visually broken handoffs.
- Forces app launchability to stay healthy.
- Catches layout regressions early.

Negative:

- UI changes take longer to verify.
- Screenshot/app automation setup becomes part of the v0 engineering work.
