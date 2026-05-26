export const reviewCommentsReportTemplate = `# Difftray Review Comments

Project: {{projectName}}
Target: {{targetLabel}}
Comment count: {{commentCount}}

## Task

Apply the following review comments to the current project.

For each comment:
- Treat file paths and diff context as hints; line numbers may be stale.
- Inspect the surrounding code before editing.
- Apply the reviewer's intent when it is reasonably clear.
- If a comment is too vague to act on safely, leave it unchanged and report it as unresolved.
- Do not modify unrelated code.
- Preserve existing user/local changes.
- Run the relevant checks/tests after editing when possible.

## Output Expected

After applying the comments, report:
- Which comments were addressed.
- Which comments could not be resolved and why.
- What checks/tests were run.

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
