# Decision 0039: Repository Drop Overlay Lifecycle

## Status

Accepted

## Date

2026-10-10

## Context

An external folder drag can leave the repository drop overlay stuck when Chromium
omits a matching leave event for an earlier, still-connected target. Matching
individual target events alone cannot reliably identify the end of a drag.

## Decision

Keep repository drag-and-drop, with a decorative overlay that does not intercept
pointer events. Clear all hover state when a drag leaves the window, regardless
of unmatched targets. Preserve the overlay while moving between targets inside
the window.

Also clear stale hover state on Escape, window blur, drag end, or resumed mouse
movement. Native drag operations suppress normal mouse events, so their return
provides recovery when an external drag ends without a final drag event. These
dismissal paths do not open repositories or alter the current review.

## Verification

Unit tests cover unmatched connected targets, state reset, cancellation and
Escape. Electron visual smoke tests cover internal transitions, window exit and
each dismissal event against the rendered overlay.

## Consequences

Folder drops keep the existing validated repository-opening flow. The overlay
cannot block pointer interaction, and stale drag state has independent recovery
paths without a timeout that would hide legitimate stationary drags.
