# Decision 0036: Full-Window Settings Navigation

## Status

Accepted

## Date

2026-08-30

## Decision

Present desktop Settings as a full-window workspace inside the main Difftray
window instead of a centered scrolling dialog. Keep the native window chrome and
replace the review workspace while Settings is open.

Use a persistent master navigation with four detail pages:

- General: appearance and default editor
- Review: diff display and review workflow preferences
- Repositories: approved search folders and scan management
- Phone companion: local server state, pairing, and paired-device management

Render only the selected detail page. Center the page content inside the available
detail area once the window is wider than the page's maximum readable width. Make
the sidebar a full-height surface whose background continues beneath the macOS
traffic lights. Place Back to review as the first sidebar row below those controls,
while the detail pane owns the centered Settings title. Give comparable selector
controls the compact 160-pixel width of the System appearance selector so their
right-hand edges form a stable control column across settings rows.

Persist app preferences immediately when a control changes. Do not present Save or
Cancel actions for ordinary settings. Serialize preference writes so rapid changes
cannot finish out of order, while keeping the controls responsive. Operational
actions such as enabling the companion server, pairing or revoking devices, and
scanning folders remain immediate.

Keep focused transient flows, including pairing and store QR codes, as modal
dialogs over the settings workspace. Closing Settings returns to the existing
review state without changing the selected project or file.

## Context

Decision 0018 chose one dialog because the first visible settings surface was
small. Settings now also contains repository discovery and a complete phone
companion management workflow. Those sections are dynamic and substantially
longer than simple preferences, so the original single-scroll presentation no
longer reflects the product surface.

The main application already has a minimum width suitable for a desktop
master/detail layout. Reusing the main window avoids separate-window lifecycle
and state synchronization while giving each workflow enough room.

## Consequences

Positive:

- Settings categories are easier to find and can grow independently.
- Repository and companion management no longer compete for space in a narrow
  popup.
- Settings content keeps balanced gutters on large desktop windows.
- Preference changes take effect and persist without a separate commit step.
- The sidebar reads as one continuous navigation surface from the top window edge.
- Back navigation remains usable below the native macOS window controls.
- Comparable selectors stay aligned even when their labels and contents differ.
- The review workspace stays mounted underneath Settings, preserving context on
  return.

Negative:

- Opening Settings temporarily replaces the full review workspace.
- Failed preference writes must restore persisted state and surface the error.
- Visual and interaction tests must navigate to the owning settings page before
  operating its controls.
