import { describe, expect, it } from "vitest";

import {
  EARLIER_BODY_MAX_CHARS,
  formatLearnReport,
  inlineCode,
  summarizeLearnReport,
  type FeedbackExcerpt,
  type LearnReportEarlierItem,
  type LearnReportInput,
  type LearnReportItem
} from "../src/index.js";

const dangerous = [
  "[x](https://example.com)",
  "https://example.com",
  "![image](https://example.com/pixel)",
  "<script>"
] as const;

function item(overrides: Partial<LearnReportItem> = {}): LearnReportItem {
  return {
    author: { kind: "human" },
    body: "Validate --since before sending.",
    createdAt: "2026-10-12T09:00:00.000Z",
    dismissed: false,
    excerpt: null,
    excerptCommit: null,
    excerptSource: "unavailable",
    id: "c_1",
    kind: "line",
    lineEnd: 43,
    lineStart: 41,
    path: "src/cli/commands.ts",
    previousPath: null,
    side: "additions",
    status: "target_changed",
    targetLabel: "main...cli-flags",
    updatedAt: "2026-10-12T09:00:00.000Z",
    worktreePath: "/Users/me/src/difftray-wt",
    ...overrides
  };
}

function earlier(
  overrides: Partial<LearnReportEarlierItem> = {}
): LearnReportEarlierItem {
  return {
    author: { kind: "agent", name: "codex", runId: "run-1" },
    bodyFirstLine: "Possible race when two saves overlap",
    createdAt: "2026-06-02T10:00:00.000Z",
    dismissed: true,
    id: "c_19be",
    kind: "line",
    path: "src/main/index.ts",
    status: "dismissed",
    updatedAt: "2026-06-02T10:00:00.000Z",
    ...overrides
  };
}

function input(overrides: Partial<LearnReportInput> = {}): LearnReportInput {
  return {
    createdAt: "2026-11-20T10:00:00.000Z",
    cursor: "2026-11-19T17:42:10.120Z",
    earlierItems: [],
    lastLearnedAt: "2026-10-01T08:00:00.000Z",
    newItems: [],
    repository: "/Users/me/src/difftray/.git",
    repositoryName: "difftray",
    ...overrides
  };
}

function linesExcerpt(texts: readonly string[], firstLine = 40): FeedbackExcerpt {
  return {
    kind: "lines",
    lines: texts.map((text, index) => ({
      kind: index === 0 ? "context" : "commented",
      lineNumber: firstLine + index,
      text
    })),
    side: "additions",
    truncated: false,
    version: 1
  };
}

type Fence = { readonly fence: string; readonly content: readonly string[] };

/** Splits rendered Markdown into fenced blocks and the text outside them. */
function splitFences(markdown: string): {
  readonly fences: readonly Fence[];
  readonly outside: readonly string[];
} {
  const fences: Fence[] = [];
  const outside: string[] = [];
  let open: { fence: string; content: string[] } | null = null;

  for (const line of markdown.split("\n")) {
    if (open) {
      if (line === open.fence) {
        fences.push(open);
        open = null;
      } else {
        open.content.push(line);
      }
      continue;
    }
    const opening = /^(`{3,})text$/u.exec(line);
    if (opening?.[1]) open = { content: [], fence: opening[1] };
    else outside.push(line);
  }

  expect(open).toBeNull();
  return { fences, outside };
}

/** Removes CommonMark code spans: a run of n backticks closed by a run of exactly n. */
function stripCodeSpans(line: string): string {
  let result = "";
  let index = 0;
  while (index < line.length) {
    if (line[index] !== "`") {
      result += line[index];
      index += 1;
      continue;
    }
    let runEnd = index;
    while (line[runEnd] === "`") runEnd += 1;
    const run = line.slice(index, runEnd);
    let search = runEnd;
    let closed = -1;
    while (search < line.length) {
      const next = line.indexOf(run, search);
      if (next < 0) break;
      const before = line[next - 1];
      const after = line[next + run.length];
      if (before !== "`" && after !== "`") {
        closed = next;
        break;
      }
      search = next + 1;
    }
    expect(closed, `unclosed code span in ${line}`).toBeGreaterThanOrEqual(0);
    index = closed + run.length;
  }
  return result;
}

function outsideText(markdown: string): string {
  return splitFences(markdown).outside.map(stripCodeSpans).join("\n");
}

describe("formatLearnReport", () => {
  it("prints the header with repository, created time, last learned time and cursor", () => {
    const report = formatLearnReport(input());

    expect(report).toContain("# Difftray review feedback: `difftray`");
    expect(report).toContain("Repository: `/Users/me/src/difftray/.git`");
    expect(report).toContain(
      "Created: 2026-11-20T10:00:00.000Z · Last learned: 2026-10-01T08:00:00.000Z"
    );
    expect(report).toContain(
      "Cursor for `difftray learn mark`: 2026-11-19T17:42:10.120Z"
    );
  });

  it("says never and none when there is no last learned time or cursor", () => {
    const report = formatLearnReport(input({ cursor: null, lastLearnedAt: null }));

    expect(report).toContain("Last learned: never");
    expect(report).toContain("Cursor for `difftray learn mark`: none");
  });

  it("says when there is no new feedback", () => {
    const report = formatLearnReport(input({ cursor: null }));

    expect(report).toContain("No new feedback since the last run.");
  });

  it("counts the summary from the input", () => {
    const items = [
      item({ excerptSource: "saved", id: "a", status: "active" }),
      item({
        author: { kind: "agent", name: "codex", runId: "r" },
        excerptSource: "recovered",
        id: "b",
        status: "diff_changed"
      }),
      item({ excerptSource: "not_looked_up", id: "c", path: "src/main/index.ts" }),
      item({
        excerptSource: "approximate",
        id: "d",
        kind: "note",
        path: null,
        status: "dismissed"
      })
    ];
    const report = formatLearnReport(
      input({ earlierItems: [earlier()], newItems: items })
    );

    expect(report).toContain("- New items: 4 (human 3, agent 1)");
    expect(report).toContain(
      "- Status: active 1, target_changed 1, diff_changed 1, dismissed 1"
    );
    expect(report).toContain(
      "- Excerpts: saved 1, recovered 1, approximate 1, unavailable 0, not looked up 1"
    );
    expect(report).toContain(
      "- Most commented paths: `src/cli/commands.ts` (2), `src/main/index.ts` (1)"
    );
    expect(
      summarizeLearnReport(input({ earlierItems: [earlier()], newItems: items }))
    ).toMatchObject({
      authors: { agent: 1, human: 3 },
      earlierCount: 1,
      excerpts: {
        approximate: 1,
        not_looked_up: 1,
        recovered: 1,
        saved: 1,
        unavailable: 0
      },
      newCount: 4,
      statuses: { active: 1, diff_changed: 1, dismissed: 1, target_changed: 1 }
    });
  });

  it("sorts paths, puts notes last and sorts items by creation time", () => {
    const report = formatLearnReport(
      input({
        newItems: [
          item({ id: "note", kind: "note", path: null }),
          item({ createdAt: "2026-10-13T00:00:00.000Z", id: "z-late", path: "z.ts" }),
          item({ createdAt: "2026-10-11T00:00:00.000Z", id: "z-early", path: "z.ts" }),
          item({ id: "a", path: "a.ts" })
        ]
      })
    );

    const order = [
      "### `a.ts`",
      "### `z.ts`",
      "`z-early`",
      "`z-late`",
      "### Overall notes"
    ].map((marker) => report.indexOf(marker));
    expect(order.every((position) => position >= 0)).toBe(true);
    expect([...order].sort((left, right) => left - right)).toEqual(order);
    expect(report.indexOf("`note`")).toBeGreaterThan(report.indexOf("### Overall notes"));
  });

  it("prints the item heading and its worktree, target and id line", () => {
    const report = formatLearnReport(input({ newItems: [item()] }));

    expect(report).toContain(
      "#### line comment · human · target_changed · 2026-10-12 · additions 41-43"
    );
    expect(report).toContain(
      "Worktree `/Users/me/src/difftray-wt` · target `main...cli-flags` · id `c_1`"
    );
  });

  it("shows dismissed next to the status of a dismissed item", () => {
    const report = formatLearnReport(
      input({
        earlierItems: [earlier({ dismissed: true, status: "target_changed" })],
        newItems: [item({ dismissed: true, status: "diff_changed" })]
      })
    );

    expect(report).toContain("· diff_changed · dismissed ·");
    expect(report).toContain("· target_changed · dismissed ·");
  });

  it("keeps a multi-line body with a heading unchanged inside one text fence", () => {
    const body = "# Not a heading\nsecond line\n\n- third";
    const { fences } = splitFences(
      formatLearnReport(input({ newItems: [item({ body })] }))
    );

    expect(fences[0]).toEqual({ content: body.split("\n"), fence: "```" });
  });

  it("gives an excerpt with three backticks a four-backtick fence", () => {
    const report = formatLearnReport(
      input({
        newItems: [
          item({
            excerpt: linesExcerpt(["const a = 1;", "```ts"]),
            excerptSource: "saved"
          })
        ]
      })
    );
    const { fences } = splitFences(report);

    expect(report).toContain("Excerpt (saved):");
    expect(fences[1]).toEqual({
      content: ["  40 | const a = 1;", "> 41 | ```ts"],
      fence: "````"
    });
  });

  it("names the commit of an approximate excerpt", () => {
    const report = formatLearnReport(
      input({
        newItems: [
          item({
            excerpt: linesExcerpt(["a", "b"]),
            excerptCommit: "0123456789abcdef0123456789abcdef01234567",
            excerptSource: "approximate"
          })
        ]
      })
    );

    expect(report).toContain(
      "Excerpt (approximate, from commit 0123456789abcdef0123456789abcdef01234567):"
    );
  });

  it("prints one line and no fence for unavailable and not looked up excerpts", () => {
    for (const excerptSource of ["unavailable", "not_looked_up"] as const) {
      const report = formatLearnReport(input({ newItems: [item({ excerptSource })] }));
      const { fences, outside } = splitFences(report);

      expect(fences).toHaveLength(1);
      expect(outside.filter((line) => line.startsWith("Excerpt"))).toHaveLength(1);
    }
  });

  it("prints patch lines unchanged and files with their counts", () => {
    const report = formatLearnReport(
      input({
        newItems: [
          item({
            excerpt: {
              kind: "patch",
              lines: ["@@ -1,2 +1,2 @@", "-old", "+new"],
              truncated: false,
              version: 1
            },
            excerptSource: "recovered",
            id: "patch",
            kind: "file",
            lineEnd: null,
            lineStart: null,
            side: null
          }),
          item({
            excerpt: {
              files: [
                { additions: 3, deletions: 1, path: "a.ts" },
                { additions: 0, deletions: 7, path: "b.ts" }
              ],
              kind: "files",
              omittedFiles: 3,
              version: 1
            },
            excerptSource: "saved",
            id: "note",
            kind: "note",
            lineEnd: null,
            lineStart: null,
            path: null,
            side: null
          })
        ]
      })
    );
    const contents = splitFences(report).fences.map((fence) => fence.content);

    expect(contents).toContainEqual(["@@ -1,2 +1,2 @@", "-old", "+new"]);
    expect(contents).toContainEqual(["a.ts +3 -1", "b.ts +0 -7", "and 3 more files"]);
    expect(report).toContain("#### file comment · human · target_changed · 2026-10-12\n");
    expect(report).toContain("#### review note · human · target_changed · 2026-10-12\n");
  });

  it("prints earlier items as single lines without excerpts, cut to the limit", () => {
    const long = "x".repeat(EARLIER_BODY_MAX_CHARS + 50);
    const report = formatLearnReport(
      input({ earlierItems: [earlier(), earlier({ bodyFirstLine: long, id: "c_long" })] })
    );
    const section = report.slice(report.indexOf("## Earlier feedback (before last run)"));

    expect(section).toContain(
      "- `src/main/index.ts` · agent `codex` · dismissed · 2026-06-02 · `c_19be`: `Possible race when two saves overlap`"
    );
    expect(section).toContain(`\`${"x".repeat(EARLIER_BODY_MAX_CHARS)}\``);
    expect(section).not.toContain("x".repeat(EARLIER_BODY_MAX_CHARS + 1));
    expect(section).not.toContain("Excerpt");
    expect(
      section
        .trim()
        .split("\n")
        .filter((line) => line.startsWith("- "))
    ).toHaveLength(2);
  });

  it("keeps an agent name and a repository path with backticks inside code spans", () => {
    const report = formatLearnReport(
      input({
        newItems: [
          item({
            author: { kind: "agent", name: "[x](https://example.com)", runId: "r" }
          })
        ],
        repository: "/tmp/odd`repo/.git",
        repositoryName: "odd`repo"
      })
    );

    expect(report).toContain("Repository: ``/tmp/odd`repo/.git``");
    expect(report).toContain("# Difftray review feedback: ``odd`repo``");
    expect(report).toContain("agent `[x](https://example.com)`");
    expect(outsideText(report)).not.toContain("https://example.com");
  });

  it("renders links, URLs, images and HTML in bodies only inside fences and spans", () => {
    const hostile = dangerous.join(" and ");
    const report = formatLearnReport(
      input({
        earlierItems: [earlier({ bodyFirstLine: hostile })],
        newItems: [
          item({
            body: `${hostile}\n\`\`\`\n${hostile}`,
            excerpt: linesExcerpt([hostile, `\`\`\`\` ${hostile}`]),
            excerptSource: "saved",
            path: `src/${hostile}.ts`,
            targetLabel: hostile,
            worktreePath: `/tmp/${hostile}`
          })
        ]
      })
    );
    const outside = outsideText(report);

    for (const text of dangerous) expect(outside).not.toContain(text);
    expect(report).toContain(hostile);
  });

  it("keeps a path with a backtick and a line break in one code span on one line", () => {
    const report = formatLearnReport(
      input({ newItems: [item({ path: "src/a`b\nc.ts" })] })
    );

    expect(report).toContain("### ``src/a`b c.ts``\n");
    expect(outsideText(report)).not.toContain("c.ts");
  });
});

describe("inlineCode", () => {
  it("pads a text that starts or ends with a backtick", () => {
    expect(inlineCode("`a")).toBe("`` `a ``");
    expect(inlineCode("plain")).toBe("`plain`");
    expect(inlineCode("a\r\nb\rc")).toBe("`a b c`");
  });
});
