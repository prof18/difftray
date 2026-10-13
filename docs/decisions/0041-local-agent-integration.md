# 0041: Local agent integration through a bounded CLI protocol

Status: Accepted for implementation

## Context

Difftray is a local diff review application. An agent needs a way to inspect the same target and submit review feedback without reading the app database, relying on the current GUI tab, or running arbitrary commands through the desktop process.

## Decision

The first integration is a bundled `difftray` command-line client that talks to its own desktop app profile over an authenticated local Unix socket. The protocol is version 1 and is separate from the mobile companion protocol. Each connection carries one UTF-8 JSON object followed by LF. The server validates exact operation, envelope, selector, and payload shapes with bounded framing before dispatch. A transport request ID correlates one response; the submission requestId independently identifies an idempotent feedback batch. The CLI cannot assign human authorship.

The operations are `hello`, `open`, `review.inspect`, `review.files`, `review.file`, `review.feedback`, `review.export`, and `feedback.submit`. `open` intentionally changes the selected desktop target and accepts an explicit working-tree, branch, or commit selector. `review.inspect` may additionally use `selected`; it resolves that choice into a durable context and does not change the desktop selection. Subsequent reads and submissions address that context. Repository identity, target identity, a file manifest, and expiry govern context freshness. Feedback pages have their own snapshot version so edits during pagination fail explicitly.

Feedback has four scopes: a line on the additions side, a line on the deletions side, a whole file, or an overall review note. Line and file submissions carry the selected file's diff hash. Overall notes carry a note version for compare-and-swap. A batch is atomic, bounded to 100 items, and preserves agent name and run ID with server-fixed agent attribution. Replaying the same submission requestId returns the original receipt; a different payload with the same ID is a conflict.

The CLI is local and review-focused. It does not offer SQL, shell execution, arbitrary file reads, code edits, merge operations, or remote agent transport. Protocol errors include distinct timeout, stale code, stale feedback, and note conflict cases so a caller can decide whether to retry or inspect again.

## Consequences

The typed wire contract can be tested without Electron. The desktop transport and operations will be wired in later tasks; this decision does not claim that CLI review commands are runnable yet. Changes to the wire schema require an explicit protocol version decision.
