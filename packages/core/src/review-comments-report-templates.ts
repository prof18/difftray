export const reviewCommentsReportTemplate = `# Difftray Review Feedback

Project: {{projectName}}
{{targetSection}}{{reviewedFiles}}
Feedback: {{feedbackCounts}}

## Task

Apply the reviewer's feedback below to this repository's working tree. Don't commit unless asked.

The feedback has three scopes:
- Overall review notes apply to the whole reviewed change, including files that have no comments. If there are no numbered items, act on the notes themselves.
- File comments ("whole file") apply to the entire file.
- Line comments target specific lines. "new" lines are numbered in the changed version of the file. "old" lines are numbered in the base revision and may since have been deleted or moved.

When scopes disagree, the narrower one wins. Code may have moved since the review, so treat paths and line numbers as hints and locate lines by the quoted code. In each code excerpt, lines marked \`>\` are the ones the reviewer selected; the other lines are surrounding context.

For each item:
- Apply the reviewer's intent when it is reasonably clear, and state any assumption you make.
- If an item asks a question instead of requesting a change, answer it in your report and don't edit for it.
- If an item is still ambiguous after reading the code, don't edit for it: apply the other items, then ask all open questions together in one message. If you can't ask the user, report those items as unresolved.
- If two items conflict, don't pick one silently; ask, or report the conflict.
- Change only what the feedback asks for, and don't revert or discard other uncommitted work in the tree.
- Run the checks and tests relevant to your edits. If you can't run them, say so in your report.

## Report back

After applying the feedback, report:
- How the overall review notes were addressed, if any were given.
- For each numbered item: addressed (with any assumptions), answered, or unresolved and why.
- Which checks and tests you ran.
{{reviewNoteSection}}
## Items

{{comments}}`;

export const reviewCommentsEmptyReportTemplate = `# Difftray Review Feedback

Project: {{projectName}}
{{targetSection}}
Feedback: none

No review feedback is attached to this diff.
`;

export const reviewCommentReportItemTemplate = `### {{index}}. \`{{path}}\` ({{location}})

{{commentBody}}{{diffContext}}
`;

export const reviewFileCommentReportItemTemplate = `### {{index}}. \`{{path}}\` (whole file)

{{commentBody}}
`;
