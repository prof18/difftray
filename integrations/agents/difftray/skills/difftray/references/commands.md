# Difftray CLI review commands

Set `cli` to the absolute path of this skill's `scripts/difftray` and `repo` to the intended Git worktree's absolute path. Quote every variable. These are command examples, not automatic instructions to submit feedback.

```sh
"$cli" --help
"$cli" doctor --json
"$cli" open "$repo" --json
"$cli" review inspect --repo "$repo" --json
"$cli" review files --context "$contextId" --limit 100 --json
"$cli" review files --context "$contextId" --limit 100 --cursor "$nextCursor" --json
"$cli" review file --context "$contextId" --path "$relativePath" --json
"$cli" review feedback --context "$contextId" --include-inactive --limit 100 --json
"$cli" review feedback --context "$contextId" --include-inactive --limit 100 --cursor "$nextCursor" --json
"$cli" review export --context "$contextId" --format json --json
"$cli" feedback submit --context "$contextId" --input "$savedPayload" --json
"$cli" worktree label set --repo "$repo" --label "$label" --json
"$cli" worktree label reset --repo "$repo" --json
```

`worktree label set` gives the worktree at the exact root `$repo` a Difftray display name of 1–80 characters (surrounding spaces are trimmed; tabs, newlines, other control characters and invisible or bidirectional formatting characters are rejected). `worktree label reset` removes it so Difftray shows the Git branch or detached hash again. Both are idempotent. A subdirectory is rejected rather than resolved to its parent. Labeling does not rename the branch, move the directory, change Git config or open the worktree, and it uses no review context. Label only the worktrees the user asked you to label. The JSON result returns the canonical root and the resolved worktree; a reset omits `customLabel`:

<!-- worktree-label-result -->

```json
{
  "version": 1,
  "id": "6F1C2A4E-0B7D-4F55-9C1E-2A7B3D8E9F01",
  "ok": true,
  "result": {
    "repoPath": "/Users/me/src/app-checkout",
    "worktree": {
      "branchName": "codex/checkout",
      "customLabel": "Checkout rework",
      "displayName": "Checkout rework",
      "displayPath": "/Users/me/src/app-checkout",
      "headSha": "4f2c9e1a7b3d5f6e8c0a1b2c3d4e5f6a7b8c9d0e",
      "id": "w0rKtReE1d",
      "locked": false,
      "shortHeadSha": "4f2c9e1",
      "state": "available"
    }
  }
}
```

An app older than the CLI answers `app_unavailable` and asks for the CLI bundled with the same Difftray build; do not fall back to Git commands.

Use `--target working-tree`, `--target branch --base REF`, or `--target commit --commit REF` with `review inspect` when the selected target is not the intended target. `open` supports the same explicit target modes. Without one it keeps the diff the user already selected for that worktree (the working tree for a worktree never opened before) and only brings it forward; pass a target only when the user asked for a specific diff. `review inspect` defaults to the selected UI target. Keep the returned context for all later commands. `review files` and `review feedback` paginate independently until no `nextCursor` remains. Read exact file diffs before choosing line anchors. Do not infer a line number from a summary.

The submission file is a JSON object with `actor`, `requestId`, and `items`. The `contextId` is passed through `--context`. Generate IDs with the macOS utility, never with an actor label, timestamp alone, or copied example literal:

```sh
runId=$(/usr/bin/uuidgen)
requestId=$(/usr/bin/uuidgen)
```

The caller writes the JSON through a JSON-aware editor/tool to a scratch file outside tracked source; do not interpolate comment bodies into shell commands. A batch can contain these four item shapes:

```json
{
  "actor": { "name": "My review agent", "runId": "<generated runId>" },
  "requestId": "<generated requestId>",
  "items": [
    {
      "kind": "line",
      "path": "src/a.ts",
      "diffHash": "<current diffHash>",
      "side": "additions",
      "lineStart": 12,
      "lineEnd": 12,
      "body": "Finding on added code"
    },
    {
      "kind": "line",
      "path": "src/a.ts",
      "diffHash": "<current diffHash>",
      "side": "deletions",
      "lineStart": 7,
      "lineEnd": 9,
      "body": "Finding on an inclusive removed-code range"
    },
    {
      "kind": "file",
      "path": "src/a.ts",
      "diffHash": "<current diffHash>",
      "body": "File-level finding"
    },
    {
      "kind": "overall",
      "expectedNoteVersion": "<current noteVersion>",
      "body": "<existing note text>\n\nNew overall finding"
    }
  ]
}
```

Optional `previousPath` belongs only on line/file findings for a renamed file when returned by the review data. Use nonempty bodies. Include only items that the user authorized and that the current review supports. Overall feedback is versioned replacement of the entire note; preserve prior text when appending.

Save the exact payload and original context ID together in caller-owned scratch storage so they survive a host-session restart. Two concurrent runs with the same actor name still require separate `runId` values. An uncertain retry uses the original `contextId`, JSON bytes, run ID, and request ID. A definitive `note_conflict`, `stale_review`, or `stale_diff` requires fresh reads and a re-evaluated batch with a new request ID. On `stale_feedback`, only restart feedback pagination under the same valid context.
