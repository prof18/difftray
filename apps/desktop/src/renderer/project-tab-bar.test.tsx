import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ProjectTabBar, type ProjectTabBarProps } from "./project-tab-bar.js";

describe("ProjectTabBar", () => {
  it("renders project tabs with review counts and active controls", () => {
    const html = renderToStaticMarkup(
      <ProjectTabBar
        {...projectTabBarProps({
          activeProjectId: "repo-one",
          activeProjectHasWorktreeSiblings: true,
          projects: [
            project("repo-one", "Repo One", {
              attentionCount: 0,
              progress: {
                reviewedVisibleFiles: 2,
                totalVisibleReviewableFiles: 3
              }
            }),
            project("repo-two", "Repo Two", {
              attentionCount: 1,
              progress: {
                reviewedVisibleFiles: 1,
                totalVisibleReviewableFiles: 5
              }
            })
          ]
        })}
      />
    );

    expect(html).toContain("Repo One");
    expect(html).toContain("Repo Two");
    expect(html).toContain("2/3");
    expect(html).toContain("1/5");
    expect(html).toContain('aria-label="Close repository"');
    expect(html).toContain('aria-label="Open repository"');
    expect(html).toContain('aria-label="Worktrees for Repo One"');
    expect(html).toContain(">Worktrees<");
    expect(html).toContain('aria-label="Repository actions for Repo One"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('role="menu"');
    expect(html).toContain('data-project-tab-strip="true"');
    expect(html).toContain('data-repository-actions="true"');
    expect(html).toContain("Show in Finder");
    expect(html).toContain("Forget Repository…");
    expect(html).not.toContain('aria-label="Project settings"');
  });

  it("renders active tab loading status instead of review count", () => {
    const html = renderToStaticMarkup(
      <ProjectTabBar
        {...projectTabBarProps({
          activeProjectId: "repo-one",
          loadingStatus: {
            detail: "3 / 10 files",
            loadedFiles: 3,
            title: "Loading repository",
            totalFiles: 10
          },
          projects: [project("repo-one", "Repo One")]
        })}
      />
    );

    expect(html).toContain("Repo One");
    expect(html).toContain("3/10");
    expect(html).toContain("3 / 10 files");
  });

  it("hides the worktree action until sibling worktrees are available", () => {
    const hiddenHtml = renderToStaticMarkup(
      <ProjectTabBar
        {...projectTabBarProps({
          activeProjectId: "repo-one",
          activeProjectHasWorktreeSiblings: false,
          projects: [project("repo-one", "Repo One")]
        })}
      />
    );
    const visibleHtml = renderToStaticMarkup(
      <ProjectTabBar
        {...projectTabBarProps({
          activeProjectId: "repo-one",
          activeProjectHasWorktreeSiblings: true,
          projects: [project("repo-one", "Repo One")]
        })}
      />
    );

    expect(hiddenHtml).not.toContain(">Worktrees<");
    expect(visibleHtml).toContain('aria-label="Worktrees for Repo One"');
  });

  it("labels secondary worktrees with their parent repository", () => {
    const worktree = {
      ...project("agent-cli", "agent-cli"),
      repositoryName: "feed-flow",
      worktreeName: "agent-cli"
    } satisfies RecentProjectView;
    const html = renderToStaticMarkup(
      <ProjectTabBar
        {...projectTabBarProps({
          activeProjectId: worktree.id,
          activeProjectHasWorktreeSiblings: true,
          projects: [project("feed-flow", "feed-flow"), worktree]
        })}
      />
    );

    expect(html).toContain('data-worktree-tab="true"');
    expect(html).toContain(
      'aria-label="feed-flow / agent-cli · /workspace/agent-cli · Review status not loaded"'
    );
    expect(html).toContain('data-tab-repository-name="true">feed-flow</span>');
    expect(html).toContain('data-tab-worktree-name="true">agent-cli</span>');
    expect(html).toContain("folder-git-2");
    expect(html).toContain('aria-label="Worktrees for feed-flow"');
  });
});

function project(
  id: string,
  name: string,
  reviewSummary?: ProjectReviewSummaryView
): RecentProjectView {
  return {
    id,
    name,
    path: `/workspace/${id}`,
    ...(reviewSummary ? { reviewSummary } : {})
  };
}

function projectTabBarProps(props: Partial<ProjectTabBarProps> = {}): ProjectTabBarProps {
  return {
    activeProjectId: "repo-one",
    disabled: false,
    onCloseActiveProject: vi.fn(),
    onForgetActiveProject: vi.fn(),
    onOpenActiveProjectInFinder: vi.fn(),
    onOpenActiveProjectWorktrees: vi.fn(),
    onOpenProject: vi.fn(),
    onRefreshActiveProject: vi.fn(),
    onReorderProjects: vi.fn(),
    onCommitProjectOrder: vi.fn(),
    onSelectProject: vi.fn(),
    projects: [],
    summaryLoadingProjectIds: new Set(),
    ...props
  };
}
