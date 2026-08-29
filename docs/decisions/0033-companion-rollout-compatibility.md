# Decision 0033: Companion Rollout Compatibility

## Status

Accepted

## Context

Desktop releases can reach users before the corresponding mobile store update.
Keeping the companion protocol version unchanged proves wire-format compatibility,
but does not by itself preserve behavior when response timing or event delivery
changes.

The project-list endpoint now returns lightweight metadata immediately and computes
review summaries in the background. Already-shipped protocol-v1 mobile clients can
render a missing optional summary, but they can miss the completion event when it
finishes before their WebSocket authenticates.

## Decision

Within a companion protocol version, desktop releases must support all released
mobile clients for that version when desktop ships first. Timing and event-delivery
changes require a desktop-side compatibility path rather than relying only on a
future mobile recovery.

After an authenticated WebSocket sends `hello`, the desktop replays one encrypted
`workspace_changed` event. When a recent project exists, its ID is used; when the
list is empty, the stable reserved project ID
`__difftray_no_current_project__` is used. Protocol-v1 mobile clients already
invalidate the complete project list for that event, so old clients clear stale
cached projects and refetch even if they missed the original completion broadcast.
The wire schema and protocol version remain unchanged.

## Consequences

Positive:

- Desktop can ship the non-blocking project list before the mobile update.
- Existing protocol-v1 apps recover summaries without manual refresh.
- New mobile versions retain their additional client-side reconnect recovery.

Negative:

- Each authenticated WebSocket connection performs one lightweight project-list
  lookup and may cause one extra mobile refetch.
- The compatibility replay uses the existing workspace event because protocol v1
  has no project-list-specific event.
