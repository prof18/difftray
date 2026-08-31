# 0035 Desktop Window Bounds Persistence

Date: 2026-08-30

## Status

Accepted

## Context

Difftray created every desktop window at the fixed default size of 1220 by 820
pixels and let Electron choose its position. Closing and reopening the app therefore
discarded the size and position chosen by the user.

Window geometry is local application-shell state rather than review data or a
user-facing setting that needs to participate in storage migrations.

## Decision

The Electron main process persists the last normal window bounds and whether the
window is maximized or full screen in a versioned JSON file inside the active app
variant's user-data directory. Production and development profiles therefore retain
independent window state.

Move and resize events are coalesced before writing so interactive window changes do
not repeatedly block Electron's main process. Presentation changes are written
immediately, with a final synchronous write when the window closes. Saving normal
bounds preserves the useful restored rectangle behind maximized and full-screen
presentation, while restoring that presentation mode separately.

Saved bounds are used only when they are valid integers and at least 100 by 100 pixels
of the window remain inside the work area of a connected display. Missing, malformed,
unsupported, or unreachable state falls back to the existing default size and
Electron-selected position.

## Consequences

- The app reopens at the user's previous size and position.
- A maximized or full-screen window reopens in the same presentation mode.
- Disconnecting or rearranging displays cannot strand the app window entirely
  off-screen.
- Window geometry does not expand the SQLite domain schema or renderer IPC surface.
- Future changes to the file format must increment and explicitly migrate or reject
  its version.
