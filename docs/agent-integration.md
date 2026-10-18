# Agent integration

## In-app setup

Open **Settings → Agents** in a packaged macOS app to install or repair the
portable skill, check the bundled CLI, or read this guide. The app bundles the
canonical skill at `Contents/Resources/skills/difftray` and the CLI at
`Contents/Resources/bin/difftray`. Choose **Install** for a known agent or use
the folder chooser for another agent:

| Agent        | Destination                                             |
| ------------ | ------------------------------------------------------- |
| Claude Code  | `~/.claude/skills/difftray`                             |
| Codex        | `~/.agents/skills/difftray`                             |
| Pi           | `~/.pi/agent/skills/difftray`                           |
| Other agents | Choose a native skills folder; the app adds `/difftray` |

Install creates an app-owned symlink from the selected destination to the
bundled skill. The skill folder remains inside the app, so the link receives
skill updates whenever the app is updated at the same path. The host agent may
need to restart or reload its skills to see those updates. **Repair** updates an
app-owned link when the app has moved. If the destination already contains an
unrelated folder, file, or symlink, the app preserves it and does not overwrite
it. The folder chooser can always be used again to choose another destination.

**Check** runs that app's bundled `bin/difftray doctor --json` against the current
profile with a 20-second timeout. It reports **Connected** or the CLI's error
message. **Full guide** opens this guide. **Terminal** contains the optional
command-line tool installer, moved from General.

The app resolves its own location from the installed skill symlink, including
Alpha and custom-named bundles. If the app moves, use **Repair** to update the
link. An explicit `DIFFTRAY_APP_PATH` override still takes precedence for
manual or developer use. Unpackaged development runs show “Agent setup is
available in packaged builds.” An isolated profile override cannot install into
the actual agent directories.

## Agent skill setup

The repository remains the source for contributors, with one canonical portable
skill at `integrations/agents/difftray/skills/difftray`. The app bundles only
that skill folder and the existing CLI; plugin wrappers and marketplace catalogs
are not needed for this installation flow. Their previous repository-based
installation instructions are superseded. No host skill installation or live
agent-session validation is claimed here.

The skill's sibling `scripts/difftray` resolver uses `DIFFTRAY_APP_PATH` first
when set. Otherwise, an installed skill link identifies its owning app bundle,
including Alpha and custom-named bundles. When used from the repository source
checkout, the resolver retains the default production lookup of
`/Applications/Difftray.app`, then `~/Applications/Difftray.app`. It validates
the app bundle and executable paths before calling the bundled CLI. It does not
search `PATH` or change the caller's working directory. The direct launcher at
`Difftray.app/Contents/Resources/bin/difftray` determines its own bundle.

The optional **Install command-line tool** action in Settings → Agents adds a
terminal convenience command under `~/.local/bin` when possible. Use **Repair
command-line tool** after moving an app if that symlink points at its old
location. This action is unnecessary for the agent skill, which uses its own
resolver. If `~/.local/bin` is not on `PATH`, use the absolute bundled CLI path
or add that directory to the shell environment yourself.

The [canonical skill](../integrations/agents/difftray/skills/difftray/SKILL.md)
and [command reference](../integrations/agents/difftray/skills/difftray/references/commands.md)
cover opening the current worktree, reading every feedback page, reviewing exact
anchors, and submitting authorized single-line, inclusive-range, file, and overall findings. Loading a
skill alone authorizes no write, code edit, other agent, or chat message.

Difftray's local agent protocol is version 1, separate from the companion protocol. The bundled CLI now connects to a private local socket, starts its own desktop bundle when necessary, and opens an exact repository worktree. Review reads, exports, and attributed feedback submission use explicit persisted contexts.

A connection exchanges exactly one UTF-8 JSON object followed by LF. Requests carry `version`, transport `id`, a 32-byte hex `token`, `method`, and method-specific `params`. Responses carry the same version and transport ID, then either `ok: true` with a validated result or `ok: false` with `{ code, message, retryable }`. The separate feedback `submission.requestId` identifies an idempotent batch. Frames are bounded to 1 MiB for requests and 16 MiB for responses. Unknown properties, malformed UTF-8, unknown methods or enum values, and unbounded fields are rejected.

`open` takes `{ repoPath, selector }`. With `working-tree`, `branch` with `base`, or `commit` with `commit` it selects that desktop target. With `selected` it keeps the worktree's current target (the working tree for a worktree never opened before), and when that review is already on screen it focuses it without reloading. `review.inspect` takes the same parameters and can also specify `selected`; it resolves that selection into a context without changing the GUI. `review.files`, `review.file`, `review.feedback`, and `review.export` take a `contextId`. File and feedback reads support bounded pagination. A context records the canonical worktree and Git identity, target, file manifest, snapshot hash, and expiry. Later operations must reject stale code or expired contexts instead of silently switching targets.

`feedback.submit` accepts an actor name and run ID, a request ID, and 1–100 items. The four scopes are single line, inclusive range, file, and overall note. Single-line and range items both use wire kind `line` and may address additions or deletions. Line and file items carry the context file path and diff hash; line positions are positive safe integers. An overall item carries the expected note version. Bodies are nonblank and at most 10,000 Unicode code points. The server fixes attribution to agent; callers cannot claim human authorship. Feedback pagination uses a separate feedback version and reports `stale_feedback` if rows change between pages.

The protocol error codes are `invalid_request`, `unsupported_version`, `unauthorized`, `app_unavailable`, `profile_mismatch`, `repository_missing`, `invalid_target`, `context_missing`, `context_expired`, `stale_review`, `stale_diff`, `stale_feedback`, `note_conflict`, `idempotency_conflict`, `limit_exceeded`, `busy`, `request_timeout`, and `internal_error`. `request_timeout` maps to the CLI I/O exit category; `stale_feedback` maps to the conflict category. No token should appear in CLI output.

The internal context service now persists snapshots without opening a repository tab. It pins commit contexts to a SHA, checks working-tree and branch identities before and after Git loads, and checks the context on every read. Commit and branch contexts are checked by re-resolving their target SHAs and fingerprinting the working-tree `.gitattributes`, `info/attributes`, the global attributes file (configured or Git's XDG default) and diff configuration, which together fix the diff; working-tree contexts reload the saved file manifest and visibility setting. Reads of repository content (`review file`, prompt `review export`, `feedback submit`) are checked again afterwards; manifest and feedback pages are checked once, since the manifest is frozen and feedback cursors carry their own version. `pnpm bench:agent-reads` measures these costs. The manifest includes hidden generated files. Replacing the repository directory invalidates its contexts even when its Git content is identical. Contexts expire after 24 hours; creating a context purges expired entries and rejects capacity beyond 128 live entries instead of evicting one.

Desktop and companion note mutations now increment a persistent revision in the same SQLite transaction. Deleting a note retains that revision. The snapshot API returns the current note and an opaque version token together, so same-timestamp edits and delete/recreate cycles are distinguishable. Target-aware report excerpts use the report's recorded target and omit mismatched content. Agent reads and clipboard reports share the same target-aware formatter.

## Connecting and opening

Run `Difftray.app/Contents/Resources/bin/difftray doctor --json` to connect quietly and inspect the authenticated bundle/profile identity. `open [PATH] --json` selects the canonical containing worktree and returns only after the renderer commits the requested target. Paths default to the caller’s working directory. Without `--target`, opening keeps the worktree's current selection; branch and commit modes require `--base` and `--commit` respectively. Unknown arguments and invalid selectors fail before startup. Help and version work offline without standalone Node on PATH.

`doctor` is a CLI command built on the strict wire `hello` operation. Fields such
as `connected`, `bundlePath`, and `cliVersion` are CLI diagnostics assembled
locally; clients must not add them to a wire `hello` response. Neither surface
prints the endpoint token.

The CLI launches only its own bundle executable, with detached standard streams and Electron runtime injection variables removed. Every profile is canonicalized before Electron acquires its single-instance lock or opens storage. Background second-instance launches do not focus the UI; a normal launch or an explicit open does. Context reads use this same connection path without opening a window.

The socket lives beneath a per-user, profile-hashed directory with mode 0700. Socket and endpoint metadata must be owned by the current user with mode 0600. Existing unsafe paths are rejected rather than repaired. Endpoint publication follows explicit socket permission verification, independent of the launching shell’s umask. Connections are capped at 16, incomplete requests at five seconds, and authenticated dispatch plus response drain at 120 seconds. Disconnects cancel pending opens; queued expired selections never execute.

Startup waits at most 30 seconds. Authentication failures normally stop immediately. A caller with pre-crash metadata can refresh once after a verified generation change within that same deadline, without launching another process because of an authentication error. A profile, flavor, executable or protocol mismatch requires quitting and restarting the intended bundle; the CLI never kills or substitutes an existing app.

`pnpm --filter @difftray/desktop test:cli:e2e` builds an unsigned temporary bundle and exercises isolated profiles. `--app` can reuse an explicit fixture bundle. The smoke-only `DIFFTRAY_AGENT_SMOKE_DEBUG_PORT` environment variable enables loopback browser inspection only when an explicit `DIFFTRAY_USER_DATA_DIR` is supplied. This fixture evidence does not establish signed-release or real agent-host compatibility.

The full gate runs that process test after visual verification with `--skip-build`,
reusing the gate's build outputs. Read, write, invalidation, and companion
compatibility matrix helpers exercise the bundled CLI and actual Electron
services. The companion helper enables only its isolated fixture server, pairs
fresh ephemeral keys, and reads encrypted legacy/current capability responses.
Expiry and corruption cases manipulate only owned fixture state; SQL or clock
manipulation is test infrastructure, not a supported agent API. A global
ten-minute deadline bounds the process matrix and cleanup targets only owned
fixture processes/profiles. The heavier `test:cli:bundle` archive check remains a
separate pre-handoff check. See [testing strategy](testing-strategy.md).

M6 acceptance and coordinated handoff remain pending until the final checks are
recorded. Actual Codex/Claude/Pi sessions, signed arm64 and x64 archives, and any
publication remain user validation or explicit authorization tasks.

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

## Worktree display names

`worktree label set --repo ROOT --label TEXT` and `worktree label reset --repo ROOT`
send the `worktree.label.set` method (reset sends `label: null`). The CLI resolves
`--repo` against the working directory; the desktop requires it to be the exact
Git root of a main or linked worktree and rejects subdirectories, bare, prunable,
missing and foreign targets. The label is validated by the shared
`normalizeWorktreeLabel` rules: control characters, malformed Unicode and
invisible or bidirectional formatting characters are rejected before trimming,
then 1–80 code points with at least one visible character remain. The result is `{repoPath, worktree}` with the
canonical root and the `RepositoryWorktreeView` the picker shows; a reset omits
`customLabel`. Its `state` is `open` when a Difftray tab shows the worktree and
`available` otherwise; the CLI has no source project, so it is never `current`.
Both commands are idempotent.

Labels are desktop-profile display metadata (see
[the decision](decisions/worktree-display-labels.md)). Setting one does not
rename a branch, move a directory, change Git config, open the worktree, change
the selected diff or invalidate reviews and review contexts, and needs no
context ID. The method keeps protocol version 1. An app older than its CLI
rejects the unknown method; the CLI reports `app_unavailable` and asks for the
CLI bundled with the same build instead of falling back to Git.

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
restart, context expiry or later code changes, for 30 days; committing a new
batch prunes older receipts. Reusing that key with another
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
