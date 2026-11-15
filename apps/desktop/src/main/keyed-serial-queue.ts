/**
 * Runs async tasks one after another per key, in call order. Tasks for
 * different keys run independently. A failed task does not block the tasks
 * queued after it, and a key is dropped once its queue drains.
 *
 * Mark and unmark for the same project go through one of these, so a slow
 * unmark cannot finish after a later mark and delete it.
 */
export class KeyedSerialQueue {
  private readonly tails = new Map<string, Promise<unknown>>();

  get size(): number {
    return this.tails.size;
  }

  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const result = previous.then(task, task);
    const tail = result.then(
      () => undefined,
      () => undefined
    );

    this.tails.set(key, tail);
    void tail.then(() => {
      if (this.tails.get(key) === tail) {
        this.tails.delete(key);
      }
    });

    return result;
  }
}
