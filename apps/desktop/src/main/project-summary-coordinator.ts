export type SummaryCoordinatorOptions<TSummary> = {
  readonly concurrency?: number;
  readonly load: (projectId: string) => Promise<TSummary | null>;
  readonly onLoaded?: (projectId: string, summary: TSummary | null) => void;
};

export class ProjectSummaryCoordinator<TSummary> {
  readonly #cache = new Map<string, TSummary | null>();
  readonly #concurrency: number;
  readonly #generations = new Map<string, number>();
  readonly #load: (projectId: string) => Promise<TSummary | null>;
  readonly #onLoaded: ((projectId: string, summary: TSummary | null) => void) | undefined;
  readonly #pending = new Map<string, number>();
  readonly #activeByProject = new Map<string, number>();
  readonly #queue: { readonly projectId: string; readonly token: number }[] = [];
  readonly #refreshAfterPending = new Set<string>();
  readonly #idleWaiters = new Set<() => void>();
  #active = 0;
  #drainScheduled = false;
  #nextToken = 0;

  constructor(options: SummaryCoordinatorOptions<TSummary>) {
    this.#concurrency = Math.max(1, Math.floor(options.concurrency ?? 2));
    this.#load = options.load;
    this.#onLoaded = options.onLoaded;
  }

  get(projectId: string): TSummary | null | undefined {
    return this.#cache.get(projectId);
  }

  isPending(projectId: string): boolean {
    return this.#pending.has(projectId);
  }

  /** Exposes retained state counts for diagnostics and regression tests. */
  get sizesForDiagnostics(): { cache: number; generations: number } {
    return { cache: this.#cache.size, generations: this.#generations.size };
  }

  queueMissing(projectIds: readonly string[], limit = 20): number {
    const boundedLimit = Math.max(0, Math.floor(limit));
    let queued = 0;

    for (const projectId of projectIds) {
      if (queued >= boundedLimit) break;
      if (this.#cache.has(projectId) || this.#pending.has(projectId)) continue;

      this.queue(projectId);
      queued += 1;
    }

    return queued;
  }

  queue(
    projectId: string,
    options: { readonly priority?: "high"; readonly refresh?: boolean } = {}
  ): void {
    if (this.#pending.has(projectId)) {
      if (options.refresh) {
        this.invalidate(projectId);
        const isQueued = this.#queue.some((task) => task.projectId === projectId);
        if (!isQueued) this.#refreshAfterPending.add(projectId);
      }
      return;
    }
    if (options.refresh) this.invalidate(projectId);
    if (this.#cache.has(projectId)) return;

    const task = { projectId, token: ++this.#nextToken };
    this.#pending.set(projectId, task.token);
    if (options.priority === "high") this.#queue.unshift(task);
    else this.#queue.push(task);
    this.#scheduleDrain();
  }

  invalidate(projectId: string): void {
    this.#cache.delete(projectId);
    this.#generations.set(projectId, (this.#generations.get(projectId) ?? 0) + 1);
    this.#cleanupGeneration(projectId);
  }

  cancel(projectId: string): void {
    this.invalidate(projectId);
    const index = this.#queue.findIndex((task) => task.projectId === projectId);
    if (index >= 0) this.#queue.splice(index, 1);
    this.#pending.delete(projectId);
    this.#refreshAfterPending.delete(projectId);
    this.#resolveIdleIfNeeded();
    this.#cleanupGeneration(projectId);
  }

  whenIdle(): Promise<void> {
    if (this.#active === 0 && this.#queue.length === 0) return Promise.resolve();

    return new Promise<void>((resolve) => this.#idleWaiters.add(resolve));
  }

  async loadAll(
    projectIds: readonly string[]
  ): Promise<readonly (TSummary | null | undefined)[]> {
    for (const projectId of projectIds) {
      this.queue(projectId);
    }

    await this.whenIdle();
    return projectIds.map((projectId) => this.get(projectId));
  }

  #scheduleDrain(): void {
    if (this.#drainScheduled) return;
    this.#drainScheduled = true;
    queueMicrotask(() => {
      this.#drainScheduled = false;
      this.#drain();
    });
  }

  #drain(): void {
    while (this.#active < this.#concurrency) {
      const task = this.#queue.shift();
      if (!task) break;
      const { projectId, token } = task;

      const generation = this.#generations.get(projectId) ?? 0;
      this.#active += 1;
      this.#activeByProject.set(
        projectId,
        (this.#activeByProject.get(projectId) ?? 0) + 1
      );
      void this.#load(projectId)
        .then((summary) => {
          if ((this.#generations.get(projectId) ?? 0) === generation) {
            this.#cache.set(projectId, summary);
            this.#onLoaded?.(projectId, summary);
          }
        })
        .catch(() => undefined)
        .finally(() => {
          this.#active -= 1;
          const activeCount = (this.#activeByProject.get(projectId) ?? 1) - 1;
          if (activeCount > 0) this.#activeByProject.set(projectId, activeCount);
          else this.#activeByProject.delete(projectId);
          if (this.#pending.get(projectId) === token) {
            this.#pending.delete(projectId);
            if (this.#refreshAfterPending.delete(projectId)) {
              this.queue(projectId);
            }
          }
          this.#drain();
          this.#resolveIdleIfNeeded();
          this.#cleanupGeneration(projectId);
        });
    }

    this.#resolveIdleIfNeeded();
  }

  #cleanupGeneration(projectId: string): void {
    if (this.#pending.has(projectId) || this.#activeByProject.has(projectId)) return;
    if (this.#queue.some((task) => task.projectId === projectId)) return;
    this.#generations.delete(projectId);
  }

  #resolveIdleIfNeeded(): void {
    if (this.#active > 0 || this.#queue.length > 0) return;
    this.#idleWaiters.forEach((resolve) => resolve());
    this.#idleWaiters.clear();
  }
}
