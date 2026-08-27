import type { ProjectReviewSummaryView, RecentProjectView } from "../view-models.js";

export type CompanionProjectListOptions = {
  readonly cacheTtlMs?: number;
  readonly listProjects: () => readonly RecentProjectView[];
  readonly loadSummary: (projectId: string) => Promise<ProjectReviewSummaryView | null>;
  readonly now?: () => number;
  readonly onSummaryUpdated: (projectId: string) => void;
};

type CachedSummary = {
  readonly generation: number;
  readonly loadedAt: number;
  readonly value: ProjectReviewSummaryView | null;
};

const defaultCacheTtlMs = 15_000;

export class CompanionProjectList {
  private readonly generations = new Map<string, number>();
  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly options: CompanionProjectListOptions;
  private readonly projects = new Map<string, RecentProjectView>();
  private readonly summaries = new Map<string, CachedSummary>();

  constructor(options: CompanionProjectListOptions) {
    this.options = options;
  }

  list(): readonly RecentProjectView[] {
    const projects = this.options.listProjects();
    const projectIds = new Set(projects.map((project) => project.id));
    const previousProjectIds = new Set(this.projects.keys());

    this.projects.clear();
    for (const project of projects) {
      this.projects.set(project.id, project);
    }

    for (const projectId of previousProjectIds) {
      if (!projectIds.has(projectId)) {
        this.remove(projectId);
      }
    }

    for (const project of projects) {
      const cached = this.summaries.get(project.id);
      const cacheAge = this.now() - (cached?.loadedAt ?? 0);

      if (!cached || cacheAge >= (this.options.cacheTtlMs ?? defaultCacheTtlMs)) {
        this.loadInBackground(project.id);
      }
    }

    return projects.map((project) => {
      const summary = this.summaries.get(project.id)?.value;

      return summary ? { ...project, reviewSummary: summary } : project;
    });
  }

  invalidate(projectId: string): void {
    this.generations.set(projectId, (this.generations.get(projectId) ?? 0) + 1);

    if (this.projects.has(projectId)) {
      this.loadInBackground(projectId);
    }
  }

  remove(projectId: string): void {
    this.projects.delete(projectId);
    this.summaries.delete(projectId);
    const removedInFlightLoad = this.inFlight.delete(projectId);
    this.generations.set(projectId, (this.generations.get(projectId) ?? 0) + 1);

    if (!removedInFlightLoad) {
      this.generations.delete(projectId);
    }
  }

  private loadInBackground(projectId: string): void {
    if (this.inFlight.has(projectId)) {
      return;
    }

    const generation = this.generations.get(projectId) ?? 0;
    const promise = this.options
      .loadSummary(projectId)
      .then(
        (summary) => {
          if (
            this.projects.has(projectId) &&
            (this.generations.get(projectId) ?? 0) === generation
          ) {
            const previous = this.summaries.get(projectId)?.value;
            this.summaries.set(projectId, {
              generation,
              loadedAt: this.now(),
              value: summary
            });

            if (!summariesEqual(previous, summary)) {
              try {
                this.options.onSummaryUpdated(projectId);
              } catch {
                // Summary delivery is best effort; the cache remains available.
              }
            }
          }
        },
        () => {
          if (
            this.projects.has(projectId) &&
            (this.generations.get(projectId) ?? 0) === generation
          ) {
            const previous = this.summaries.get(projectId)?.value ?? null;
            this.summaries.set(projectId, {
              generation,
              loadedAt: this.now(),
              value: previous
            });
          }
        }
      )
      .finally(() => {
        if (this.inFlight.get(projectId) === promise) {
          this.inFlight.delete(projectId);
        }

        if (!this.projects.has(projectId)) {
          this.generations.delete(projectId);
          return;
        }

        const currentGeneration = this.generations.get(projectId) ?? 0;

        if (
          currentGeneration !== generation &&
          this.summaries.get(projectId)?.generation !== currentGeneration
        ) {
          this.loadInBackground(projectId);
        }
      });

    this.inFlight.set(projectId, promise);
  }

  private now(): number {
    return (this.options.now ?? Date.now)();
  }
}

function summariesEqual(
  left: ProjectReviewSummaryView | null | undefined,
  right: ProjectReviewSummaryView | null
): boolean {
  if (!left || !right) {
    return left === right;
  }

  return (
    left.attentionCount === right.attentionCount &&
    left.progress.reviewedVisibleFiles === right.progress.reviewedVisibleFiles &&
    left.progress.totalVisibleReviewableFiles ===
      right.progress.totalVisibleReviewableFiles
  );
}
