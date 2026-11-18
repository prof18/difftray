import {
  learnExcerptSources,
  learnStatuses,
  type FeedbackExcerpt,
  type LearnExcerptSource,
  type LearnStatus
} from "./feedback-excerpt.js";
import type { ReviewCommentSide, ReviewFeedbackActor } from "./index.js";

export const EARLIER_BODY_MAX_CHARS = 200;
export const LEARN_REPORT_TOP_PATHS = 5;

export type LearnReportItemKind = "line" | "file" | "note";

export type LearnReportItem = {
  readonly id: string;
  readonly kind: LearnReportItemKind;
  readonly worktreePath: string;
  readonly path: string | null;
  readonly previousPath: string | null;
  readonly side: ReviewCommentSide | null;
  readonly lineStart: number | null;
  readonly lineEnd: number | null;
  readonly body: string;
  readonly author: ReviewFeedbackActor;
  readonly status: LearnStatus;
  readonly dismissed: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly targetLabel: string;
  readonly excerpt: FeedbackExcerpt | null;
  readonly excerptSource: LearnExcerptSource;
  readonly excerptCommit: string | null;
};

export type LearnReportEarlierItem = Pick<
  LearnReportItem,
  "id" | "kind" | "path" | "author" | "status" | "dismissed" | "createdAt" | "updatedAt"
> & { readonly bodyFirstLine: string };

export type LearnReportInput = {
  readonly repositoryName: string;
  /** The common Git directory that identifies the repository. */
  readonly repository: string;
  readonly createdAt: string;
  readonly lastLearnedAt: string | null;
  readonly cursor: string | null;
  readonly newItems: readonly LearnReportItem[];
  readonly earlierItems: readonly LearnReportEarlierItem[];
};

export type LearnReportSummary = {
  readonly newCount: number;
  readonly earlierCount: number;
  readonly authors: { readonly human: number; readonly agent: number };
  readonly statuses: Readonly<Record<LearnStatus, number>>;
  readonly excerpts: Readonly<Record<LearnExcerptSource, number>>;
  readonly topPaths: readonly { readonly path: string; readonly count: number }[];
};

/** Counts the new items of a report; earlier items only add to earlierCount. */
export function summarizeLearnReport(
  input: Pick<LearnReportInput, "newItems" | "earlierItems">
): LearnReportSummary {
  const statuses = Object.fromEntries(
    learnStatuses.map((status) => [status, 0])
  ) as Record<LearnStatus, number>;
  const excerpts = Object.fromEntries(
    learnExcerptSources.map((source) => [source, 0])
  ) as Record<LearnExcerptSource, number>;
  const authors = { agent: 0, human: 0 };
  const paths = new Map<string, number>();

  for (const item of input.newItems) {
    statuses[item.status] += 1;
    excerpts[item.excerptSource] += 1;
    authors[item.author.kind] += 1;
    if (item.path !== null) paths.set(item.path, (paths.get(item.path) ?? 0) + 1);
  }

  const topPaths = [...paths]
    .map(([path, count]) => ({ count, path }))
    .sort((left, right) => right.count - left.count || compareText(left.path, right.path))
    .slice(0, LEARN_REPORT_TOP_PATHS);

  return {
    authors,
    earlierCount: input.earlierItems.length,
    excerpts,
    newCount: input.newItems.length,
    statuses,
    topPaths
  };
}

/**
 * Renders a learn report as Markdown. Every text that comes from feedback, Git or the
 * file system renders literally: bodies and excerpts in fenced blocks, everything
 * else in inline code spans, so none of it can form a link, an image or HTML.
 */
export function formatLearnReport(input: LearnReportInput): string {
  const summary = summarizeLearnReport(input);
  const sections = [
    [
      `# Difftray review feedback: ${inlineCode(input.repositoryName)}`,
      "",
      `Repository: ${inlineCode(input.repository)}`,
      `Created: ${input.createdAt} · Last learned: ${input.lastLearnedAt ?? "never"}`,
      `Cursor for \`difftray learn mark\`: ${input.cursor ?? "none"}`
    ].join("\n"),
    formatSummary(summary),
    formatNewItems(input.newItems),
    formatEarlierItems(input.earlierItems)
  ];

  return `${sections.join("\n\n")}\n`;
}

/**
 * Renders untrusted text as one inline code span on one line: line breaks become
 * spaces and the delimiter is one backtick longer than the longest backtick run.
 */
export function inlineCode(text: string): string {
  const flat = text.replace(/\r\n|\r|\n/gu, " ");

  if (flat.length === 0) return "` `";

  const delimiter = "`".repeat(longestBacktickRun(flat) + 1);
  const pad =
    flat.startsWith("`") ||
    flat.endsWith("`") ||
    (flat.startsWith(" ") && flat.endsWith(" ") && flat.trim().length > 0);
  const space = pad ? " " : "";

  return `${delimiter}${space}${flat}${space}${delimiter}`;
}

function fencedBlock(lines: readonly string[]): string {
  const fence = "`".repeat(
    Math.max(3, ...lines.map((line) => longestBacktickRun(line) + 1))
  );

  return [`${fence}text`, ...lines, fence].join("\n");
}

function formatSummary(summary: LearnReportSummary): string {
  const topPaths =
    summary.topPaths.length === 0
      ? "none"
      : summary.topPaths
          .map(({ count, path }) => `${inlineCode(path)} (${String(count)})`)
          .join(", ");

  return [
    "## Summary",
    "",
    `- New items: ${String(summary.newCount)} (human ${String(summary.authors.human)}, agent ${String(summary.authors.agent)})`,
    `- Status: ${learnStatuses.map((status) => `${status} ${String(summary.statuses[status])}`).join(", ")}`,
    `- Excerpts: ${learnExcerptSources.map((source) => `${excerptSourceLabel(source)} ${String(summary.excerpts[source])}`).join(", ")}`,
    `- Most commented paths: ${topPaths}`
  ].join("\n");
}

function formatNewItems(items: readonly LearnReportItem[]): string {
  const heading = "## New since last run";

  if (items.length === 0) return `${heading}\n\nNo new feedback since the last run.`;

  const groups = new Map<string | null, LearnReportItem[]>();
  for (const item of items) {
    const group = groups.get(item.path);
    if (group) group.push(item);
    else groups.set(item.path, [item]);
  }

  const paths = [...groups.keys()]
    .filter((path): path is string => path !== null)
    .sort(compareText);
  const ordered: (string | null)[] = [...paths, ...(groups.has(null) ? [null] : [])];

  return [
    heading,
    ...ordered.map((path) => {
      const group = [...(groups.get(path) ?? [])].sort(
        (left, right) =>
          compareText(left.createdAt, right.createdAt) || compareText(left.id, right.id)
      );
      const title = path === null ? "### Overall notes" : `### ${inlineCode(path)}`;

      return [title, ...group.map(formatItem)].join("\n\n");
    })
  ].join("\n\n");
}

function formatItem(item: LearnReportItem): string {
  const heading = [
    kindLabel(item.kind),
    authorLabel(item.author),
    statusLabel(item.status, item.dismissed),
    item.createdAt.slice(0, 10),
    ...(item.kind === "line" ? [lineLocation(item)] : [])
  ].join(" · ");
  const details = [
    `Worktree ${inlineCode(item.worktreePath)}`,
    `target ${inlineCode(item.targetLabel)}`,
    `id ${inlineCode(item.id)}`,
    ...(item.previousPath !== null && item.previousPath !== item.path
      ? [`renamed from ${inlineCode(item.previousPath)}`]
      : [])
  ].join(" · ");

  return [
    `#### ${heading}`,
    details,
    "",
    fencedBlock(splitLines(item.body)),
    "",
    formatExcerpt(item)
  ].join("\n");
}

function formatExcerpt(item: LearnReportItem): string {
  if (item.excerptSource === "not_looked_up")
    return "Excerpt: not looked up (Git lookup limit reached).";
  if (item.excerptSource === "unavailable" || item.excerpt === null)
    return "Excerpt: unavailable.";

  const label =
    item.excerptSource === "approximate"
      ? `Excerpt (approximate, from commit ${item.excerptCommit ?? "unknown"}):`
      : `Excerpt (${item.excerptSource}):`;
  const truncated =
    item.excerpt.kind !== "files" && item.excerpt.truncated
      ? "\n(excerpt truncated)"
      : "";

  return `${label}\n${fencedBlock(excerptLines(item.excerpt))}${truncated}`;
}

function excerptLines(excerpt: FeedbackExcerpt): readonly string[] {
  switch (excerpt.kind) {
    case "lines": {
      const width = Math.max(
        ...excerpt.lines.map((line) => String(line.lineNumber).length)
      );

      return excerpt.lines.map(
        (line) =>
          `${line.kind === "commented" ? ">" : " "} ${String(line.lineNumber).padStart(width, " ")} | ${line.text}`
      );
    }
    case "patch":
      return excerpt.lines;
    case "files":
      return [
        ...excerpt.files.map(
          (file) =>
            `${flatten(file.path)} +${String(file.additions)} -${String(file.deletions)}`
        ),
        ...(excerpt.omittedFiles > 0
          ? [`and ${String(excerpt.omittedFiles)} more files`]
          : [])
      ];
  }
}

function formatEarlierItems(items: readonly LearnReportEarlierItem[]): string {
  const heading = "## Earlier feedback (before last run)";

  if (items.length === 0) return `${heading}\n\nNo earlier feedback.`;

  const lines = items.map((item) => {
    const fields = [
      item.path === null ? "Overall notes" : inlineCode(item.path),
      authorLabel(item.author),
      statusLabel(item.status, item.dismissed),
      item.createdAt.slice(0, 10),
      inlineCode(item.id)
    ].join(" · ");

    return `- ${fields}: ${inlineCode(item.bodyFirstLine.slice(0, EARLIER_BODY_MAX_CHARS))}`;
  });

  return [heading, "", ...lines].join("\n");
}

function kindLabel(kind: LearnReportItemKind): string {
  if (kind === "line") return "line comment";
  if (kind === "file") return "file comment";
  return "review note";
}

function authorLabel(author: ReviewFeedbackActor): string {
  return author.kind === "human" ? "human" : `agent ${inlineCode(author.name)}`;
}

function statusLabel(status: LearnStatus, dismissed: boolean): string {
  return dismissed && status !== "dismissed" ? `${status} · dismissed` : status;
}

function lineLocation(item: LearnReportItem): string {
  if (item.side === null || item.lineStart === null) return "lines unknown";
  const end = item.lineEnd ?? item.lineStart;
  const range =
    end === item.lineStart
      ? String(item.lineStart)
      : `${String(item.lineStart)}-${String(end)}`;

  return `${item.side} ${range}`;
}

function excerptSourceLabel(source: LearnExcerptSource): string {
  return source === "not_looked_up" ? "not looked up" : source;
}

function splitLines(text: string): readonly string[] {
  return text.split(/\r\n|\r|\n/u);
}

function flatten(text: string): string {
  return text.replace(/\r\n|\r|\n/gu, " ");
}

function longestBacktickRun(text: string): number {
  return Math.max(0, ...(text.match(/`+/gu) ?? []).map((run) => run.length));
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
