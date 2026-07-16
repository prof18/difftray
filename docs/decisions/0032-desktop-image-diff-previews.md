# Decision 0032: Desktop Image Diff Previews

## Status

Accepted

## Decision

The desktop review surface renders static PNG, JPEG, and WebP binary changes as
lazy image previews. It reuses the bounded Git image snapshot loader introduced
for the mobile companion rather than adding image bytes to workspace or file-diff
payloads.

The renderer requests only the visible side through a narrow typed preload IPC
method. Split view requests and displays Before and After side by side; the
existing old-side and new-side focus controls request only the chosen side. Added
and deleted files request their sole available side.

The complete existing binary summary remains the fallback when any requested side
is unsupported, animated, oversized, malformed, or unavailable. Image responses are
accepted only when their diff hash, review target, and requested side match the
current review surface before and after the bounded snapshot is loaded.

## Context

The companion server already exposes bounded raster snapshots for mobile image
diffs, but the desktop renderer still showed every binary change as text metadata.
Desktop can use the same Git-backed loader directly through Electron IPC without
requiring the companion server to be enabled or making a network request.

Keeping image bytes out of the normal diff payload preserves lazy file loading and
avoids paying the base64 and decode cost for files the reviewer never opens.
The main process checks the requested and fingerprinted snapshot sizes before
computing the current per-file hash, and uses the workspace's known previous path to
keep renamed-image validation path-scoped.

## Consequences

Positive:

- UI and asset changes can be reviewed visually on desktop and mobile.
- The desktop Old/Both/New control has the same meaning for text and image diffs.
- Existing byte and pixel limits continue to bound memory and decode work.
- Oversized files fall back before repeated content hashing, including in Both mode.
- Unsupported binary content keeps a tested, readable fallback.

Negative:

- Showing both sides can temporarily hold two base64-encoded images in the
  renderer.
- Desktop preload and renderer types duplicate the small image response contract
  at the Electron trust boundary.
