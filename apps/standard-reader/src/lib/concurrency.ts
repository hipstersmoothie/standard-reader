/**
 * Bounded-concurrency helpers for background work.
 *
 * Network fan-out over a list (resolving hundreds of labelers, hydrating
 * profiles) is too slow one at a time and too rude all at once. These keep a
 * fixed number of workers busy instead.
 */

/**
 * Map over `items` with at most `limit` concurrent calls, preserving order.
 *
 * `fn` is expected to handle its own failures — a rejection aborts the whole
 * map, so callers that want per-item tolerance should catch inside `fn` and
 * return a sentinel.
 */
export async function mapWithConcurrency<T, R>(
  items: Array<T>,
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<Array<R>> {
  if (items.length === 0) return [];
  const out: Array<R> = Array.from({ length: items.length });
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      out[index] = await fn(items[index] as T, index);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, worker),
  );
  return out;
}

/** Split `items` into chunks of at most `size`. */
export function chunk<T>(items: Array<T>, size: number): Array<Array<T>> {
  const out: Array<Array<T>> = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
