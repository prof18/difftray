export const CLI_HELP = `Difftray local review CLI
Usage: difftray open [PATH] [--target working-tree|branch|commit] [--base REF|--commit REF] [--json]
       difftray review inspect [--repo PATH] [--target selected|working-tree|branch|commit]
       difftray review files|file|feedback|export --context ID
       difftray feedback submit --context ID --input FILE_OR_STDIN [--request-id ID] [--json]
       difftray worktree label set --repo WORKTREE_ROOT --label TEXT [--json]
       difftray worktree label reset --repo WORKTREE_ROOT [--json]
       difftray doctor [--app OWN_BUNDLE_PATH] [--json]
       difftray --help | --version [--json]

Review scopes: overall notes, file comments, and side-aware line/range comments.
open defaults to the current directory and working-tree target.
inspect/export default to the current directory and selected target (working-tree
for a newly opened repository). Explicit branch needs --base; commit needs --commit.
export accepts --context ID or --repo PATH with selectors, never both.
export defaults to --format prompt: exact report text on stdout. --json or
--format json returns an envelope; errors are diagnostics on stderr.
files/feedback accept --limit (default 100, maximum 500) and --cursor.
feedback --include-inactive includes retained historical comments.
Contexts expire after 24 hours; stale code requires fresh inspection. A stale
feedback cursor requires restarting feedback pagination under the same context.
Reads preserve feedback and the context's generated-file visibility setting.
JSON preserves available author attribution. Agent names are labels, not identities.
submit reads a JSON document (maximum 1 MiB; use --input - for stdin) containing
actor {name, runId}, requestId and items. An optional --request-id must agree with
the document requestId if present. Bodies are supplied only in JSON input.
worktree label set/reset name the exact worktree root (main or linked, not a
subdirectory). Labels are Difftray display names only: 1-80 characters, no Git
branch, path or config change, no review context. reset restores the Git name.
Access is local-only using the current OS user's private desktop endpoint.
This launcher always uses its own app bundle, including after relocation.
doctor reports that bundle, profile, CLI version and startup/connection result.
The portable skill resolver prefers /Applications/Difftray.app then
~/Applications/Difftray.app; DIFFTRAY_APP_PATH explicitly selects custom/Alpha apps.
DIFFTRAY_USER_DATA_DIR explicitly selects an isolated profile for this bundle.
Callers must obtain user authorization for repository access, feedback and label actions.
Exit codes: 1 internal, 2 input, 3 unavailable/not found/protocol,
4 stale state/conflict, 5 transport/timeout/limit.
`;
