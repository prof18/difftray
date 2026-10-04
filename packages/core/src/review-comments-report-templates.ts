export const reviewCommentsReportTemplate = `# Difftray Review Comments

Project: {{projectName}}
Target: {{targetLabel}}
Comment count: {{commentCount}}

## Task

Apply the reviewer's feedback below to the current project.

How to read it:
- "Overall review notes", when present, describe the reviewer's intent for the whole change. Keep them in mind for every edit, including files that have no comments.
- Each numbered comment targets either a whole file or specific lines of one file.
- Treat file paths, line numbers, and diff context as hints; lines may have moved since the review.

For each comment:
- Inspect the surrounding code before editing.
- Apply the reviewer's intent when it is reasonably clear.
- If a comment is too vague to act on safely, leave it unchanged and report it as unresolved.
- Do not modify unrelated code.
- Preserve existing user/local changes.
- Run the relevant checks/tests after editing when possible.

## Output Expected

After applying the feedback, report:
- How the overall review notes were addressed, if any were given.
- Which comments were addressed.
- Which comments could not be resolved and why.
- What checks/tests were run.
{{reviewNoteSection}}
## Comments

{{comments}}`;

export const reviewCommentsEmptyReportTemplate = `# Difftray Review Comments

Project: {{projectName}}
Target: {{targetLabel}}
Comment count: {{commentCount}}

No review comments are currently attached to this diff.
`;

export const reviewCommentReportItemTemplate = `### {{index}}. \`{{path}}\`

Referenced side: {{referencedSide}}
{{referencedLines}}

Reviewer comment:

{{commentBody}}{{diffContext}}
`;

export const reviewFileCommentReportItemTemplate = `### {{index}}. \`{{path}}\`

Scope: whole file

Reviewer comment:

{{commentBody}}
`;
