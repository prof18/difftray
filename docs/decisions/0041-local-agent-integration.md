# 0041: Local agent integration through a bounded CLI protocol

Status: Accepted; implementation complete, M6 acceptance pending

## Context

Difftray is a local diff review application. An agent needs a way to inspect the same target and submit review feedback without reading the app database, relying on the current GUI tab, or running arbitrary commands through the desktop process.

## Decision

The first integration is a bundled `difftray` command-line client that talks to its own desktop app profile over an authenticated local Unix socket. The protocol is version 1 and is separate from the mobile companion protocol. Each connection carries one UTF-8 JSON object followed by LF. The server validates exact operation, envelope, selector, and payload shapes with bounded framing before dispatch. A transport request ID correlates one response; the submission requestId independently identifies an idempotent feedback batch. The CLI cannot assign human authorship.

The operations are `hello`, `open`, `review.inspect`, `review.files`, `review.file`, `review.feedback`, `review.export`, and `feedback.submit`. `open` intentionally changes the selected desktop target and accepts an explicit working-tree, branch, or commit selector. `review.inspect` may additionally use `selected`; it resolves that choice into a durable context and does not change the desktop selection. Subsequent reads and submissions address that context. Repository identity, target identity, a file manifest, and expiry govern context freshness. Feedback pages have their own snapshot version so edits during pagination fail explicitly.

Feedback has four scopes: a single line, an inclusive line range, a whole file, or an overall review note. Both line scopes can address either the additions or deletions side. Line and file submissions carry the selected file's diff hash. Overall notes carry a note version for compare-and-swap. A batch is atomic, bounded to 100 items, and preserves agent name and run ID with server-fixed agent attribution. Replaying the same submission requestId returns the original receipt; a different payload with the same ID is a conflict.

The CLI is local and review-focused. It does not offer SQL, shell execution, arbitrary file reads, code edits, merge operations, or remote agent transport. Protocol errors include distinct timeout, stale code, stale feedback, and note conflict cases so a caller can decide whether to retry or inspect again.

### Concurrent cold startup

The CLI serializes cold launches through a private, per-profile startup claim until authenticated readiness. Electron 44.3.0 on macOS was observed granting its native single-instance lock to multiple simultaneous cold processes. The native lock still handles ordinary app activation; the CLI guard prevents simultaneous automatic launches from racing storage initialization.

A populated directory is atomically renamed into the claim path. Each claim has a unique owner file; release and stale recovery remove only that owner file, then remove the directory only if empty. A dead caller's claim is recoverable after the existing 30-second startup window, allowing an already spawned GUI to finish starting. Live claims are never stolen, and waiting callers still share the original bounded connection deadline. No database access is added to the CLI.

## Consequences

The typed wire contract is tested without Electron. The bundled CLI, desktop socket transport, persisted context service, and atomic storage operations are implemented. Desktop preload and encrypted companion routes share that review storage. Companion clients negotiate attribution independently through a capability, preserving legacy response shapes.

The CLI's `doctor` command combines authenticated `hello` identity with local launcher diagnostics; those diagnostics are not additional wire `hello` fields. The portable agent skill resolves an explicit or standard app bundle and invokes its bundled CLI without requiring Node on PATH.

The M6 process acceptance matrix is implemented but its final gate and handoff remain pending. Actual agent-host sessions, signed arm64/x64 archives, and publication are separate user validation or authorization tasks. Changes to the wire schema require an explicit protocol version decision.
