import { BoundedLruCache } from "../bounded-lru-cache.js";

export class CompanionWorkspaceCache<Value> {
  readonly #cache = new BoundedLruCache<string, Value>(3);
  readonly #generations = new Map<string, number>();

  constructor(private readonly loadFresh: (projectId: string) => Promise<Value>) {}

  async load(projectId: string): Promise<Value> {
    const cached = this.#cache.get(projectId);
    if (cached !== undefined) return cached;
    const generation = this.#generations.get(projectId) ?? 0;
    const value = await this.loadFresh(projectId);
    if ((this.#generations.get(projectId) ?? 0) === generation) {
      this.#cache.set(projectId, value);
    }
    return value;
  }

  invalidate(projectId: string): void {
    this.#cache.delete(projectId);
    this.#generations.set(projectId, (this.#generations.get(projectId) ?? 0) + 1);
  }

  async refresh(projectId: string): Promise<Value> {
    this.invalidate(projectId);
    return this.load(projectId);
  }
}
