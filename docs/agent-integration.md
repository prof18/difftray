# Agent integration

Difftray's local agent protocol is version 1, separate from the companion protocol. The bundled CLI now connects to a private local socket, starts its own desktop bundle when necessary, and opens an exact repository worktree. Review reads, exports, and attributed feedback submission use explicit persisted contexts.

A connection exchanges exactly one UTF-8 JSON object followed by LF. Requests carry `version`, transport `id`, a 32-byte hex `token`, `method`, and method-specific `params`. Responses carry the same version and transport ID, then either `ok: true` with a validated result or `ok: false` with `{ code, message, retryable }`. The separate feedback `submission.requestId` identifies an idempotent batch. Frames are bounded to 1 MiB for requests and 16 MiB for responses. Unknown properties, malformed UTF-8, unknown methods or enum values, and unbounded fields are rejected.

`open` takes `{ repoPath, selector }` and intentionally selects a desktop target. Its selector is `working-tree`, `branch` with `base`, or `commit` with `commit`. `review.inspect` takes the same parameters and can also specify `selected`; it resolves that selection into a context without changing the GUI. `review.files`, `review.file`, `review.feedback`, and `review.export` take a `contextId`. File and feedback reads support bounded pagination. A context records the canonical worktree and Git identity, target, file manifest, snapshot hash, and expiry. Later operations must reject stale code or expired contexts instead of silently switching targets.

`feedback.submit` accepts an actor name and run ID, a request ID, and 1–100 items. Each item is an additions-line, deletions-line, file, or overall note. Line and file items carry the context file path and diff hash; line positions are positive safe integers. An overall item carries the expected note version. Bodies are nonblank and at most 10,000 Unicode code points. The server fixes attribution to agent; callers cannot claim human authorship. Feedback pagination uses a separate feedback version and reports `stale_feedback` if rows change between pages.

The protocol error codes are `invalid_request`, `unsupported_version`, `unauthorized`, `app_unavailable`, `profile_mismatch`, `repository_missing`, `invalid_target`, `context_missing`, `context_expired`, `stale_review`, `stale_diff`, `stale_feedback`, `note_conflict`, `idempotency_conflict`, `limit_exceeded`, `busy`, `request_timeout`, and `internal_error`. `request_timeout` maps to the CLI I/O exit category; `stale_feedback` maps to the conflict category. No token should appear in CLI output.

The internal context service now persists snapshots without opening a repository tab. It pins commit contexts to a SHA, checks working-tree and branch identities before and after Git loads, and checks the saved file manifest and visibility setting on every context read. The manifest includes hidden generated files. Replacing the repository directory invalidates its contexts even when its Git content is identical. Contexts expire after 24 hours; creating a context purges expired entries and rejects capacity beyond 128 live entries instead of evicting one.

Desktop and companion note mutations now increment a persistent revision in the same SQLite transaction. Deleting a note retains that revision. The snapshot API returns the current note and an opaque version token together, so same-timestamp edits and delete/recreate cycles are distinguishable. Target-aware report excerpts use the report's recorded target and omit mismatched content. Agent reads and clipboard reports share the same target-aware formatter.

## Connecting and opening

Run `Difftray.app/Contents/Resources/bin/difftray doctor --json` to connect quietly and inspect the authenticated bundle/profile identity. `open [PATH] --json` selects the canonical containing worktree and returns only after the renderer commits the requested target. Paths default to the caller’s working directory. Opening defaults to working-tree; branch and commit modes require `--base` and `--commit` respectively. Unknown arguments and invalid selectors fail before startup. Help and version work offline without standalone Node on PATH.

The CLI launches only its own bundle executable, with detached standard streams and Electron runtime injection variables removed. Every profile is canonicalized before Electron acquires its single-instance lock or opens storage. Background second-instance launches do not focus the UI; a normal launch or an explicit open does. Context reads use this same connection path without opening a window.

The socket lives beneath a per-user, profile-hashed directory with mode 0700. Socket and endpoint metadata must be owned by the current user with mode 0600. Existing unsafe paths are rejected rather than repaired. Endpoint publication follows explicit socket permission verification, independent of the launching shell’s umask. Connections are capped at 16, incomplete requests at five seconds, and authenticated dispatch plus response drain at 120 seconds. Disconnects cancel pending opens; queued expired selections never execute.

Startup waits at most 30 seconds. Authentication failures normally stop immediately. A caller with pre-crash metadata can refresh once after a verified generation change within that same deadline, without launching another process because of an authentication error. A profile, flavor, executable or protocol mismatch requires quitting and restarting the intended bundle; the CLI never kills or substitutes an existing app.

`pnpm --filter @difftray/desktop test:cli:e2e` builds an unsigned temporary bundle and exercises isolated profiles. `--app` can reuse an explicit fixture bundle. The smoke-only `DIFFTRAY_AGENT_SMOKE_DEBUG_PORT` environment variable enables loopback browser inspection only when an explicit `DIFFTRAY_USER_DATA_DIR` is supplied. This fixture evidence does not establish signed-release or real agent-host compatibility.

## Reading and exporting

Run `review inspect [--repo PATH] --json` (selected target by default), then pass its
`contextId` to `review files --context ID`, `review file --context ID --path PATH`,
`review feedback --context ID`, or `review export --context ID`. Explicit
`--target working-tree`, `--target branch --base REF`, and
`--target commit --commit REF` selectors override the stored selection. Export also supports a `--repo PATH` shorthand. Read commands never
change the selected tab or feedback.

File reads require an exact manifest path. `diffHash` is the stored review summary
fingerprint used for comment anchors; `renderDiffHash` identifies the loaded content.
These can differ for ordinary text. `selectableRanges` lists valid source line spans
on each side, including unchanged lines available in full snapshots. Nontext and
oversized content have no selectable line ranges.

File and feedback cursors bind the context, filter and sort. Feedback cursors also
bind a project feedback revision. Start again after `stale_feedback`; inspect again
after stale code or context expiry. `--include-inactive` includes historical feedback
with `target_changed`, `diff_changed`, or `dismissed` reasons. Every feedback page
reports the current overall note (or explicit null), its independent `noteVersion`,
and `inactiveCount`. No read marks a finding handled.

`review export --format prompt` writes only the report text to stdout. `--json` or
`--format json` writes a versioned result envelope. Export metadata reports the
feedback version, inactive count and reviewed-path cap: reports list up to 100 visible
paths and disclose any remainder. Feedback itself is never silently truncated. If
an export exceeds 16 MiB, use paginated feedback JSON with a smaller limit.

Exit codes: 0 success, 1 internal error, 2 invalid input, 3 unavailable app/repository,
missing or expired context, or incompatible protocol, 4 stale review/feedback or
write conflict, and 5 transport/timeout/capacity failure. JSON errors preserve the
typed code. Text and JSON work without a TTY; closed output pipes are handled cleanly.

## Submitting feedback

`feedback submit --context ID --input FILE` (or `--input -` for stdin) validates a
bounded UTF-8 JSON document before connecting. Bodies never need to be placed on
argv. The document contains `actor: {name, runId}`, `requestId`, and an ordered
`items` array. Use distinct run IDs for separate reviewer runs and a fresh request
ID for each new batch. `--request-id` can supply an omitted JSON request ID; two
supplied values must agree.

The desktop validates all paths, summary hashes and source-line anchors before a
single atomic write. It does not downgrade unavailable line findings to file
comments. An overall item needs the `expectedNoteVersion` returned by inspection
or feedback reads. A conflict requires rereading and deliberately preserving or
replacing the current note; no automatic concatenation occurs.

Successful receipts are durable under `(actor name, runId, requestId)`. An exact
retry using the original context and payload returns the same IDs even after a
restart, context expiry or later code changes. Reusing that key with another
payload returns `idempotency_conflict`. Receipt replay changes neither feedback
nor revisions and emits no repeated notifications. New batches increment the
project feedback revision once; note revisions remain independent.

Author labels are caller-supplied display names, not authenticated provider
identities. Comments retain their original creator when a human edits them, and
record the last editor separately. Overall notes show their last editor. Human
request routes reject caller-supplied provenance and version fields. Agent
submission fixes the actor kind to agent.

Companion clients opt in with `feedback-attribution-v1`. Without that capability,
all response routes omit `createdBy`, `lastEditedBy`, and `noteVersion` recursively;
existing response shapes and the `{report}` envelope remain unchanged. Reports
use the same compact attribution text in clipboard, companion and CLI output.
Desktop comments, file cards and overall notes display the optional attribution.
The shared mobile inline diff renders agent labels as escaped text alongside the
source-line location. Agent creator and later human editor remain distinct;
overall notes display only their last editor.
