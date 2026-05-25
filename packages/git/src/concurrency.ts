export async function mapWithConcurrency<T, U>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<U>
): Promise<readonly U[]> {
  if (items.length === 0) {
    return [];
  }

  const concurrency = Math.max(1, Math.floor(limit));
  const results: U[] = new Array<U>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;

      if (index >= items.length) {
        return;
      }

      results[index] = await mapper(items[index] as T, index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );

  return results;
}
