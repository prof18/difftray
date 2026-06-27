import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ProjectTabBar, type ProjectTabBarProps } from "./project-tab-bar.js";

describe("ProjectTabBar", () => {
  it("renders project tabs with review counts and active controls", () => {
    const html = renderToStaticMarkup(
      <ProjectTabBar
        {...projectTabBarProps({
          activeProjectId: "repo-one",
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
    expect(html).toContain('aria-label="Project settings"');
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
    onOpenProject: vi.fn(),
    onOpenSettings: vi.fn(),
    onReorderProjects: vi.fn(),
    onCommitProjectOrder: vi.fn(),
    onSelectProject: vi.fn(),
    projects: [],
    summaryLoadingProjectIds: new Set(),
    ...props
  };
}
