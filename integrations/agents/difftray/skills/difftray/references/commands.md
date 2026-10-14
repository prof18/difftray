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
```

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
