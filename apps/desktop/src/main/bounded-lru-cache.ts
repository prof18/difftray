export class BoundedLruCache<Key, Value> {
  readonly #entries = new Map<Key, Value>();

  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error("Cache capacity must be a positive integer");
    }
  }

  get(key: Key): Value | undefined {
    const value = this.#entries.get(key);
    if (value === undefined) return undefined;
    this.#entries.delete(key);
    this.#entries.set(key, value);
    return value;
  }

  set(key: Key, value: Value): void {
    this.#entries.delete(key);
    this.#entries.set(key, value);
    while (this.#entries.size > this.capacity) {
      const oldest = this.#entries.keys().next().value;
      if (oldest === undefined) break;
      this.#entries.delete(oldest);
    }
  }

  delete(key: Key): void {
    this.#entries.delete(key);
  }

  get size(): number {
    return this.#entries.size;
  }
}
