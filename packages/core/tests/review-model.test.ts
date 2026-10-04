import { describe, expect, it } from "vitest";

import {
  calculateProgress,
  createDiffHash,
  createReviewNoteScopeId,
  createReviewTargetId,
  detectGeneratedFile,
  formatReviewCommentsReport,
  resolveReviewStates,
  type FileDiff,
  type ReviewMark,
  type ReviewTarget
} from "../src/index.js";

const workingTreeTarget = {
  headRefName: "main",
  headSha: "1111111111111111111111111111111111111111",
  kind: "working_tree",
  projectId: "project-a"
} satisfies ReviewTarget;

const branchTarget = {
  baseRefName: "origin/main",
  baseSha: "2222222222222222222222222222222222222222",
  headRefName: "feature/review",
  headSha: "3333333333333333333333333333333333333333",
  kind: "branch",
  mergeBaseSha: "4444444444444444444444444444444444444444",
  projectId: "project-a"
} satisfies ReviewTarget;

const commitTarget = {
  commitSha: "6666666666666666666666666666666666666666",
  commitShortSha: "6666666",
  commitSubject: "Change focused file",
  headSha: "6666666666666666666666666666666666666666",
  kind: "commit",
  parentSha: "5555555555555555555555555555555555555555",
  projectId: "project-a"
} satisfies ReviewTarget;

const textDiff = {
  content: {
    kind: "text",
    patch: "@@ -1 +1 @@\n-old\n+new\n"
  },
  newPath: "src/example.ts",
  status: "modified"
} satisfies FileDiff;

describe("review target identity", () => {
  it("creates stable ids for equivalent review targets", () => {
    expect(createReviewTargetId(workingTreeTarget)).toBe(
      createReviewTargetId({ ...workingTreeTarget })
    );
  });

  it("includes branch base and merge-base identity", () => {
    expect(createReviewTargetId(branchTarget)).not.toBe(
      createReviewTargetId({
        ...branchTarget,
        mergeBaseSha: "5555555555555555555555555555555555555555"
      })
    );
  });

  it("includes commit parent and selected commit identity", () => {
    expect(createReviewTargetId(commitTarget)).not.toBe(
      createReviewTargetId({
        ...commitTarget,
        parentSha: "7777777777777777777777777777777777777777"
      })
    );
  });
});

describe("diff hashes", () => {
  it("are stable for the same file diff", () => {
    expect(createDiffHash(workingTreeTarget, textDiff)).toBe(
      createDiffHash(workingTreeTarget, { ...textDiff })
    );
  });

  it("change when the textual patch changes", () => {
    expect(createDiffHash(workingTreeTarget, textDiff)).not.toBe(
      createDiffHash(workingTreeTarget, {
        ...textDiff,
        content: { kind: "text", patch: "@@ -1 +1 @@\n-old\n+newer\n" }
      })
    );
  });

  it("normalizes CRLF textual patches to LF", () => {
    expect(createDiffHash(workingTreeTarget, textDiff)).toBe(
      createDiffHash(workingTreeTarget, {
        ...textDiff,
        content: { kind: "text", patch: "@@ -1 +1 @@\r\n-old\r\n+new\r\n" }
      })
    );
  });

  it("does not include context snapshot text in review identity", () => {
    expect(createDiffHash(workingTreeTarget, textDiff)).toBe(
      createDiffHash(workingTreeTarget, {
        ...textDiff,
        content: {
          kind: "text",
          newText: "new\nunchanged helper\n",
          oldText: "old\nunchanged helper\n",
          patch: textDiff.content.patch
        }
      })
    );
  });

  it("is scoped to the review target", () => {
    expect(createDiffHash(workingTreeTarget, textDiff)).not.toBe(
      createDiffHash(branchTarget, textDiff)
    );
  });

  it("includes paths and rename metadata", () => {
    expect(createDiffHash(workingTreeTarget, textDiff)).not.toBe(
      createDiffHash(workingTreeTarget, {
        ...textDiff,
        newPath: "src/renamed.ts",
        oldPath: "src/example.ts",
        status: "renamed"
      })
    );
  });

  it("fingerprints binary content by size and digest", () => {
    const binaryDiff = {
      content: {
        byteSize: 4,
        digest: "binary-content-sha",
        kind: "binary"
      },
      newPath: "assets/logo.png",
      status: "modified"
    } satisfies FileDiff;

    expect(createDiffHash(workingTreeTarget, binaryDiff)).not.toBe(
      createDiffHash(workingTreeTarget, {
        ...binaryDiff,
        content: { ...binaryDiff.content, digest: "other-binary-content-sha" }
      })
    );
  });

  it("fingerprints symlink, submodule, and mode-only changes explicitly", () => {
    const symlinkHash = createDiffHash(workingTreeTarget, {
      content: {
        kind: "symlink",
        newTarget: "../new-target",
        oldTarget: "../old-target"
      },
      newPath: "linked",
      status: "modified"
    });
    const submoduleHash = createDiffHash(workingTreeTarget, {
      content: { kind: "submodule", newCommit: "bbb", oldCommit: "aaa" },
      newPath: "vendor/module",
      status: "modified"
    });
    const modeHash = createDiffHash(workingTreeTarget, {
      content: { kind: "mode_only" },
      newMode: "100755",
      newPath: "script.sh",
      oldMode: "100644",
      status: "mode_changed"
    });

    expect(new Set([symlinkHash, submoduleHash, modeHash]).size).toBe(3);
  });
});

describe("generated file detection", () => {
  it("detects high-confidence generated headers and paths", () => {
    expect(
      detectGeneratedFile({
        path: "Sources/Generated/user.pb.swift",
        sample: "// Code generated by protoc. DO NOT EDIT.\n"
      }).isGenerated
    ).toBe(true);
  });

  it("does not classify lockfiles as generated", () => {
    expect(detectGeneratedFile({ path: "pnpm-lock.yaml" }).isGenerated).toBe(false);
    expect(detectGeneratedFile({ path: "package-lock.json" }).isGenerated).toBe(false);
  });

  it("uses text snapshot headers when resolving generated-file visibility", () => {
    const states = resolveReviewStates({
      diffs: [
        {
          content: {
            kind: "text",
            newText: "// Code generated by schema compiler. DO NOT EDIT.\nexport {}\n",
            patch:
              "@@ -0,0 +1,2 @@\n+// Code generated by schema compiler. DO NOT EDIT.\n+export {}\n"
          },
          newPath: "src/schema.ts",
          status: "added"
        }
      ],
      marks: [],
      reviewTarget: workingTreeTarget
    });

    expect(states[0]).toEqual(
      expect.objectContaining({
        generated: true,
        visible: false
      })
    );
  });
});

describe("review state and progress", () => {
  const generatedDiff = {
    content: { kind: "text", patch: "+ generated\n" },
    generated: true,
    newPath: "src/generated/schema.pb.swift",
    status: "added"
  } satisfies FileDiff;

  const currentDiffs = [textDiff, generatedDiff] as const;

  it("marks files reviewed only when target and hash match", () => {
    const targetId = createReviewTargetId(workingTreeTarget);
    const reviewedDiffHash = createDiffHash(workingTreeTarget, textDiff);
    const marks = [
      {
        path: textDiff.newPath,
        reviewedDiffHash,
        reviewTargetId: targetId
      }
    ] satisfies readonly ReviewMark[];

    const states = resolveReviewStates({
      diffs: currentDiffs,
      marks,
      reviewTarget: workingTreeTarget
    });

    expect(states).toEqual([
      expect.objectContaining({ path: textDiff.newPath, reviewed: true }),
      expect.objectContaining({ path: generatedDiff.newPath, reviewed: false })
    ]);
  });

  it("invalidates review when the current hash changes", () => {
    const targetId = createReviewTargetId(workingTreeTarget);
    const staleHash = createDiffHash(workingTreeTarget, textDiff);
    const changedDiff = {
      ...textDiff,
      content: { kind: "text", patch: "+ changed after review\n" }
    } satisfies FileDiff;

    const states = resolveReviewStates({
      diffs: [changedDiff],
      marks: [
        {
          path: changedDiff.newPath,
          reviewedDiffHash: staleHash,
          reviewTargetId: targetId
        }
      ],
      reviewTarget: workingTreeTarget
    });

    expect(states[0]).toEqual(
      expect.objectContaining({ invalidated: true, reviewed: false })
    );
  });

  it("excludes hidden generated files from progress by default", () => {
    const states = resolveReviewStates({
      diffs: currentDiffs,
      marks: [
        {
          path: textDiff.newPath,
          reviewedDiffHash: createDiffHash(workingTreeTarget, textDiff),
          reviewTargetId: createReviewTargetId(workingTreeTarget)
        }
      ],
      reviewTarget: workingTreeTarget
    });

    expect(calculateProgress(states)).toEqual({
      reviewedVisibleFiles: 1,
      totalVisibleReviewableFiles: 1
    });
  });

  it("counts generated files when they are visible", () => {
    const states = resolveReviewStates({
      diffs: currentDiffs,
      marks: [],
      reviewTarget: workingTreeTarget,
      showGeneratedFiles: true
    });

    expect(calculateProgress(states)).toEqual({
      reviewedVisibleFiles: 0,
      totalVisibleReviewableFiles: 2
    });
  });
});

describe("review comment reports", () => {
  it("formats review comments as an agent-ready report", () => {
    expect(
      formatReviewCommentsReport({
        comments: [
          {
            body: "Validate role before putting it in the token.",
            context: {
              lines: [
                {
                  kind: "context",
                  lineNumber: 10,
                  text: "const input = readAuthInput(request);"
                },
                {
                  kind: "context",
                  lineNumber: 11,
                  text: "const token = createToken({"
                },
                {
                  kind: "commented",
                  lineNumber: 12,
                  text: "  role: input.role"
                },
                {
                  kind: "context",
                  lineNumber: 13,
                  text: "});"
                }
              ],
              side: "additions"
            },
            lineEnd: 12,
            lineStart: 12,
            path: "src/auth.ts",
            side: "additions"
          },
          {
            body: "This branch is no longer used; remove the fallback too.",
            context: {
              lines: [
                {
                  kind: "context",
                  lineNumber: 29,
                  text: "if (cachedUser) {"
                },
                {
                  kind: "commented",
                  lineNumber: 30,
                  text: "  return cachedUser;"
                },
                {
                  kind: "commented",
                  lineNumber: 31,
                  text: "}"
                },
                {
                  kind: "commented",
                  lineNumber: 32,
                  text: "return anonymousUser;"
                }
              ],
              side: "deletions"
            },
            lineEnd: 32,
            lineStart: 30,
            path: "src/auth.ts",
            side: "deletions"
          },
          {
            body: "Please add a regression test for the empty state.",
            lineEnd: 8,
            lineStart: 8,
            path: "src/ui.tsx",
            side: "additions"
          }
        ],
        projectName: "Difftray",
        targetLabel: "Git changes"
      })
    ).toBe(
      [
        "# Difftray Review Comments",
        "",
        "Project: Difftray",
        "Target: Git changes",
        "Comment count: 3",
        "",
        "## Task",
        "",
        "Apply the reviewer's feedback below to the current project.",
        "",
        "How to read it:",
        '- "Overall review notes", when present, describe the reviewer\'s intent for the whole change. Keep them in mind for every edit, including files that have no comments.',
        "- Each numbered comment targets either a whole file or specific lines of one file.",
        "- Treat file paths, line numbers, and diff context as hints; lines may have moved since the review.",
        "",
        "For each comment:",
        "- Inspect the surrounding code before editing.",
        "- Apply the reviewer's intent when it is reasonably clear.",
        "- If a comment is too vague to act on safely, leave it unchanged and report it as unresolved.",
        "- Do not modify unrelated code.",
        "- Preserve existing user/local changes.",
        "- Run the relevant checks/tests after editing when possible.",
        "",
        "## Output Expected",
        "",
        "After applying the feedback, report:",
        "- How the overall review notes were addressed, if any were given.",
        "- Which comments were addressed.",
        "- Which comments could not be resolved and why.",
        "- What checks/tests were run.",
        "",
        "## Comments",
        "",
        "### 1. `src/auth.ts`",
        "",
        "Referenced side: new",
        "Referenced line: 12",
        "",
        "Reviewer comment:",
        "",
        "> Validate role before putting it in the token.",
        "",
        "Diff context:",
        "",
        "```diff",
        "@@ New line 12 @@",
        "  10 const input = readAuthInput(request);",
        "  11 const token = createToken({",
        "+ 12   role: input.role",
        "  13 });",
        "```",
        "",
        "### 2. `src/auth.ts`",
        "",
        "Referenced side: old",
        "Referenced lines: 30-32",
        "",
        "Reviewer comment:",
        "",
        "> This branch is no longer used; remove the fallback too.",
        "",
        "Diff context:",
        "",
        "```diff",
        "@@ Old lines 30-32 @@",
        "  29 if (cachedUser) {",
        "- 30   return cachedUser;",
        "- 31 }",
        "- 32 return anonymousUser;",
        "```",
        "",
        "### 3. `src/ui.tsx`",
        "",
        "Referenced side: new",
        "Referenced line: 8",
        "",
        "Reviewer comment:",
        "",
        "> Please add a regression test for the empty state.",
        ""
      ].join("\n")
    );
  });

  it("returns a useful empty report when no comments exist", () => {
    expect(
      formatReviewCommentsReport({
        comments: [],
        projectName: "Difftray"
      })
    ).toBe(
      [
        "# Difftray Review Comments",
        "",
        "Project: Difftray",
        "Target: current local git diff",
        "Comment count: 0",
        "",
        "No review comments are currently attached to this diff.",
        ""
      ].join("\n")
    );
  });
});

describe("review notes and file comments in reports", () => {
  const fullInput = {
    comments: [
      {
        body: "Rename this helper.",
        lineEnd: 4,
        lineStart: 4,
        path: "a.ts",
        side: "additions" as const
      },
      {
        body: "Remove the fallback.",
        lineEnd: 9,
        lineStart: 7,
        path: "b.ts",
        side: "deletions" as const
      }
    ],
    fileComments: [{ body: "Split this module in two.", path: "a.ts" }],
    projectName: "Difftray",
    reviewNote: "Keep the public API stable.\n\nPrefer small commits.",
    targetLabel: "Git changes"
  };

  it("puts overall notes before comments and file comments before line comments", () => {
    const report = formatReviewCommentsReport(fullInput);

    expect(report.indexOf("## Overall review notes")).toBeGreaterThan(-1);
    expect(report.indexOf("## Overall review notes")).toBeLessThan(
      report.indexOf("## Comments")
    );
    expect(report).toContain("> Keep the public API stable.\n>\n> Prefer small commits.");
    expect(report).toContain("Comment count: 3");
    expect(report).toContain("### 1. `a.ts`\n\nScope: whole file");
    expect(report.indexOf("> Split this module in two.")).toBeLessThan(
      report.indexOf("> Rename this helper.")
    );
    expect(report).toContain("### 2. `a.ts`\n\nReferenced side: new");
    expect(report).toContain("### 3. `b.ts`\n\nReferenced side: old");
  });

  it("prints the full report with notes, file comments and line comments", () => {
    expect(formatReviewCommentsReport(fullInput)).toMatchInlineSnapshot(`
      "# Difftray Review Comments

      Project: Difftray
      Target: Git changes
      Comment count: 3

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

      ## Overall review notes

      > Keep the public API stable.
      >
      > Prefer small commits.

      ## Comments

      ### 1. \`a.ts\`

      Scope: whole file

      Reviewer comment:

      > Split this module in two.

      ### 2. \`a.ts\`

      Referenced side: new
      Referenced line: 4

      Reviewer comment:

      > Rename this helper.

      ### 3. \`b.ts\`

      Referenced side: old
      Referenced lines: 7-9

      Reviewer comment:

      > Remove the fallback.
      "
    `);
  });

  it("uses the main template when only a review note exists", () => {
    const report = formatReviewCommentsReport({
      comments: [],
      projectName: "Difftray",
      reviewNote: "Overall feedback."
    });

    expect(report).toContain("Comment count: 0");
    expect(report).toContain("## Overall review notes\n\n> Overall feedback.\n");
    expect(report.endsWith("## Comments\n\nNo file or line comments.")).toBe(true);
  });

  it("keeps the empty template when there are no notes and no comments", () => {
    expect(
      formatReviewCommentsReport({
        comments: [],
        fileComments: [],
        projectName: "Difftray",
        reviewNote: "   "
      })
    ).toContain("No review comments are currently attached to this diff.");
  });

  it("omits the overall notes heading when there is no note", () => {
    const report = formatReviewCommentsReport({
      comments: [],
      fileComments: [{ body: "Needs docs.", path: "README.md" }],
      projectName: "Difftray"
    });

    expect(report).not.toContain("## Overall review notes");
    expect(report).toContain("Comment count: 1");
    expect(report).toContain("- What checks/tests were run.\n\n## Comments");
  });
});

describe("review note scope ids", () => {
  it("ignores head sha changes for working trees on a branch", () => {
    expect(createReviewNoteScopeId(workingTreeTarget)).toBe(
      createReviewNoteScopeId({
        ...workingTreeTarget,
        headSha: "9999999999999999999999999999999999999999"
      })
    );
    expect(createReviewNoteScopeId(workingTreeTarget)).not.toBe(
      createReviewNoteScopeId({ ...workingTreeTarget, headRefName: "feature/other" })
    );
  });

  it("falls back to the head sha on a detached working tree", () => {
    const detached = {
      headSha: "1111111111111111111111111111111111111111",
      kind: "working_tree",
      projectId: "project-a"
    } satisfies ReviewTarget;

    expect(createReviewNoteScopeId(detached)).not.toBe(
      createReviewNoteScopeId({
        ...detached,
        headSha: "9999999999999999999999999999999999999999"
      })
    );
  });

  it("ignores commit shas for branch comparisons", () => {
    expect(createReviewNoteScopeId(branchTarget)).toBe(
      createReviewNoteScopeId({
        ...branchTarget,
        baseSha: "7777777777777777777777777777777777777777",
        headSha: "8888888888888888888888888888888888888888",
        mergeBaseSha: "9999999999999999999999999999999999999999"
      })
    );
  });

  it("distinguishes commits, prefixes, and projects", () => {
    expect(createReviewNoteScopeId(commitTarget)).not.toBe(
      createReviewNoteScopeId({
        ...commitTarget,
        commitSha: "7777777777777777777777777777777777777777"
      })
    );
    expect(createReviewNoteScopeId(commitTarget).startsWith("note-scope-v1:")).toBe(true);
    expect(createReviewNoteScopeId(workingTreeTarget)).not.toBe(
      createReviewNoteScopeId({ ...workingTreeTarget, projectId: "project-b" })
    );
  });
});
