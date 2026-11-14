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

Weigh the feedback instead of applying it mechanically. Check every request, the overall notes included, against the code before you act on it. If a change doesn't make sense for the implementation, for example because it would introduce a bug, break behavior or a contract other code relies on, or rest on a misreading of the code, don't make it, and explain why in your report. If you see a better alternative, describe it in your report; don't implement it unless the reviewer asked for it. Disagreeing on style or approach is not a reason to decline: follow the reviewer's preference, and mention your concern in the recap if it matters.

For each item:
- Apply the reviewer's intent when it is reasonably clear and holds up against the code, and state any assumption you make.
- If an item only asks a question, answer it in your report and don't edit for it.
- If an item asks a question and also requests a change, make the change if it holds up, then answer the question.
- If an item is still ambiguous after reading the code, don't edit for it: apply the other items, then ask all open questions, and the changes you would decline, together in one message. If you can't ask the user, report those items as unresolved or declined.
- If two items conflict, don't pick one silently; ask, or report the conflict.
- Change only what the feedback asks for, and don't revert or discard other uncommitted work in the tree.
- Run the checks and tests relevant to your edits. If you can't run them, say so in your report.

## Report back

When you're done, end with a recap:
- How the overall review notes were addressed, if any were given, including any part you declined and why.
- For each numbered item: addressed (with any assumptions), answered, declined and why, or unresolved and why.
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
