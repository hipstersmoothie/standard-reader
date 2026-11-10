/**
 * Insert into an insertion-ordered cache, evicting the oldest entries.
 *
 * Re-setting a key moves it to the newest slot, so a hot key that keeps being
 * refreshed survives while one-off keys age out. Module-level caches keyed by
 * user-controlled values (URIs, session tokens, rendered text) must go through
 * this — a plain `Map#set` grows for the life of the process.
 */
export function setCapped<K, V>(
  cache: Map<K, V>,
  key: K,
  value: V,
  max: number,
): void {
  cache.delete(key);
  cache.set(key, value);
  for (const oldest of cache.keys()) {
    if (cache.size <= max) break;
    cache.delete(oldest);
  }
}
