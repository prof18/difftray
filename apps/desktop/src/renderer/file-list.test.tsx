import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  CollapsedRail,
  DiffTargetControl,
  FileButton,
  FileListHeader,
  commitOptionLabel,
  selectedCommitOptions
} from "./file-list.js";

describe("file list components", () => {
  it("renders file list header counts, branch target, and progress text", () => {
    const html = renderToStaticMarkup(
      <FileListHeader
        attentionCount={1}
        baseRefDraft="origin/main"
        branchRefs={["origin/main", "develop"]}
        commitRefDraft="def456"
        disabled={false}
        files={[
          reviewFile("src/pending.ts"),
          reviewFile("src/reviewed.ts", { reviewed: true }),
          reviewFile("src/changed.ts", { invalidated: true, reviewed: true })
        ]}
        onBaseRefDraftChange={vi.fn()}
        onCommitRefDraftChange={vi.fn()}
        onCollapse={vi.fn()}
        onRefresh={vi.fn()}
        onUseBranchDiff={vi.fn()}
        onUseCommitDiff={vi.fn()}
        onUseWorkingTreeDiff={vi.fn()}
        progress={{
          reviewedVisibleFiles: 1,
          totalVisibleReviewableFiles: 3
        }}
        reviewTarget={{
          baseRefName: "origin/main",
          headRefName: "feature/sidebar",
          headSha: "abc123",
          id: "target-branch",
          kind: "branch"
        }}
        recentCommits={[
          {
            authoredAt: "2026-01-01T00:00:00.000Z",
            sha: "def456",
            shortSha: "def456",
            subject: "Change file list"
          }
        ]}
      />
    );

    expect(html).toContain("<span>3</span> changed");
    expect(html).toContain("<span>1</span> need attention");
    expect(html).toContain("origin/main");
    expect(html).toContain("Choose diff target");
    expect(html).not.toContain("develop");
    expect(html).not.toContain("def456 Change file list");
    expect(html).toContain("1 of 3 files reviewed");
    expect(html).toContain('aria-label="Refresh project"');
    expect(html).toContain('aria-label="Hide file list"');
  });

  it("renders the target picker popover with separated modes", () => {
    const html = renderToStaticMarkup(
      <DiffTargetControl
        baseRefDraft="main"
        branchRefs={["main", "origin/main"]}
        commitRefDraft="def456"
        disabled={false}
        onBaseRefDraftChange={vi.fn()}
        onCommitRefDraftChange={vi.fn()}
        onUseBranchDiff={vi.fn()}
        onUseCommitDiff={vi.fn()}
        onUseWorkingTreeDiff={vi.fn()}
        initialOpen={true}
        mode="branch"
        reviewTarget={{
          baseRefName: "main",
          headRefName: "feature/review",
          headSha: "abc123",
          id: "target-branch",
          kind: "branch"
        }}
        recentCommits={[
          {
            authoredAt: "2026-01-02T00:00:00.000Z",
            sha: "def456",
            shortSha: "def456",
            subject: "Recent change"
          }
        ]}
      />
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain("Git changes");
    expect(html).toContain("Branch");
    expect(html).toContain("Commit");
    expect(html).toContain('aria-label="Search branches"');
    expect(html).toContain("origin/main");
    expect(html).not.toContain("def456 Recent change");
  });

  it("renders commit mode with a sha entry and recent commits", () => {
    const html = renderToStaticMarkup(
      <DiffTargetControl
        baseRefDraft="main"
        branchRefs={["main"]}
        commitRefDraft="def456"
        disabled={false}
        onBaseRefDraftChange={vi.fn()}
        onCommitRefDraftChange={vi.fn()}
        onUseBranchDiff={vi.fn()}
        onUseCommitDiff={vi.fn()}
        onUseWorkingTreeDiff={vi.fn()}
        initialOpen={true}
        mode="commit"
        reviewTarget={{
          commitSha: "def456",
          commitShortSha: "def456",
          commitSubject: "Recent change",
          headSha: "def456",
          id: "target-commit",
          kind: "commit"
        }}
        recentCommits={[
          {
            authoredAt: "2026-01-02T00:00:00.000Z",
            sha: "def456",
            shortSha: "def456",
            subject: "Recent change"
          }
        ]}
      />
    );

    expect(html).toContain('aria-label="Commit SHA or ref"');
    expect(html).toContain('<button aria-selected="false"');
    expect(html).toContain('<button aria-selected="true" class="_diffTargetTab_');
    expect(html).toContain("Use");
    expect(html).toContain("<span>Recent change</span>");
    expect(html).toContain("def456");
    expect(html).toContain("Recent change");
  });

  it("labels a selected commit outside the recent commit window", () => {
    const commits = selectedCommitOptions(
      [
        {
          authoredAt: "2026-01-02T00:00:00.000Z",
          sha: "def456",
          shortSha: "def456",
          subject: "Recent change"
        }
      ],
      {
        commitSha: "abc123",
        commitShortSha: "abc123",
        commitSubject: "Older change",
        headSha: "abc123",
        id: "target-commit",
        kind: "commit"
      }
    );

    expect(commits.map(commitOptionLabel)).toEqual([
      "abc123 Selected: Older change",
      "def456 Recent change"
    ]);
  });

  it("renders collapsed rail file states and progress", () => {
    const html = renderToStaticMarkup(
      <CollapsedRail
        files={[
          reviewFile("pending.ts"),
          reviewFile("reviewed.ts", { reviewed: true }),
          reviewFile("changed.ts", { invalidated: true, reviewed: true })
        ]}
        onExpand={vi.fn()}
        progress={{
          reviewedVisibleFiles: 1,
          totalVisibleReviewableFiles: 3
        }}
      />
    );

    expect(html).toContain('aria-label="Collapsed file list"');
    expect(html).toContain('aria-label="Show file list"');
    expect(html).toContain('data-state="pending"');
    expect(html).toContain('data-state="reviewed"');
    expect(html).toContain('data-state="attention"');
    expect(html).toContain("1 / 3 reviewed");
  });

  it("renders file buttons with path parts, comments, invalidation, and stats", () => {
    const html = renderToStaticMarkup(
      <FileButton
        commentCount={2}
        file={reviewFile("src/renderer/App.tsx", {
          additions: 7,
          deletions: 4,
          invalidated: true,
          reviewed: true
        })}
        isSelected={true}
        onSelect={vi.fn()}
        position={2}
        total={5}
      />
    );

    expect(html).toContain('aria-label="App.tsx modified changed after review"');
    expect(html).toContain('aria-posinset="2"');
    expect(html).toContain('aria-setsize="5"');
    expect(html).toContain('data-selected="true"');
    expect(html).toContain("App.tsx");
    expect(html).toContain("src/renderer");
    expect(html).toContain("Review comments");
    expect(html).toContain(">2</span>");
    expect(html).toContain("+7");
    expect(html).toContain("-4");
  });
});

function reviewFile(path: string, patch: Partial<ReviewFileView> = {}): ReviewFileView {
  return {
    additions: 1,
    deletions: 0,
    diffHash: `hash-${path}`,
    diffLoaded: false,
    generated: false,
    invalidated: false,
    path,
    reviewable: true,
    reviewed: false,
    status: "modified",
    visible: true,
    ...patch
  };
}
