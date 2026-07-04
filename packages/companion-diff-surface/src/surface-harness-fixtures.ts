import type { ReviewCommentView } from "@difftray/companion-protocol";

import type { DiffSurfaceHostMessage } from "./surface-bridge.js";
import { diffSurfaceThemeTokens } from "./surface-theme.js";

export type DiffSurfaceHarnessAction = {
  readonly detail: string;
  readonly label: string;
  readonly message: DiffSurfaceHostMessage;
};

export const harnessXssFixtureText =
  '<img src=x onerror="window.__difftrayHarnessXss = true">';

export function createDiffSurfaceHarnessActions(): readonly DiffSurfaceHarnessAction[] {
  return [
    {
      detail: "Apply light theme, unified mode, and line wrapping.",
      label: "Init",
      message: {
        diffMode: "unified",
        kind: "init",
        theme: diffSurfaceThemeTokens("light"),
        wrapLines: true
      }
    },
    {
      detail: "Load the HTML escaping fixture with one persisted comment.",
      label: "Show file",
      message: createFixtureShowFileMessage()
    },
    {
      detail: "Replace comments without changing the active file.",
      label: "Set comments",
      message: {
        comments: [fixtureComment({ body: "Updated from browser harness" })],
        kind: "set_comments"
      }
    },
    {
      detail: "Switch the surface into split mode.",
      label: "Set split mode",
      message: {
        diffMode: "split",
        kind: "set_diff_mode"
      }
    },
    {
      detail: "Highlight a draft review range on the additions side.",
      label: "Set draft",
      message: {
        draft: { lineEnd: 4, lineStart: 4, side: "additions" },
        kind: "set_draft"
      }
    }
  ];
}

export function createLargeFixtureShowFileMessage(): DiffSurfaceHostMessage {
  return {
    comments: [],
    diffHash: "harness-large-5000",
    kind: "show_file",
    patch: createLargeFixturePatch({ changedLines: 5_000 }),
    path: "src/large-fixture.ts"
  };
}

export function createLargeFixturePatch({
  changedLines
}: {
  readonly changedLines: number;
}): string {
  const lines = [
    "diff --git a/src/large-fixture.ts b/src/large-fixture.ts",
    "--- a/src/large-fixture.ts",
    "+++ b/src/large-fixture.ts",
    `@@ -0,0 +1,${String(changedLines)} @@`
  ];

  for (let index = 0; index < changedLines; index += 1) {
    const lineIndex = String(index);

    lines.push(`+export const value${lineIndex} = "after-${lineIndex}";`);
  }

  return lines.join("\n");
}

function createFixtureShowFileMessage(): DiffSurfaceHostMessage {
  return {
    comments: [fixtureComment({})],
    diffHash: "harness-xss-fixture",
    kind: "show_file",
    newText: [
      'export const title = "Difftray Companion";',
      `export const escaped = '${harnessXssFixtureText}';`,
      "export const next = true;",
      "export const reviewed = true;"
    ].join("\n"),
    oldText: [
      'export const title = "Difftray";',
      "export const next = false;",
      "export const reviewed = false;"
    ].join("\n"),
    patch: [
      "diff --git a/src/harness-fixture.ts b/src/harness-fixture.ts",
      "--- a/src/harness-fixture.ts",
      "+++ b/src/harness-fixture.ts",
      "@@ -1,3 +1,4 @@",
      '-export const title = "Difftray";',
      '+export const title = "Difftray Companion";',
      `+export const escaped = '${harnessXssFixtureText}';`,
      "-export const next = false;",
      "+export const next = true;",
      "-export const reviewed = false;",
      "+export const reviewed = true;"
    ].join("\n"),
    path: "src/harness-fixture.ts"
  };
}

function fixtureComment({
  body = "Confirm the escaped HTML stays text-only."
}: {
  readonly body?: string;
}): ReviewCommentView {
  return {
    body,
    createdAt: "2026-07-03T00:00:00.000Z",
    diffHash: "harness-xss-fixture",
    id: "harness-comment-1",
    lineEnd: 4,
    lineStart: 4,
    path: "src/harness-fixture.ts",
    side: "additions",
    updatedAt: "2026-07-03T00:00:00.000Z"
  };
}
